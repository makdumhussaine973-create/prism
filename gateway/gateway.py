"""PRISM edge gateway: MQTT ingest -> rules -> advisory -> SQLite -> dashboard.
Run: python gateway.py (needs Mosquitto on localhost)
     python gateway.py --no-mqtt (dashboard only; use simulate.py to feed data)
"""
from __future__ import annotations
import argparse
import json
import sqlite3
import threading
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from prism_rules import Context, decide, validate
from advisor import build_advisory, format_advisory

DB_PATH = Path(__file__).with_name("prism.db")
IST = timezone(timedelta(hours=5, minutes=30))
_lock = threading.Lock()
FORECAST = {"rain24h_mm": 0.0, "rain_prob": 0.0, "fetched": 0.0}
USE_LLM = False


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS readings(id INTEGER PRIMARY KEY, node_id TEXT, ts TEXT,
        soil_moisture_pct REAL, soil_temp_c REAL, air_temp_c REAL, rh_pct REAL,
        soil_ph REAL, battery_v REAL, buffered INTEGER, raw TEXT);
        CREATE TABLE IF NOT EXISTS advisories(id INTEGER PRIMARY KEY, node_id TEXT, ts TEXT,
        latency_s REAL, source TEXT, advisory TEXT);
        CREATE TABLE IF NOT EXISTS irrigation(id INTEGER PRIMARY KEY, node_id TEXT, ts TEXT, minutes REAL);
        """)


def irrigated_today(node_id: str) -> float:
    today = datetime.now(IST).strftime("%Y-%m-%d")
    with db() as con:
        r = con.execute("SELECT COALESCE(SUM(minutes),0) s FROM irrigation WHERE node_id=? AND ts LIKE ?",
                        (node_id, today + "%")).fetchone()
        return float(r["s"]) if r else 0.0


def process(payload: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now(IST)
    ok = validate(payload)
    try:
        ts = datetime.fromisoformat(payload["ts"])
        age = max(0.0, (now - ts).total_seconds() / 60)
    except Exception:
        age = 9999
    forecast_fresh = (time.time() - FORECAST["fetched"]) < 24 * 3600 and FORECAST["fetched"] > 0
    node = payload.get("node_id", "unknown")
    ctx = Context(
        m=payload.get("soil_moisture_pct", 0), T=payload.get("air_temp_c", 0),
        RH=payload.get("rh_pct", 0), rain24h_mm=FORECAST["rain24h_mm"],
        rain_prob=FORECAST["rain_prob"], batt=payload.get("battery_v", 4.0),
        data_age_min=0 if payload.get("buffered") else age,
        forecast_fresh=forecast_fresh, already_irrigated_min_today=irrigated_today(node),
        now=now, soil_temp=payload.get("soil_temp_c"), ph=payload.get("soil_ph"), valid=ok)
    dec = decide(ctx)
    adv, meta = build_advisory(ctx, dec, use_llm=USE_LLM)
    adv.update(node_id=node, issued=now.isoformat(timespec="seconds"), **meta)
    with _lock, db() as con:
        con.execute("INSERT INTO readings(node_id,ts,soil_moisture_pct,soil_temp_c,air_temp_c,rh_pct,"
                    "soil_ph,battery_v,buffered,raw) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (node, payload.get("ts"), payload.get("soil_moisture_pct"), payload.get("soil_temp_c"),
                     payload.get("air_temp_c"), payload.get("rh_pct"), payload.get("soil_ph"),
                     payload.get("battery_v"), int(bool(payload.get("buffered"))), json.dumps(payload)))
        con.execute("INSERT INTO advisories(node_id,ts,latency_s,source,advisory) VALUES(?,?,?,?,?)",
                    (node, adv["issued"], meta["latency_s"], meta["source"], json.dumps(adv)))
        if adv["valve_allowed"] and adv["duration_min"] > 0:
            con.execute("INSERT INTO irrigation(node_id,ts,minutes) VALUES(?,?,?)",
                        (node, adv["issued"], adv["duration_min"]))
    return adv


if __name__ == "__main__":
    init_db()
    sample = {"node_id": "prism-n01", "ts": datetime.now(IST).isoformat(), "soil_moisture_pct": 38.0,
              "air_temp_c": 32.0, "rh_pct": 44.0, "battery_v": 3.9}
    res = process(sample)
    print(format_advisory(res, "prism-n01", res["issued"]))
