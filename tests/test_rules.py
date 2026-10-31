import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "gateway"))

from prism_rules import Context, decide, validate
from advisor import build_advisory, template_justification


def mk(**kw):
    base = dict(m=45, T=30, RH=50)
    base.update(kw)
    return Context(**base)


def test_spec_example_urgent_irrigate():
    d = decide(mk(m=38.0, T=32, RH=44))
    assert d.action == "IRRIGATE" and d.reason == "R4" and d.priority == "URGENT"
    assert d.minutes == 26 or d.minutes == 25 or d.minutes == 26  # deficit 51 mm / 2.0
    assert d.valve_allowed


def test_rain_blocks_irrigation():
    d = decide(mk(m=30, rain_prob=80))
    assert d.action == "NO_IRRIGATION" and d.reason == "R1" and not d.valve_allowed


def test_upper_band_suppresses_valve():
    d = decide(mk(m=72))
    assert d.action == "NO_IRRIGATION" and d.reason == "R2" and not d.valve_allowed


def test_comfortable_no_irrigation():
    assert decide(mk(m=58)).reason == "R3"


def test_stale_data_holds():
    d = decide(mk(m=30, data_age_min=90))
    assert d.action == "HOLD" and d.confidence == "Low"


def test_heat_increases_duration():
    cool = decide(mk(m=42, T=28, RH=50)).minutes
    hot = decide(mk(m=42, T=38, RH=25)).minutes
    assert hot > cool


def test_daily_cap():
    d = decide(mk(m=30, already_irrigated_min_today=60))
    assert d.action == "NO_IRRIGATION" and d.reason == "R10"
    d = decide(mk(m=30, already_irrigated_min_today=40))
    assert d.minutes <= 20


def test_low_battery_warning_and_cached_forecast_confidence():
    d = decide(mk(m=45, batt=3.3, forecast_fresh=False))
    assert "node battery low" in d.warnings and d.confidence == "Medium"


def test_validate():
    ok = {"soil_moisture_pct": 40, "air_temp_c": 30, "rh_pct": 50}
    assert validate(ok)
    assert not validate({**ok, "soil_moisture_pct": 140})
    assert not validate({"air_temp_c": 30})


def test_template_fallback_keeps_rule_fields():
    c = mk(m=38, T=33, RH=42)
    d = decide(c)
    adv, meta = build_advisory(c, d, use_llm=False)
    assert meta["source"] == "template"
    assert adv["duration_min"] == d.minutes and adv["timing_window"] == d.window
    assert "38%" in adv["justification"]


if __name__ == "__main__":
    tests = [
        test_spec_example_urgent_irrigate,
        test_rain_blocks_irrigation,
        test_upper_band_suppresses_valve,
        test_comfortable_no_irrigation,
        test_stale_data_holds,
        test_heat_increases_duration,
        test_daily_cap,
        test_low_battery_warning_and_cached_forecast_confidence,
        test_validate,
        test_template_fallback_keeps_rule_fields,
    ]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"PASS: {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"FAIL: {t.__name__}: {e}")
    print(f"\n{passed}/{len(tests)} tests passed.")
