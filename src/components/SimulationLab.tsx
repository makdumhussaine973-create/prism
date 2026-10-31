import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Droplet,
  CloudRain,
  Sun,
  Layers,
  Info,
} from 'lucide-react';
import { runFullSimulation, SimulationParams } from '../core/simulator';
import { SimulationRunOutput, SimulationStep } from '../types/prism';
import { BAND_LOW, BAND_HIGH, SETPOINT } from '../core/prismRules';

export const SimulationLab: React.FC = () => {
  const [params, setParams] = useState<SimulationParams>({
    seed: 1,
    initialMoisture: 62.0,
    rainDay4Mm: 12.0,
    heatwaveOffset: 0,
    appRateMmPerMin: 2.0,
    rootDepthMm: 300.0,
  });

  const [output, setOutput] = useState<SimulationRunOutput | null>(null);
  const [hoveredStep, setHoveredStep] = useState<SimulationStep | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Run simulation whenever params change or on mount
  useEffect(() => {
    const res = runFullSimulation(params);
    setOutput(res);
  }, [params]);

  // Render high-res comparison canvas
  useEffect(() => {
    if (!output) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = 260;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const paddingLeft = 44;
    const paddingRight = 20;
    const paddingTop = 24;
    const paddingBottom = 32;

    const chartW = w - paddingLeft - paddingRight;
    const chartH = h - paddingTop - paddingBottom;

    const y = (val: number) => {
      const clamped = Math.max(0, Math.min(100, val));
      return paddingTop + chartH - (clamped / 100) * chartH;
    };

    const x = (index: number) => {
      return paddingLeft + (index / (output.steps.length - 1)) * chartW;
    };

    ctx.clearRect(0, 0, w, h);

    // 1. Shaded Target Band (40% to 70%)
    const y70 = y(BAND_HIGH);
    const y40 = y(BAND_LOW);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fillRect(paddingLeft, y70, chartW, y40 - y70);

    // Target band dotted borders
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y70);
    ctx.lineTo(paddingLeft + chartW, y70);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y40);
    ctx.lineTo(paddingLeft + chartW, y40);
    ctx.stroke();

    // 55% Setpoint
    const y55 = y(SETPOINT);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y55);
    ctx.lineTo(paddingLeft + chartW, y55);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Y-Axis Numerical Labels
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#78716c';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    ctx.fillText('100%', paddingLeft - 8, y(100));
    ctx.fillText('70%', paddingLeft - 8, y70);
    ctx.fillText('55%', paddingLeft - 8, y55);
    ctx.fillText('40%', paddingLeft - 8, y40);
    ctx.fillText('0%', paddingLeft - 8, y(0));

    // 3. Rain Bars on Day 4
    for (let i = 0; i < output.steps.length; i++) {
      const step = output.steps[i];
      if (step.rain_mm > 0) {
        const px = x(i);
        const barH = (step.rain_mm / 3) * chartH * 0.4;
        ctx.fillStyle = 'rgba(14, 165, 233, 0.3)';
        ctx.fillRect(px - 1, paddingTop + chartH - barH, 2, barH);
      }
    }

    // 4. Manual Control Line (Slate/Rose dashed)
    ctx.beginPath();
    ctx.moveTo(x(0), y(output.steps[0].m_manual));
    for (let i = 1; i < output.steps.length; i++) {
      ctx.lineTo(x(i), y(output.steps[i].m_manual));
    }
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 5. PRISM Control Area & Line (Vibrant Emerald)
    ctx.beginPath();
    ctx.moveTo(x(0), y(output.steps[0].m_prism));
    for (let i = 1; i < output.steps.length; i++) {
      ctx.lineTo(x(i), y(output.steps[i].m_prism));
    }
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 6. Day Separator Lines & X-Axis Labels
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.textBaseline = 'top';

    const stepsPerDay = (24 * 60) / 15;
    for (let d = 1; d <= 7; d++) {
      const stepIdx = (d - 1) * stepsPerDay;
      const px = x(stepIdx);

      // Vertical Day Guide
      ctx.strokeStyle = 'rgba(120, 113, 108, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, paddingTop);
      ctx.lineTo(px, paddingTop + chartH);
      ctx.stroke();

      ctx.textAlign = 'center';
      const labelX = px + (stepsPerDay / 2 / output.steps.length) * chartW;
      ctx.fillText(`Day ${d}`, labelX, paddingTop + chartH + 8);
    }
  }, [output]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!output || output.steps.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;

    const paddingLeft = 44;
    const paddingRight = 20;
    const chartW = rect.width - paddingLeft - paddingRight;

    if (clientX < paddingLeft || clientX > rect.width - paddingRight) {
      setHoveredStep(null);
      return;
    }

    const relX = clientX - paddingLeft;
    const index = Math.round((relX / chartW) * (output.steps.length - 1));
    const clampedIndex = Math.max(0, Math.min(output.steps.length - 1, index));
    setHoveredStep(output.steps[clampedIndex]);
  };

  if (!output) return null;

  return (
    <div className="space-y-6">
      {/* Title & Introduction */}
      <div>
        <h2 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100">
          7-Day PRISM vs. Manual Irrigation Simulation
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
          Executes the exact dual-bucket evapotranspiration model from <code className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">gateway/simulate.py</code>.
          Compares PRISM rule-driven scheduling against standard rigid daily watering (35 min at 06:00).
        </p>
      </div>

      {/* KPI Evaluation Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Water Savings % */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
            <span>Water Conserved</span>
            {output.water_saving_pass ? (
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                PASS (≥30%)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-600 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                BELOW TARGET
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {output.saving_pct}%
            </span>
            <span className="text-xs text-stone-500">less water applied</span>
          </div>
          <div className="mt-2 text-xs text-stone-500 flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
            <span>Target Spec: ≥ 30.0%</span>
            <span className="font-mono text-stone-700 dark:text-stone-300">
              +{(output.saving_pct - 30).toFixed(1)}% margin
            </span>
          </div>
        </div>

        {/* Metric 2: PRISM Time In Healthy Band */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
            <span>PRISM In-Band Time</span>
            {output.in_band_pass ? (
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                PASS (≥90%)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-600 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                FAIL
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-stone-900 dark:text-stone-100">
              {output.prism.time_in_band_pct}%
            </span>
            <span className="text-xs text-stone-500">in 40–70% target</span>
          </div>
          <div className="mt-2 text-xs text-stone-500 flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
            <span>Manual Schedule In-Band:</span>
            <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">
              {output.manual.time_in_band_pct}%
            </span>
          </div>
        </div>

        {/* Metric 3: Total Run Time */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
            <span>Irrigation Runtime</span>
            <Droplet className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-stone-900 dark:text-stone-100">
              {output.prism.water_min}
            </span>
            <span className="text-xs text-stone-500">min total</span>
          </div>
          <div className="mt-2 text-xs text-stone-500 flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
            <span>Manual: {output.manual.water_min} min</span>
            <span className="font-mono text-emerald-700 dark:text-emerald-400">
              -{output.manual.water_min - output.prism.water_min} min
            </span>
          </div>
        </div>

        {/* Metric 4: Water Volume & Cycles */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
            <span>Estimated Volume</span>
            <TrendingUp className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-stone-900 dark:text-stone-100">
              {(output.prism.total_water_liters / 1000).toFixed(0)}k
            </span>
            <span className="text-xs text-stone-500">Liters (vs {(output.manual.total_water_liters / 1000).toFixed(0)}k)</span>
          </div>
          <div className="mt-2 text-xs text-stone-500 flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
            <span>Valve Activations:</span>
            <span className="font-mono text-stone-700 dark:text-stone-300">
              {output.prism.cycles} cycles (vs {output.manual.cycles})
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Simulation Chart */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100">
              7-Day Moisture Progression Trajectory
            </h3>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              672 timesteps (15 min interval) · Soil moisture % dynamics with ET depletion and rain recharge
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-emerald-600 rounded-full inline-block" />
              <span className="text-stone-700 dark:text-stone-200 font-bold">PRISM Rule Advisory</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-stone-400 inline-block" />
              <span className="text-stone-500">Manual (35 min / day)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-sky-400/30 border border-sky-400 inline-block" />
              <span className="text-stone-500">Rainfall (Day 4)</span>
            </div>
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '260px' }}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredStep(null)}
            className="w-full block select-none cursor-crosshair"
          />

          {/* Hover Inspector Tooltip */}
          {hoveredStep && (
            <div className="mt-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
              <div>
                <span className="text-stone-500 font-sans">Timestamp: </span>
                <strong className="text-stone-900 dark:text-stone-100">{hoveredStep.timeStr}</strong>
              </div>
              <div>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">PRISM Moisture: </span>
                <span>{hoveredStep.m_prism}%</span>
                {hoveredStep.irrigating_prism && (
                  <span className="ml-1 text-sky-600 dark:text-sky-400 font-sans font-semibold">
                    (Irrigating +{hoveredStep.water_applied_step_prism}m)
                  </span>
                )}
              </div>
              <div>
                <span className="text-stone-500">Manual Moisture: </span>
                <span>{hoveredStep.m_manual}%</span>
                {hoveredStep.irrigating_manual && (
                  <span className="ml-1 text-stone-500 font-sans">
                    (Irrigating +{hoveredStep.water_applied_step_manual}m)
                  </span>
                )}
              </div>
              <div>
                <span className="text-stone-500">Weather: </span>
                <span>{hoveredStep.T}°C · {hoveredStep.RH}% RH</span>
                {hoveredStep.rain_mm > 0 && (
                  <span className="ml-1 text-sky-600 font-bold">· Rain {hoveredStep.rain_mm.toFixed(1)}mm</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scenario Controls & Physical Parameters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario Tuner */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              Weather & Rainfall Scenario
            </h4>
            <button
              onClick={() =>
                setParams({
                  seed: 1,
                  initialMoisture: 62.0,
                  rainDay4Mm: 12.0,
                  heatwaveOffset: 0,
                  appRateMmPerMin: 2.0,
                  rootDepthMm: 300.0,
                })
              }
              className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          {/* Rain on Day 4 */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-stone-600 dark:text-stone-400">Day 4 Storm Rainfall:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">{params.rainDay4Mm} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="35"
              step="1"
              value={params.rainDay4Mm}
              onChange={(e) => setParams({ ...params, rainDay4Mm: parseFloat(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>0 mm (Drought)</span>
              <span>12 mm (Default)</span>
              <span>35 mm (Heavy storm)</span>
            </div>
          </div>

          {/* Heatwave Offset */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-stone-600 dark:text-stone-400">Temperature Anomaly:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                {(params.heatwaveOffset ?? 0) > 0 ? `+${params.heatwaveOffset}°C` : `${params.heatwaveOffset ?? 0}°C`}
              </span>
            </div>
            <input
              type="range"
              min="-4"
              max="8"
              step="1"
              value={params.heatwaveOffset ?? 0}
              onChange={(e) => setParams({ ...params, heatwaveOffset: parseFloat(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>-4°C (Cool spring)</span>
              <span>0°C (Normal 29°C)</span>
              <span>+8°C (Extreme Heatwave)</span>
            </div>
          </div>

          {/* Initial Moisture */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-stone-600 dark:text-stone-400">Initial Soil Moisture:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">{params.initialMoisture}%</span>
            </div>
            <input
              type="range"
              min="30"
              max="80"
              step="1"
              value={params.initialMoisture}
              onChange={(e) => setParams({ ...params, initialMoisture: parseFloat(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Soil Physics & Application Model */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs space-y-4">
          <h4 className="font-display font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            Agronomic Soil Constants (Spec §4.1)
          </h4>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-600 dark:text-stone-400">Target Root Band:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">40.0% – 70.0%</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-600 dark:text-stone-400">Ideal Setpoint:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">55.0% moisture</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-600 dark:text-stone-400">Active Root Zone Depth:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">300.0 mm</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-600 dark:text-stone-400">Drip Application Rate:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">2.0 mm / min</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-600 dark:text-stone-400">Safety Cap Per Day:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">60 minutes</span>
            </div>
          </div>
        </div>

        {/* Agronomic Caveats & Engineering Observations */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs space-y-3">
          <h4 className="font-display font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-600" />
            Engineering Caveats & Field Validation
          </h4>
          <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            <strong>The bucket simulation is a logic check:</strong> In manual irrigation, 35 minutes of daily watering applies ~70 mm, quickly oversaturating the soil (&gt;70%) and causing hypoxia, nutrient leaching, and root rot.
          </p>
          <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            PRISM checks soil deficit twice daily (05:30 and 17:30 windows) and halts automatically before rainstorms (Day 4), achieving <strong>{output.saving_pct}% water savings</strong> while maintaining <strong>{output.prism.time_in_band_pct}% in-band stability</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
