"""PRISM rule layer: deterministic safety rules (spec Section 4.1).
The rule layer decides action, duration, window and confidence. The AI layer
may only explain these values, never change them.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Optional

BAND_LOW = 40.0
BAND_HIGH = 70.0
SETPOINT = 55.0
COMFORT = 50.0
ROOT_DEPTH_MM = 300.0
APP_RATE_MM_PER_MIN = 2.0  # drip application rate; calibrate per zone
MIN_MIN, MAX_MIN = 5, 60
DAILY_CAP_MIN = 60
STALE_MIN = 60
BATT_LOW_V = 3.5


@dataclass
class Context:
    m: float                     # soil moisture %
    T: float                     # air temp C
    RH: float                    # relative humidity %
    rain24h_mm: float = 0.0
    rain_prob: float = 0.0       # %
    batt: float = 4.0
    data_age_min: float = 0.0
    forecast_fresh: bool = True
    already_irrigated_min_today: float = 0.0
    now: Optional[datetime] = None
    soil_temp: Optional[float] = None
    ph: Optional[float] = None
    valid: bool = True


@dataclass
class Decision:
    action: str                  # IRRIGATE | NO_IRRIGATION | HOLD
    minutes: int = 0
    window: str = "n/a"
    confidence: str = "High"
    priority: str = "NORMAL"
    reason: str = ""
    warnings: List[str] = field(default_factory=list)
    trace: List[str] = field(default_factory=list)
    valve_allowed: bool = False

    def as_dict(self):
        return asdict(self)


def validate(raw: dict) -> bool:
    """Spec Section 3 validity filter."""
    try:
        return (0 <= raw["soil_moisture_pct"] <= 100
                and -10 <= raw["air_temp_c"] <= 60
                and 0 <= raw["rh_pct"] <= 100)
    except (KeyError, TypeError):
        return False


def _window(now: Optional[datetime], urgent: bool) -> str:
    morning, evening = "05:30-08:00", "17:30-19:00"
    if now is None:
        return morning
    hm = now.hour * 60 + now.minute
    if hm < 8 * 60:
        return morning
    return evening if urgent or hm < 19 * 60 else morning  # next morning if late


def decide(c: Context) -> Decision:
    d = Decision(action="NO_IRRIGATION")
    t = d.trace

    # Confidence (spec): High fresh all; Medium cached forecast; Low stale/invalid
    d.confidence = "High" if c.forecast_fresh else "Medium"

    # R0: stale or invalid data
    if (not c.valid) or c.data_age_min > STALE_MIN:
        d.action, d.confidence, d.reason = "HOLD", "Low", "R0"
        t.append(f"R0 fired: data invalid or older than {STALE_MIN} min "
                 f"(age {c.data_age_min:.0f} min) -> HOLD")
        return d
    t.append(f"R0 not fired: data fresh ({c.data_age_min:.0f} min)")

    if c.batt < BATT_LOW_V:
        d.warnings.append("node battery low")
        t.append(f"R9 fired: battery {c.batt:.2f} V < {BATT_LOW_V} V")

    # R1: rain predicted
    if c.rain24h_mm >= 5 or c.rain_prob >= 70:
        d.reason = "R1"
        t.append(f"R1 fired: rain24h={c.rain24h_mm} mm, prob={c.rain_prob:.0f}% "
                 "-> NO_IRRIGATION")
        return d
    t.append(f"R1 not fired: rain24h={c.rain24h_mm} mm, prob={c.rain_prob:.0f}%")

    # R2: above band
    if c.m >= BAND_HIGH:
        d.reason = "R2"
        t.append(f"R2 fired: m={c.m:.1f}% >= {BAND_HIGH}% -> NO_IRRIGATION, valve suppressed")
        return d
    t.append(f"R2 not fired: m={c.m:.1f}% < {BAND_HIGH}%")

    # R3: comfortable
    if c.m >= COMFORT:
        d.reason = "R3"
        t.append(f"R3 fired: m={c.m:.1f}% >= {COMFORT}% -> NO_IRRIGATION")
        return d

    # R4 / R5
    urgent = c.m < BAND_LOW
    d.action = "IRRIGATE"
    d.priority = "URGENT" if urgent else "NORMAL"
    d.reason = "R4" if urgent else "R5"
    t.append(f"{d.reason} fired: m={c.m:.1f}% "
             f"{'< ' + str(BAND_LOW) if urgent else 'in 40-50'} -> IRRIGATE ({d.priority})")

    # R6: ET adjustment
    factor = 1.0
    if c.T > 35 or c.RH < 30:
        factor = 1.2
        t.append(f"R6 fired: T={c.T}C RH={c.RH}% -> duration x1.2")
    elif c.T < 20:
        factor = 0.8
        t.append(f"R6 fired: T={c.T}C -> duration x0.8")
    else:
        t.append(f"R6 not fired: T={c.T}C RH={c.RH}%")

    # R7: duration
    deficit_mm = (SETPOINT - c.m) / 100.0 * ROOT_DEPTH_MM
    base = deficit_mm / APP_RATE_MM_PER_MIN
    minutes = max(MIN_MIN, min(MAX_MIN, round(base * factor)))
    t.append(f"R7: deficit=({SETPOINT}-{c.m:.1f})/100 x {ROOT_DEPTH_MM:.0f} = "
             f"{deficit_mm:.1f} mm; base {base:.1f} min x {factor} -> {minutes} min")

    # R10: daily cap
    remaining = DAILY_CAP_MIN - c.already_irrigated_min_today
    if remaining <= 0:
        d.action, d.minutes, d.reason = "NO_IRRIGATION", 0, "R10"
        t.append("R10 fired: daily cap reached -> NO_IRRIGATION")
        return d
    if minutes > remaining:
        minutes = int(remaining)
        t.append(f"R10 fired: capped to {minutes} min (daily cap {DAILY_CAP_MIN})")
    else:
        t.append(f"R10: daily cap OK ({c.already_irrigated_min_today:.0f}/{DAILY_CAP_MIN} min used)")

    d.minutes = int(minutes)
    d.window = _window(c.now, urgent)  # R8
    t.append(f"R8: window {d.window}")
    d.valve_allowed = True
    return d
