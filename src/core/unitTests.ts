/**
 * PRISM Unit Test Suite - Mirrors tests/test_rules.py exactly
 */

import { Context, UnitTestResult } from '../types/prism';
import { decide, validate } from './prismRules';
import { buildAdvisory } from './advisor';

function mk(overrides: Partial<Context> = {}): Context {
  const base: Context = {
    m: 45,
    T: 30,
    RH: 50,
    valid: true,
    data_age_min: 0,
    forecast_fresh: true,
    batt: 4.0,
    rain24h_mm: 0,
    rain_prob: 0,
    already_irrigated_min_today: 0,
  };
  return { ...base, ...overrides };
}

export function runAllRuleTests(): UnitTestResult[] {
  const results: UnitTestResult[] = [];

  // Test 1: Spec Example Urgent Irrigate
  {
    const start = performance.now();
    try {
      const c = mk({ m: 38.0, T: 32, RH: 44 });
      const d = decide(c);
      const passed =
        d.action === 'IRRIGATE' &&
        d.reason === 'R4' &&
        d.priority === 'URGENT' &&
        (d.minutes === 26 || d.minutes === 25) &&
        d.valve_allowed === true;
      results.push({
        name: 'test_spec_example_urgent_irrigate',
        description: 'Moisture 38% triggers urgent irrigation R4 with 25-26 min runtime and valve enabled',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { action: d.action, reason: d.reason, priority: d.priority, minutes: d.minutes, valve_allowed: d.valve_allowed },
      });
    } catch (err: any) {
      results.push({
        name: 'test_spec_example_urgent_irrigate',
        description: 'Moisture 38% triggers urgent irrigation R4',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 2: Rain Blocks Irrigation
  {
    const start = performance.now();
    try {
      const c = mk({ m: 30, rain_prob: 80 });
      const d = decide(c);
      const passed =
        d.action === 'NO_IRRIGATION' &&
        d.reason === 'R1' &&
        !d.valve_allowed;
      results.push({
        name: 'test_rain_blocks_irrigation',
        description: 'Rain forecast (prob >= 70%) triggers R1 lock and suppresses valve even if dry',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { action: d.action, reason: d.reason, valve_allowed: d.valve_allowed },
      });
    } catch (err: any) {
      results.push({
        name: 'test_rain_blocks_irrigation',
        description: 'Rain blocks irrigation',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 3: Upper Band Suppresses Valve
  {
    const start = performance.now();
    try {
      const c = mk({ m: 72 });
      const d = decide(c);
      const passed =
        d.action === 'NO_IRRIGATION' &&
        d.reason === 'R2' &&
        !d.valve_allowed;
      results.push({
        name: 'test_upper_band_suppresses_valve',
        description: 'Moisture >= 70% fires R2 to prevent waterlogging and suppresses valve',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { action: d.action, reason: d.reason, valve_allowed: d.valve_allowed },
      });
    } catch (err: any) {
      results.push({
        name: 'test_upper_band_suppresses_valve',
        description: 'Upper band suppresses valve',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 4: Comfortable No Irrigation
  {
    const start = performance.now();
    try {
      const c = mk({ m: 58 });
      const d = decide(c);
      const passed = d.reason === 'R3' && d.action === 'NO_IRRIGATION';
      results.push({
        name: 'test_comfortable_no_irrigation',
        description: 'Moisture in comfort zone (50-70%) fires R3 with no irrigation required',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { action: d.action, reason: d.reason },
      });
    } catch (err: any) {
      results.push({
        name: 'test_comfortable_no_irrigation',
        description: 'Comfortable no irrigation',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 5: Stale Data Holds
  {
    const start = performance.now();
    try {
      const c = mk({ m: 30, data_age_min: 90 });
      const d = decide(c);
      const passed = d.action === 'HOLD' && d.confidence === 'Low' && d.reason === 'R0';
      results.push({
        name: 'test_stale_data_holds',
        description: 'Telemetry older than 60 minutes triggers R0 HOLD state with Low confidence',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { action: d.action, confidence: d.confidence, reason: d.reason },
      });
    } catch (err: any) {
      results.push({
        name: 'test_stale_data_holds',
        description: 'Stale data holds',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 6: Heat Increases Duration (ET R6)
  {
    const start = performance.now();
    try {
      const cool = decide(mk({ m: 42, T: 28, RH: 50 })).minutes;
      const hot = decide(mk({ m: 42, T: 38, RH: 25 })).minutes;
      const passed = hot > cool;
      results.push({
        name: 'test_heat_increases_duration',
        description: 'High heat (T>35C) & low humidity (RH<30%) scale duration by 1.2x (R6)',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { coolMinutes: cool, hotMinutes: hot, difference: hot - cool },
      });
    } catch (err: any) {
      results.push({
        name: 'test_heat_increases_duration',
        description: 'Heat increases duration',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 7: Daily Cap (R10)
  {
    const start = performance.now();
    try {
      const d1 = decide(mk({ m: 30, already_irrigated_min_today: 60 }));
      const p1 = d1.action === 'NO_IRRIGATION' && d1.reason === 'R10';
      const d2 = decide(mk({ m: 30, already_irrigated_min_today: 40 }));
      const p2 = d2.minutes <= 20;
      results.push({
        name: 'test_daily_cap',
        description: 'Enforces 60-min daily cap: blocks if cap reached, caps remainder if near limit',
        passed: p1 && p2,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { at60MinUsed: d1.action, at40MinUsedMinutes: d2.minutes },
      });
    } catch (err: any) {
      results.push({
        name: 'test_daily_cap',
        description: 'Daily cap enforcement',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 8: Low Battery Warning & Cached Forecast Confidence
  {
    const start = performance.now();
    try {
      const c = mk({ m: 45, batt: 3.3, forecast_fresh: false });
      const d = decide(c);
      const passed =
        d.warnings.includes('node battery low') && d.confidence === 'Medium';
      results.push({
        name: 'test_low_battery_warning_and_cached_forecast_confidence',
        description: 'Battery < 3.5V appends R9 warning and stale forecast drops confidence to Medium',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { warnings: d.warnings, confidence: d.confidence },
      });
    } catch (err: any) {
      results.push({
        name: 'test_low_battery_warning_and_cached_forecast_confidence',
        description: 'Battery warning and confidence drop',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 9: Input Validity Filter
  {
    const start = performance.now();
    try {
      const ok = { soil_moisture_pct: 40, air_temp_c: 30, rh_pct: 50 };
      const p1 = validate(ok) === true;
      const p2 = validate({ ...ok, soil_moisture_pct: 140 }) === false;
      const p3 = validate({ air_temp_c: 30 }) === false;
      results.push({
        name: 'test_validate',
        description: 'Rejects out-of-bounds readings (moisture [0,100], temp [-10,60], RH [0,100])',
        passed: p1 && p2 && p3,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { validSample: p1, outOfBoundsSample: !p2, incompleteSample: !p3 },
      });
    } catch (err: any) {
      results.push({
        name: 'test_validate',
        description: 'Input validation',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  // Test 10: Template Fallback Keeps Rule Fields
  {
    const start = performance.now();
    try {
      const c = mk({ m: 38, T: 33, RH: 42 });
      const d = decide(c);
      const { advisory, meta } = buildAdvisory(c, d, { source: 'template' });
      const passed =
        meta.source === 'template' &&
        advisory.duration_min === d.minutes &&
        advisory.timing_window === d.window &&
        advisory.justification.includes('38%');
      results.push({
        name: 'test_template_fallback_keeps_rule_fields',
        description: 'Template justification preserves exact rule minutes & timing window with 38% sensor citing',
        passed,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details: { source: meta.source, duration: advisory.duration_min, window: advisory.timing_window, justification: advisory.justification },
      });
    } catch (err: any) {
      results.push({
        name: 'test_template_fallback_keeps_rule_fields',
        description: 'Template fallback invariants',
        passed: false,
        error: err.message,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  }

  return results;
}
