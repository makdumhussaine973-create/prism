import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { Context } from '../types/prism';
import {
  BAND_LOW,
  BAND_HIGH,
  SETPOINT,
  COMFORT,
  decide,
} from '../core/prismRules';
import { buildAdvisory, formatAdvisory } from '../core/advisor';

interface Preset {
  name: string;
  badge: string;
  desc: string;
  context: Partial<Context>;
}

const PRESETS: Preset[] = [
  {
    name: 'Urgent Morning Deficit',
    badge: 'Spec §4.1',
    desc: 'Soil moisture 38% drops below 40% band, triggering R4 urgent irrigation with 26 min runtime',
    context: {
      m: 38.0,
      T: 32.0,
      RH: 44.0,
      rain24h_mm: 0,
      rain_prob: 10,
      batt: 3.9,
      data_age_min: 0,
      forecast_fresh: true,
      already_irrigated_min_today: 0,
    },
  },
  {
    name: 'Rain Storm Interlock',
    badge: 'R1 Safety',
    desc: '80% rain probability halts irrigation even when soil is dry to prevent unnecessary watering',
    context: {
      m: 32.0,
      T: 28.0,
      RH: 75.0,
      rain24h_mm: 8.0,
      rain_prob: 80,
      batt: 3.9,
      data_age_min: 2,
      forecast_fresh: true,
      already_irrigated_min_today: 0,
    },
  },
  {
    name: 'Comfort Zone Maintained',
    badge: 'R3 Comfort',
    desc: 'Moisture at 58% is well inside optimal 40–70% root zone; valve stays closed',
    context: {
      m: 58.0,
      T: 27.0,
      RH: 55.0,
      rain24h_mm: 0,
      rain_prob: 5,
      batt: 4.0,
      data_age_min: 1,
      forecast_fresh: true,
      already_irrigated_min_today: 10,
    },
  },
  {
    name: 'Waterlogged Soil Guard',
    badge: 'R2 Suppression',
    desc: 'Moisture ≥70% threatens hypoxia and root fungal disease; irrigation suppressed',
    context: {
      m: 74.0,
      T: 29.0,
      RH: 60.0,
      rain24h_mm: 0,
      rain_prob: 0,
      batt: 4.1,
      data_age_min: 0,
      forecast_fresh: true,
      already_irrigated_min_today: 0,
    },
  },
  {
    name: 'Extreme Heatwave ET Multiplier',
    badge: 'R6 1.2x',
    desc: '38°C temp and 25% RH accelerate evaporation; scales runtime duration by 1.2x',
    context: {
      m: 42.0,
      T: 38.0,
      RH: 25.0,
      rain24h_mm: 0,
      rain_prob: 5,
      batt: 3.8,
      data_age_min: 1,
      forecast_fresh: true,
      already_irrigated_min_today: 0,
    },
  },
  {
    name: 'Stale Sensor Offline',
    badge: 'R0 HOLD',
    desc: 'Data older than 60 minutes forces safe HOLD state with Low confidence fallback',
    context: {
      m: 35.0,
      T: 28.0,
      RH: 50.0,
      rain24h_mm: 0,
      rain_prob: 10,
      batt: 3.9,
      data_age_min: 85,
      forecast_fresh: true,
      already_irrigated_min_today: 0,
    },
  },
  {
    name: 'Daily 60-min Cap Reached',
    badge: 'R10 Cap',
    desc: 'Already used 60 min of water today; irrigation strictly blocked by safety cap',
    context: {
      m: 36.0,
      T: 31.0,
      RH: 40.0,
      rain24h_mm: 0,
      rain_prob: 0,
      batt: 3.9,
      data_age_min: 0,
      forecast_fresh: true,
      already_irrigated_min_today: 60,
    },
  },
  {
    name: 'Low Battery Alert',
    badge: 'R9 Warning',
    desc: 'Cell voltage < 3.5V flags node maintenance warning',
    context: {
      m: 46.0,
      T: 26.0,
      RH: 50.0,
      rain24h_mm: 0,
      rain_prob: 0,
      batt: 3.25,
      data_age_min: 0,
      forecast_fresh: false,
      already_irrigated_min_today: 0,
    },
  },
];

