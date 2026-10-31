"""Simulate a PRISM node and run the pipeline without hardware.
  python simulate.py           # 7-day offline sim, PRISM vs manual control, prints metrics
  python simulate.py --post URL # also POST each reading to a running gateway /api/ingest

Soil model is a simple bucket: ET loss + drip gain + rain. It is a logic check
for the rules, NOT a substitute for the field validation in spec Section 6.
"""
import argparse
import json
import math
import random
import urllib.request
from datetime import datetime, timedelta, timezone

from prism_rules import Context, decide, BAND_LOW, BAND_HIGH, APP_RATE_MM_PER_MIN, ROOT_DEPTH_MM
from advisor import build_advisory

IST = timezone(timedelta(hours=5, minutes=30))
STEP_MIN = 15
DAYS = 7


def weather(t: datetime, rng):
    h = t.hour + t.minute / 60
    T = 29 + 6 * math.sin((h - 9) / 24 * 2 * math.pi) + rng.uniform(-0.5, 0.5)
    RH = max(25, min(95, 60 - 1.8 * (T - 29) * 3 + rng.uniform(-2, 2)))
    return T, RH


def et_mm_per_step(T):
    return max(0.0, (0.12 + 0.012 * (T - 20))) * STEP_MIN / 60  # mm per step


def run(mode: str, seed=1, post=None, use_llm=False):
    rng = random.Random(seed)
    m = 62.0
    t = datetime(2026, 11, 2, 0, 0, tzinfo=IST)
    water_min, in_band, n = 0.0, 0, 0
    irrigating_left = 0.0
    lat = []
    today_min, day = 0.0, t.day
    rain_by_day = {4: 12.0}  # one rainy day (day-of-month)
    last_decision_slot = None

    for _ in range(DAYS * 24 * 60 // STEP_MIN):
        T, RH = weather(t, rng)
        if t.day != day:
            day, today_min = t.day, 0.0

        rain = rain_by_day.get(t.day, 0) / (24 * 60 / STEP_MIN) if 10 <= t.hour < 16 else 0
        m = max(0, min(100, m - et_mm_per_step(T) / ROOT_DEPTH_MM * 100 * 6 + rain / ROOT_DEPTH_MM * 100 * 6))

        # --- control ---
        if mode == "manual":
            if t.hour == 6 and t.minute == 0:
                irrigating_left = 35  # fixed daily schedule
        else:
            slot = (t.day, t.hour)
            if t.minute == 0 and t.hour in (5, 6, 17) and slot != last_decision_slot and irrigating_left <= 0:
                last_decision_slot = slot
                tomorrow_rain = rain_by_day.get((t + timedelta(days=0)).day, 0)
                ctx = Context(m=round(m, 1), T=round(T, 1), RH=round(RH, 1), rain24h_mm=tomorrow_rain,
                              rain_prob=90 if tomorrow_rain >= 5 else 5, batt=3.9, data_age_min=1,
                              already_irrigated_min_today=today_min, now=t, valid=True)
                dec = decide(ctx)
                adv, meta = build_advisory(ctx, dec, use_llm=use_llm)
                lat.append(meta["latency_s"])
                if post:
                    pl = {"node_id": "prism-sim", "ts": t.isoformat(), "soil_moisture_pct": ctx.m,
                          "air_temp_c": ctx.T, "rh_pct": ctx.RH, "battery_v": 3.9, "buffered": False}
                    urllib.request.urlopen(urllib.request.Request(
                        post, json.dumps(pl).encode(), {"Content-Type": "application/json"}))
                if dec.valve_allowed:
                    irrigating_left = dec.minutes
                    today_min += dec.minutes

        if irrigating_left > 0:
            run_min = min(STEP_MIN, irrigating_left)
            irrigating_left -= run_min
            water_min += run_min
            m = min(100, m + run_min * APP_RATE_MM_PER_MIN / ROOT_DEPTH_MM * 100)

        n += 1
        in_band += BAND_LOW <= m <= BAND_HIGH
        t += timedelta(minutes=STEP_MIN)

    return {"water_min": water_min, "time_in_band_pct": 100 * in_band / n,
            "median_latency_s": sorted(lat)[len(lat) // 2] if lat else None}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--post")
    ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()

    man = run("manual")
    pri = run("prism", post=a.post, use_llm=a.llm)
    saving = 100 * (1 - pri["water_min"] / man["water_min"])

    print(f"Manual : {man['water_min']:.0f} min, in-band {man['time_in_band_pct']:.1f}%")
    print(f"PRISM  : {pri['water_min']:.0f} min, in-band {pri['time_in_band_pct']:.1f}%, "
          f"median latency {pri['median_latency_s']}s")
    print(f"Water saving: {saving:.1f}% (target >=30%)  "
          f"in-band target >=90%: {'PASS' if pri['time_in_band_pct'] >= 90 else 'FAIL'}")
