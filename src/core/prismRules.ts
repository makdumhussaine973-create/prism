/**
 * PRISM rule layer: deterministic safety rules (spec Section 4.1).
 * The rule layer decides action, duration, window and confidence.
 * The AI layer may only explain these values, never change them.
 */

import { Context, Decision } from '../types/prism';

export const BAND_LOW = 40.0;
export const BAND_HIGH = 70.0;
export const SETPOINT = 55.0;
export const COMFORT = 50.0;
export const ROOT_DEPTH_MM = 300.0;
export const APP_RATE_MM_PER_MIN = 2.0; // drip application rate; calibrate per zone
export const MIN_MIN = 5;
export const MAX_MIN = 60;
export const DAILY_CAP_MIN = 60;
export const STALE_MIN = 60;
export const BATT_LOW_V = 3.5;

/** Spec Section 3 validity filter */
export function validate(raw: Record<string, any>): boolean {
  try {
    if (raw === null || raw === undefined) return false;
    const m = raw.soil_moisture_pct;
    const t = raw.air_temp_c;
    const rh = raw.rh_pct;

    if (typeof m !== 'number' || typeof t !== 'number' || typeof rh !== 'number') {
      return false;
    }

    return (
      m >= 0 && m <= 100 &&
      t >= -10 && t <= 60 &&
      rh >= 0 && rh <= 100
    );
  } catch {
    return false;
  }
}

/** Rule 8: Irrigation timing window */
export function windowForTime(now?: Date | null, urgent: boolean = false): string {
  const morning = '05:30-08:00';
  const evening = '17:30-19:00';

  if (!now) {
    return morning;
  }

  const hm = now.getHours() * 60 + now.getMinutes();
  if (hm < 8 * 60) {
    return morning;
  }
  return urgent || hm < 19 * 60 ? evening : morning; // next morning if late
}

/** Deterministic Decision Function R0-R10 */
export function decide(c: Context): Decision {
  const trace: string[] = [];
  const warnings: string[] = [];
  const forecastFresh = c.forecast_fresh !== false;
  const initialConfidence = forecastFresh ? 'High' : 'Medium';

  const d: Decision = {
    action: 'NO_IRRIGATION',
    minutes: 0,
    window: 'n/a',
    confidence: initialConfidence,
    priority: 'NORMAL',
    reason: '',
    warnings,
    trace,
    valve_allowed: false,
  };

  const isValid = c.valid !== false;
  const dataAge = c.data_age_min ?? 0;

  // R0: stale or invalid data
  if (!isValid || dataAge > STALE_MIN) {
    d.action = 'HOLD';
    d.confidence = 'Low';
    d.reason = 'R0';
    trace.push(
      `R0 fired: data invalid or older than ${STALE_MIN} min (age ${dataAge.toFixed(0)} min) -> HOLD`
    );
    return d;
  }
  trace.push(`R0 not fired: data fresh (${dataAge.toFixed(0)} min)`);

  // Battery check (R9)
  const batt = c.batt ?? 4.0;
  if (batt < BATT_LOW_V) {
    warnings.push('node battery low');
    trace.push(`R9 fired: battery ${batt.toFixed(2)} V < ${BATT_LOW_V} V`);
  }

  // R1: rain predicted
  const rain24h = c.rain24h_mm ?? 0.0;
  const rainProb = c.rain_prob ?? 0.0;
  if (rain24h >= 5 || rainProb >= 70) {
    d.reason = 'R1';
    trace.push(
      `R1 fired: rain24h=${rain24h} mm, prob=${rainProb.toFixed(0)}% -> NO_IRRIGATION`
    );
    return d;
  }
  trace.push(`R1 not fired: rain24h=${rain24h} mm, prob=${rainProb.toFixed(0)}%`);

  // R2: above band
  if (c.m >= BAND_HIGH) {
    d.reason = 'R2';
    trace.push(
      `R2 fired: m=${c.m.toFixed(1)}% >= ${BAND_HIGH}% -> NO_IRRIGATION, valve suppressed`
    );
    return d;
  }
  trace.push(`R2 not fired: m=${c.m.toFixed(1)}% < ${BAND_HIGH}%`);

  // R3: comfortable
  if (c.m >= COMFORT) {
    d.reason = 'R3';
    trace.push(
      `R3 fired: m=${c.m.toFixed(1)}% >= ${COMFORT}% -> NO_IRRIGATION`
    );
    return d;
  }

  // R4 / R5
  const urgent = c.m < BAND_LOW;
  d.action = 'IRRIGATE';
  d.priority = urgent ? 'URGENT' : 'NORMAL';
  d.reason = urgent ? 'R4' : 'R5';
  trace.push(
    `${d.reason} fired: m=${c.m.toFixed(1)}% ${
      urgent ? '< ' + BAND_LOW : 'in 40-50'
    } -> IRRIGATE (${d.priority})`
  );

  // R6: ET adjustment
  let factor = 1.0;
  if (c.T > 35 || c.RH < 30) {
    factor = 1.2;
    trace.push(`R6 fired: T=${c.T}C RH=${c.RH}% -> duration x1.2`);
  } else if (c.T < 20) {
    factor = 0.8;
    trace.push(`R6 fired: T=${c.T}C -> duration x0.8`);
  } else {
    trace.push(`R6 not fired: T=${c.T}C RH=${c.RH}%`);
  }

  // R7: duration
  const deficit_mm = ((SETPOINT - c.m) / 100.0) * ROOT_DEPTH_MM;
  const base = deficit_mm / APP_RATE_MM_PER_MIN;
  let minutes = Math.max(MIN_MIN, Math.min(MAX_MIN, Math.round(base * factor)));
  trace.push(
    `R7: deficit=(${SETPOINT}-${c.m.toFixed(1)})/100 x ${ROOT_DEPTH_MM.toFixed(
      0
    )} = ${deficit_mm.toFixed(1)} mm; base ${base.toFixed(1)} min x ${factor} -> ${minutes} min`
  );

  // R10: daily cap
  const alreadyIrrigated = c.already_irrigated_min_today ?? 0;
  const remaining = DAILY_CAP_MIN - alreadyIrrigated;
  if (remaining <= 0) {
    d.action = 'NO_IRRIGATION';
    d.minutes = 0;
    d.reason = 'R10';
    trace.push('R10 fired: daily cap reached -> NO_IRRIGATION');
    return d;
  }

  if (minutes > remaining) {
    minutes = Math.floor(remaining);
    trace.push(`R10 fired: capped to ${minutes} min (daily cap ${DAILY_CAP_MIN})`);
  } else {
    trace.push(
      `R10: daily cap OK (${alreadyIrrigated.toFixed(0)}/${DAILY_CAP_MIN} min used)`
    );
  }

  d.minutes = Math.floor(minutes);
  d.window = windowForTime(c.now, urgent); // R8
  trace.push(`R8: window ${d.window}`);
  d.valve_allowed = true;

  return d;
}
