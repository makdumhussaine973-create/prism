/**
 * PRISM 7-Day Precision vs. Manual Simulation Engine
 * Direct implementation of gateway/simulate.py
 * Soil model: ET loss + drip gain + rain bucket model.
 */

import {
  BAND_LOW,
  BAND_HIGH,
  APP_RATE_MM_PER_MIN,
  ROOT_DEPTH_MM,
  decide,
} from './prismRules';
import { buildAdvisory } from './advisor';
import { Context, SimulationRunOutput, SimulationStep } from '../types/prism';

export const STEP_MIN = 15;
export const DAYS = 7;

// Simple seeded pseudo-random generator
function createRng(seed: number = 1) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function calculateWeather(t: Date, rng: () => number, heatwaveOffset: number = 0) {
  const h = t.getHours() + t.getMinutes() / 60;
  const T = 29 + heatwaveOffset + 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + (rng() - 0.5);
  const RH = Math.max(25, Math.min(95, 60 - 1.8 * (T - 29) * 3 + (rng() * 4 - 2)));
  return { T: parseFloat(T.toFixed(1)), RH: parseFloat(RH.toFixed(1)) };
}

export function etMmPerStep(T: number): number {
  return Math.max(0.0, (0.12 + 0.012 * (T - 20))) * (STEP_MIN / 60); // mm per step
}

export interface SimulationParams {
  seed?: number;
  initialMoisture?: number;
  rainDay4Mm?: number;
  heatwaveOffset?: number;
  appRateMmPerMin?: number;
  rootDepthMm?: number;
}

