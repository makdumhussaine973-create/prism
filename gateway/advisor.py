"""PRISM AI layer: explanatory advisory text (spec Section 4.2).
Tries a local quantized LLM via Ollama; falls back to a deterministic
template when Ollama is unreachable, output fails validation, or latency
exceeds LATENCY_BUDGET_S. The rule-layer fields are never altered.
"""
from __future__ import annotations
import json
import re
import time
import urllib.request
from typing import Tuple
from prism_rules import Context, Decision, BAND_LOW, BAND_HIGH

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen2.5:1.5b-instruct-q4_K_M"
LATENCY_BUDGET_S = 3.0

SYSTEM_PROMPT = """You are PRISM, an irrigation advisor. You receive a JSON context already decided
by safety rules. Do NOT change action, minutes, or window. Reply with ONE sentence only:
the agronomic justification, citing the triggering sensor values. Plain language, no jargon.
Example 1 (3-day outlook): {"action":"IRRIGATE","minutes":25,"window":"05:30-08:00","confidence":"High","m":38,"T":33,"RH":42}
-> Soil moisture is 38%, below the 40% minimum and air is hot (33 C), so water this morning.
Example 2 (5-day outlook): {"action":"NO_IRRIGATION","reason":"R1","m":46,"rain_prob":80}
-> Rain is 80% likely within 24 h and soil is at 46%, so skip watering and recheck tomorrow.
Example 3 (7-day outlook): {"action":"NO_IRRIGATION","reason":"R3","m":58,"T":27}
-> Soil moisture is 58%, inside the 40-70% target band, so no water is needed.
"""


def template_justification(c: Context, d: Decision) -> str:
    if d.action == "HOLD":
        return (f"Sensor data is missing or {c.data_age_min:.0f} minutes old, "
                "so no watering decision is made until fresh readings arrive.")
    if d.reason == "R1":
        return (f"Rain is {c.rain_prob:.0f}% likely ({c.rain24h_mm:g} mm) within 24 h and soil "
                f"is at {c.m:.0f}%, so skip watering and recheck tomorrow.")
    if d.reason == "R2":
        return (f"Soil moisture is {c.m:.0f}%, above the {BAND_HIGH:.0f}% upper limit, "
                "so watering is blocked to avoid waterlogging.")
    if d.reason == "R3":
        return (f"Soil moisture is {c.m:.0f}%, inside the {BAND_LOW:.0f}-{BAND_HIGH:.0f}% "
                "target band, so no water is needed.")
    if d.reason == "R10":
        return "The daily watering limit has already been reached, so no more water today."
    hot = " and air is hot (%.0f C)" % c.T if c.T > 35 else ""
    if d.reason == "R4":
        return (f"Soil moisture is {c.m:.0f}%, below the {BAND_LOW:.0f}% minimum{hot}, "
                f"so water during {d.window}.")
    return (f"Soil moisture is {c.m:.0f}% and falling toward the {BAND_LOW:.0f}% minimum"
            f"{hot}, so water during {d.window}.")


def _numbers_ok(text: str, c: Context, d: Decision) -> bool:
    """Reject LLM text whose numbers don't match the inputs (spec 4.2 validator)."""
    allowed = {c.m, c.T, c.RH, c.rain_prob, c.rain24h_mm, BAND_LOW, BAND_HIGH, 24.0,
               float(d.minutes)}
    allowed |= {round(x) for x in list(allowed)}
    for tok in re.findall(r"\d+(?:\.\d+)?", text):
        v = float(tok)
        if not any(abs(v - a) <= 1.0 for a in allowed):
            return False
    return True


def _ask_ollama(c: Context, d: Decision, timeout: float) -> str:
    ctx = {"action": d.action, "minutes": d.minutes, "window": d.window,
           "confidence": d.confidence, "reason": d.reason, "m": round(c.m),
           "T": round(c.T), "RH": round(c.RH), "rain_prob": round(c.rain_prob)}
    body = json.dumps({
        "model": MODEL, "system": SYSTEM_PROMPT, "prompt": json.dumps(ctx) + "\n->",
        "stream": False, "keep_alive": "30m",
        "options": {"temperature": 0.2, "num_predict": 60},
    }).encode()
    req = urllib.request.Request(OLLAMA_URL, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())["response"].strip().split("\n")[0]


def build_advisory(c: Context, d: Decision, use_llm: bool = True) -> Tuple[dict, dict]:
    """Return (advisory dict, meta dict with latency/source)."""
    t0 = time.perf_counter()
    why, source = None, "template"
    if use_llm:
        try:
            text = _ask_ollama(c, d, LATENCY_BUDGET_S)
            if text and len(text) < 240 and _numbers_ok(text, c, d) \
               and (time.perf_counter() - t0) <= LATENCY_BUDGET_S:
                why, source = text, "llm"
        except Exception:
            pass
    if why is None:
        why = template_justification(c, d)
    latency = time.perf_counter() - t0
    adv = {
        "action": d.action,
        "duration_min": d.minutes,
        "timing_window": d.window,
        "confidence": d.confidence,
        "justification": why,
        "warnings": d.warnings,
        "trace": d.trace,
        "valve_allowed": d.valve_allowed,
    }
    return adv, {"latency_s": round(latency, 3), "source": source}


def format_advisory(adv: dict, node_id: str = "prism-n01", issued: str = "") -> str:
    lines = [
        f"PRISM Advisory - Node {node_id} Issued: {issued}",
        "-" * 62,
        f"Recommended action : {adv['action']}",
        f"Duration           : {adv['duration_min']} minutes",
        f"Timing window      : {adv['timing_window']}",
        f"Confidence         : {adv['confidence']}",
        f"Why: {adv['justification']}",
    ]
    for w in adv["warnings"]:
        lines.append(f"Warning: {w}")
    lines.append("\nExplanation trace")
    lines += [f"  {t}" for t in adv["trace"]]
    return "\n".join(lines)
