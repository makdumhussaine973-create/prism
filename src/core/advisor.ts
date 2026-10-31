/**
 * PRISM AI layer: explanatory advisory text (spec Section 4.2).
 * Provides deterministic agronomic template justification and validator.
 * The rule-layer fields are never altered.
 */

import { Context, Decision, Advisory } from '../types/prism';
import { BAND_LOW, BAND_HIGH } from './prismRules';

export function templateJustification(c: Context, d: Decision): string {
  const age = c.data_age_min ?? 0;
  const m = c.m;
  const rainProb = c.rain_prob ?? 0;
  const rain24h = c.rain24h_mm ?? 0;
  const T = c.T;

  if (d.action === 'HOLD') {
    return `Sensor data is missing or ${age.toFixed(0)} minutes old, so no watering decision is made until fresh readings arrive.`;
  }
  if (d.reason === 'R1') {
    return `Rain is ${rainProb.toFixed(0)}% likely (${rain24h.toString()} mm) within 24 h and soil is at ${m.toFixed(0)}%, so skip watering and recheck tomorrow.`;
  }
  if (d.reason === 'R2') {
    return `Soil moisture is ${m.toFixed(0)}%, above the ${BAND_HIGH.toFixed(0)}% upper limit, so watering is blocked to avoid waterlogging.`;
  }
  if (d.reason === 'R3') {
    return `Soil moisture is ${m.toFixed(0)}%, inside the ${BAND_LOW.toFixed(0)}-${BAND_HIGH.toFixed(0)}% target band, so no water is needed.`;
  }
  if (d.reason === 'R10') {
    return 'The daily watering limit has already been reached, so no more water today.';
  }

  const hot = T > 35 ? ` and air is hot (${Math.round(T)} C)` : '';
  if (d.reason === 'R4') {
    return `Soil moisture is ${m.toFixed(0)}%, below the ${BAND_LOW.toFixed(0)}% minimum${hot}, so water during ${d.window}.`;
  }

  return `Soil moisture is ${m.toFixed(0)}% and falling toward the ${BAND_LOW.toFixed(0)}% minimum${hot}, so water during ${d.window}.`;
}

/** Reject generated text whose numbers don't match the inputs (spec 4.2 validator) */
export function numbersOk(text: string, c: Context, d: Decision): boolean {
  const allowed = new Set<number>([
    c.m,
    c.T,
    c.RH,
    c.rain_prob ?? 0,
    c.rain24h_mm ?? 0,
    BAND_LOW,
    BAND_HIGH,
    24.0,
    d.minutes,
  ]);

  // Also include rounded variants
  const initialAllowed = Array.from(allowed);
  for (const v of initialAllowed) {
    allowed.add(Math.round(v));
    allowed.add(Math.floor(v));
  }

  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches) return true;

  for (const tok of matches) {
    const num = parseFloat(tok);
    if (isNaN(num)) continue;
    let foundClose = false;
    for (const val of allowed) {
      if (Math.abs(num - val) <= 1.0) {
        foundClose = true;
        break;
      }
    }
    if (!foundClose) {
      return false;
    }
  }

  return true;
}

export function buildAdvisory(
  c: Context,
  d: Decision,
  options?: { source?: 'template' | 'llm'; latency_s?: number; customJustification?: string }
): { advisory: Advisory; meta: { latency_s: number; source: 'template' | 'llm' } } {
  const source = options?.source || 'template';
  const latency_s = options?.latency_s ?? 0.042;
  const why = options?.customJustification || templateJustification(c, d);

  const advisory: Advisory = {
    action: d.action,
    duration_min: d.minutes,
    timing_window: d.window,
    confidence: d.confidence,
    justification: why,
    warnings: [...d.warnings],
    trace: [...d.trace],
    valve_allowed: d.valve_allowed,
    source,
    latency_s,
  };

  return {
    advisory,
    meta: { latency_s, source },
  };
}

export function formatAdvisory(
  adv: Advisory,
  nodeId: string = 'prism-n01',
  issued: string = new Date().toISOString().replace('T', ' ').slice(0, 19)
): string {
  const lines = [
    `PRISM Advisory - Node ${nodeId} Issued: ${issued}`,
    '-'.repeat(62),
    `Recommended action : ${adv.action}`,
    `Duration : ${adv.duration_min} minutes`,
    `Timing window : ${adv.timing_window}`,
    `Confidence : ${adv.confidence}`,
    `Why: ${adv.justification}`,
  ];

  for (const w of adv.warnings) {
    lines.push(`Warning: ${w}`);
  }

  lines.push('\nExplanation trace');
  for (const t of adv.trace) {
    lines.push(` ${t}`);
  }

  return lines.join('\n');
}