export function runFullSimulation(params: SimulationParams = {}): SimulationRunOutput {
  const {
    seed = 1,
    initialMoisture = 62.0,
    rainDay4Mm = 12.0,
    heatwaveOffset = 0,
    appRateMmPerMin = APP_RATE_MM_PER_MIN,
    rootDepthMm = ROOT_DEPTH_MM,
  } = params;

  const totalSteps = (DAYS * 24 * 60) / STEP_MIN;

  // Run Manual simulation
  const rngManual = createRng(seed);
  let mManual = initialMoisture;
  let manualWaterMin = 0;
  let manualInBand = 0;
  let manualIrrigatingLeft = 0;
  let manualCycles = 0;

  // Run PRISM simulation
  const rngPrism = createRng(seed);
  let mPrism = initialMoisture;
  let prismWaterMin = 0;
  let prismInBand = 0;
  let prismIrrigatingLeft = 0;
  let prismCycles = 0;
  let prismLastSlot: string | null = null;
  const latencies: number[] = [];

  const rainByDay: Record<number, number> = { 4: rainDay4Mm };
  const steps: SimulationStep[] = [];

  // Start at 2026-11-02 00:00 (matching simulation spec)
  const baseDate = new Date(Date.UTC(2026, 10, 2, 0, 0, 0));

  let dayPrism = 2;
  let todayMinPrism = 0;

  for (let s = 0; s < totalSteps; s++) {
    const t = new Date(baseDate.getTime() + s * STEP_MIN * 60 * 1000);
    const dayOfMonth = t.getUTCDate();
    const dayIndex = Math.floor(s / ((24 * 60) / STEP_MIN)) + 1;
    const hour = t.getUTCHours();
    const minute = t.getUTCMinutes();
    const timeStr = `Day ${dayIndex} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Weather calculations
    const weatherManual = calculateWeather(t, rngManual, heatwaveOffset);
    const weatherPrism = calculateWeather(t, rngPrism, heatwaveOffset);

    // Daily reset for PRISM
    if (dayOfMonth !== dayPrism) {
      dayPrism = dayOfMonth;
      todayMinPrism = 0;
    }

    // Rain calculation (between 10:00 and 16:00 on scheduled rain days)
    const dailyRain = rainByDay[dayIndex] || 0;
    const isRainingTime = hour >= 10 && hour < 16;
    const rainPerStep = isRainingTime ? dailyRain / ((6 * 60) / STEP_MIN) : 0;

    // --- 1. Manual Bucket Update ---
    const etManual = etMmPerStep(weatherManual.T);
    mManual = Math.max(
      0,
      Math.min(
        100,
        mManual -
          (etManual / rootDepthMm) * 100 * 6 +
          (rainPerStep / rootDepthMm) * 100 * 6
      )
    );

    // Manual control: fixed 35 min daily at 06:00
    if (hour === 6 && minute === 0) {
      manualIrrigatingLeft = 35;
      manualCycles++;
    }

    let waterAppliedManualStep = 0;
    let irrigatingManualNow = false;
    if (manualIrrigatingLeft > 0) {
      const runMin = Math.min(STEP_MIN, manualIrrigatingLeft);
      manualIrrigatingLeft -= runMin;
      manualWaterMin += runMin;
      waterAppliedManualStep = runMin;
      irrigatingManualNow = true;
      mManual = Math.min(100, mManual + (runMin * appRateMmPerMin / rootDepthMm) * 100);
    }

    if (mManual >= BAND_LOW && mManual <= BAND_HIGH) {
      manualInBand++;
    }

    // --- 2. PRISM Bucket Update ---
    const etPrism = etMmPerStep(weatherPrism.T);
    mPrism = Math.max(
      0,
      Math.min(
        100,
        mPrism -
          (etPrism / rootDepthMm) * 100 * 6 +
          (rainPerStep / rootDepthMm) * 100 * 6
      )
    );

    // PRISM decision check at decision slots (05:00, 06:00, 17:00) when idle
    const currentSlot = `${dayIndex}-${hour}`;
    if (minute === 0 && (hour === 5 || hour === 6 || hour === 17) && currentSlot !== prismLastSlot && prismIrrigatingLeft <= 0) {
      prismLastSlot = currentSlot;
      // Tomorrow rain check
      const tomorrowRain = rainByDay[dayIndex] || 0;
      const ctx: Context = {
        m: parseFloat(mPrism.toFixed(1)),
        T: parseFloat(weatherPrism.T.toFixed(1)),
        RH: parseFloat(weatherPrism.RH.toFixed(1)),
        rain24h_mm: tomorrowRain,
        rain_prob: tomorrowRain >= 5 ? 90 : 5,
        batt: 3.9,
        data_age_min: 1,
        already_irrigated_min_today: todayMinPrism,
        now: t,
        valid: true,
      };

      const dec = decide(ctx);
      const { meta } = buildAdvisory(ctx, dec);
      latencies.push(meta.latency_s);

      if (dec.valve_allowed && dec.minutes > 0) {
        prismIrrigatingLeft = dec.minutes;
        todayMinPrism += dec.minutes;
        prismCycles++;
      }
    }

    let waterAppliedPrismStep = 0;
    let irrigatingPrismNow = false;
    if (prismIrrigatingLeft > 0) {
      const runMin = Math.min(STEP_MIN, prismIrrigatingLeft);
      prismIrrigatingLeft -= runMin;
      prismWaterMin += runMin;
      waterAppliedPrismStep = runMin;
      irrigatingPrismNow = true;
      mPrism = Math.min(100, mPrism + (runMin * appRateMmPerMin / rootDepthMm) * 100);
    }

    if (mPrism >= BAND_LOW && mPrism <= BAND_HIGH) {
      prismInBand++;
    }

    // Record step every 15 minutes (or sample)
    steps.push({
      step: s,
      timeStr,
      day: dayIndex,
      hour,
      minute,
      T: weatherPrism.T,
      RH: weatherPrism.RH,
      rain_mm: rainPerStep,
      m_manual: parseFloat(mManual.toFixed(1)),
      m_prism: parseFloat(mPrism.toFixed(1)),
      irrigating_manual: irrigatingManualNow,
      irrigating_prism: irrigatingPrismNow,
      water_applied_step_prism: waterAppliedPrismStep,
      water_applied_step_manual: waterAppliedManualStep,
      et_loss_mm: parseFloat(etPrism.toFixed(2)),
    });
  }

  // Calculate comparative statistics
  const timeInBandManualPct = (100 * manualInBand) / totalSteps;
  const timeInBandPrismPct = (100 * prismInBand) / totalSteps;
  const savingPct = 100 * (1 - prismWaterMin / manualWaterMin);

  latencies.sort((a, b) => a - b);
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0.042;

  // Convert minutes to approximate liters (assuming 2.0 mm/min on standard 100m² test plot = 200 L/min)
  const LITERS_PER_MIN = 200;

  return {
    manual: {
      water_min: Math.round(manualWaterMin),
      time_in_band_pct: parseFloat(timeInBandManualPct.toFixed(1)),
      total_water_liters: Math.round(manualWaterMin * LITERS_PER_MIN),
      cycles: manualCycles,
    },
    prism: {
      water_min: Math.round(prismWaterMin),
      time_in_band_pct: parseFloat(timeInBandPrismPct.toFixed(1)),
      median_latency_s: medianLatency,
      total_water_liters: Math.round(prismWaterMin * LITERS_PER_MIN),
      cycles: prismCycles,
    },
    saving_pct: parseFloat(savingPct.toFixed(1)),
    in_band_pass: timeInBandPrismPct >= 90.0,
    water_saving_pass: savingPct >= 30.0,
    steps,
  };
}