export const RuleSandbox: React.FC = () => {
  const [ctx, setCtx] = useState<Context>({
    m: 38.0,
    T: 32.0,
    RH: 44.0,
    rain24h_mm: 0,
    rain_prob: 10,
    batt: 3.9,
    data_age_min: 0,
    forecast_fresh: true,
    already_irrigated_min_today: 0,
    now: new Date(),
    valid: true,
  });

  const [usePythonBackend, setUsePythonBackend] = useState<boolean>(true);
  const [pythonStatus, setPythonStatus] = useState<string>('Python 3.10');
  const [pythonAdvisory, setPythonAdvisory] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Local fallback calculation
  const localDecision = decide(ctx);
  const { advisory: localAdvisory } = buildAdvisory(ctx, localDecision);

  // Whenever ctx or usePythonBackend changes, evaluate via Python backend if enabled
  useEffect(() => {
    let active = true;
    if (!usePythonBackend) {
      setPythonAdvisory(null);
      return;
    }

    setPythonStatus('Executing Python...');
    fetch('/api/python/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!active) return;
        if (res.data) {
          setPythonAdvisory(res.data);
          setPythonStatus('Python 3.10 Verified');
        } else {
          setPythonStatus('Local Fallback');
        }
      })
      .catch(() => {
        if (active) setPythonStatus('Local Fallback');
      });

    return () => {
      active = false;
    };
  }, [ctx, usePythonBackend]);

  const activeDecision = pythonAdvisory?.decision || localDecision;
  const activeAdvisory = pythonAdvisory?.advisory || localAdvisory;

  const handleCopy = () => {
    const raw = formatAdvisory(activeAdvisory, 'prism-sandbox', new Date().toISOString().replace('T', ' ').slice(0, 19));
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPreset = (preset: Preset) => {
    setCtx((prev) => ({
      ...prev,
      ...preset.context,
      now: new Date(),
      valid: true,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100">
          Deterministic Safety Rule Sandbox (R0–R10)
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
          Adjust environmental parameters in real time to inspect the deterministic decision engine from <code className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">gateway/prism_rules.py</code> and agronomic text from <code className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">gateway/advisor.py</code>.
        </p>
      </div>

      {/* Preset Selector */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2.5">
          Benchmark Agronomic Scenarios
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => applyPreset(preset)}
              className="text-left p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-emerald-500 dark:hover:border-emerald-600 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1">
                <span className="font-mono">{preset.badge}</span>
                <ArrowRight className="w-3 h-3 text-stone-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="font-semibold text-xs text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                {preset.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Parameters vs Decision Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Context Sliders (6 cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <h3 className="font-display font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              Context Telemetry Inputs
            </h3>
            <span className="text-xs text-stone-500 font-mono">Live Ingestion</span>
          </div>

          {/* Soil Moisture Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-stone-700 dark:text-stone-300">
                Soil Moisture (m):
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                {ctx.m.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={ctx.m}
              onChange={(e) => setCtx({ ...ctx, m: parseFloat(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>0% (Bone dry)</span>
              <span className="text-amber-600">40% (Min)</span>
              <span className="text-emerald-600">55% (Setpoint)</span>
              <span className="text-sky-600">70% (Max)</span>
              <span>100% (Saturated)</span>
            </div>
          </div>

          {/* Air Temperature */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-stone-700 dark:text-stone-300">
                Air Temperature (T):
              </span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                {ctx.T.toFixed(1)}°C
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="50"
              step="0.5"
              value={ctx.T}
              onChange={(e) => setCtx({ ...ctx, T: parseFloat(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>&lt;20°C (0.8x ET)</span>
              <span>20–35°C (1.0x baseline)</span>
              <span>&gt;35°C (1.2x High ET)</span>
            </div>
          </div>

          {/* Relative Humidity */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-stone-700 dark:text-stone-300">
                Relative Humidity (RH):
              </span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                {ctx.RH.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              value={ctx.RH}
              onChange={(e) => setCtx({ ...ctx, RH: parseFloat(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>&lt;30% (High ET factor 1.2x)</span>
              <span>50% (Comfortable)</span>
              <span>100% (Saturated)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* Rain 24h mm */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-stone-600 dark:text-stone-400">Rain 24h:</span>
                <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                  {ctx.rain24h_mm ?? 0} mm
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="25"
                step="1"
                value={ctx.rain24h_mm ?? 0}
                onChange={(e) => setCtx({ ...ctx, rain24h_mm: parseFloat(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <span className="text-[10px] text-stone-400">≥5 mm fires R1 lock</span>
            </div>

            {/* Rain Probability % */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-stone-600 dark:text-stone-400">Rain Prob:</span>
                <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                  {ctx.rain_prob ?? 0}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={ctx.rain_prob ?? 0}
                onChange={(e) => setCtx({ ...ctx, rain_prob: parseFloat(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <span className="text-[10px] text-stone-400">≥70% fires R1 lock</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* Battery Voltage */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-stone-600 dark:text-stone-400">Node Battery:</span>
                <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                  {(ctx.batt ?? 4.0).toFixed(2)} V
                </span>
              </div>
              <input
                type="range"
                min="2.8"
                max="4.2"
                step="0.05"
                value={ctx.batt ?? 4.0}
                onChange={(e) => setCtx({ ...ctx, batt: parseFloat(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <span className="text-[10px] text-stone-400">&lt;3.5 V flags R9 warning</span>
            </div>

            {/* Already Irrigated Today */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-stone-600 dark:text-stone-400">Irrigated Today:</span>
                <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                  {ctx.already_irrigated_min_today ?? 0} min
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="65"
                step="5"
                value={ctx.already_irrigated_min_today ?? 0}
                onChange={(e) =>
                  setCtx({ ...ctx, already_irrigated_min_today: parseFloat(e.target.value) })
                }
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <span className="text-[10px] text-stone-400">Daily cap: 60 min</span>
            </div>
          </div>

          {/* Data Age & Validity */}
          <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-stone-600 dark:text-stone-400">Data Age:</span>
              <input
                type="number"
                min="0"
                max="180"
                value={ctx.data_age_min ?? 0}
                onChange={(e) => setCtx({ ...ctx, data_age_min: parseFloat(e.target.value) || 0 })}
                className="w-16 px-2 py-0.5 border border-stone-300 dark:border-stone-700 rounded font-mono text-center"
              />
              <span className="text-stone-400">min (&gt;60m = R0)</span>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ctx.forecast_fresh !== false}
                onChange={(e) => setCtx({ ...ctx, forecast_fresh: e.target.checked })}
                className="accent-emerald-600 rounded"
              />
              <span className="text-stone-600 dark:text-stone-400">Forecast Fresh</span>
            </label>
          </div>
        </div>

        {/* Right Column: Real-time Evaluation & Generated Advisory (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Decision Box */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Rule Layer Evaluation
                </span>
                <button
                  onClick={() => setUsePythonBackend(!usePythonBackend)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
                  title="Toggle Python 3.10 backend execution"
                >
                  ⚡ {pythonStatus}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    activeDecision.valve_allowed
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                  }`}
                >
                  Valve: {activeDecision.valve_allowed ? 'ALLOWED' : 'BLOCKED'}
                </span>
                <span className="text-xs font-mono text-stone-400">
                  {activeDecision.confidence} Confidence
                </span>
              </div>
            </div>

            {/* Big Action Name */}
            <div
              className={`text-3xl font-extrabold tracking-tight ${
                activeDecision.action === 'IRRIGATE'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : activeDecision.action === 'HOLD'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-stone-700 dark:text-stone-300'
              }`}
            >
              {activeDecision.action.replace('_', ' ')}
            </div>

            {/* Rule metrics row */}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-stone-600 dark:text-stone-300">
              <div>
                Reason: <strong className="text-stone-900 dark:text-stone-100">{activeDecision.reason}</strong>
              </div>
              <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
              <div>
                Duration: <strong className="text-stone-900 dark:text-stone-100">{activeDecision.minutes} min</strong>
              </div>
              <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
              <div>
                Window: <strong className="text-stone-900 dark:text-stone-100">{activeDecision.window}</strong>
              </div>
              <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
              <div>
                Priority: <strong className="text-stone-900 dark:text-stone-100">{activeDecision.priority}</strong>
              </div>
            </div>

            {/* Agronomic Text */}
            <div className="mt-4 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60 text-xs leading-relaxed text-stone-700 dark:text-stone-200">
              <div className="font-semibold text-stone-900 dark:text-stone-100 mb-0.5">Agronomic Justification:</div>
              {activeAdvisory.justification}
              {activeAdvisory.warnings && activeAdvisory.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700 text-amber-700 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Warning: {activeAdvisory.warnings.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Copy button */}
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Formatted Text'}</span>
              </button>
            </div>
          </div>

          {/* Explanation Trace Stream */}
          <div className="bg-stone-900 dark:bg-stone-950 text-stone-200 rounded-xl p-4 font-mono text-xs border border-stone-800 shadow-xs">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-800 text-stone-400 text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-emerald-500" />
              <span>Deterministic Execution Trace</span>
            </div>
            <div className="space-y-1 overflow-x-auto max-h-56">
              {(activeDecision.trace || []).map((line: string, idx: number) => (
                <div
                  key={idx}
                  className={
                    line.includes('fired')
                      ? 'text-emerald-400 font-semibold'
                      : line.includes('R7') || line.includes('R8') || line.includes('R10')
                      ? 'text-sky-300'
                      : 'text-stone-400'
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
