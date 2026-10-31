import React, { useState, useEffect } from 'react';
import {
  Droplets,
  CloudRain,
  Thermometer,
  Wind,
  Battery,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Flame,
  Radio,
} from 'lucide-react';
import { NodeState, Reading, Context } from '../types/prism';
import { BAND_LOW, BAND_HIGH, SETPOINT, COMFORT, decide } from '../core/prismRules';
import { buildAdvisory } from '../core/advisor';
import { MoistureCanvas, MoisturePoint } from './MoistureCanvas';

interface FieldMonitorProps {
  nodes: NodeState[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (node: NodeState) => void;
  onOpenSandbox: () => void;
}

export const FieldMonitor: React.FC<FieldMonitorProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onOpenSandbox,
}) => {
  const currentNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const [showTrace, setShowTrace] = useState(false);
  const [isAutoStreaming, setIsAutoStreaming] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<MoisturePoint[]>([]);

  // Initialize history points from node reading
  useEffect(() => {
    // Generate simulated 24h baseline history around current moisture
    const pts: MoisturePoint[] = [];
    const now = Date.now();
    const baseM = currentNode.reading.soil_moisture_pct;

    for (let i = 24; i >= 0; i--) {
      const t = new Date(now - i * 3600000);
      // create natural diurnal curve
      const offset = Math.sin((i / 24) * Math.PI * 2) * 3;
      const m = Math.max(25, Math.min(85, baseM + offset));
      pts.push({
        ts: t.toISOString(),
        m: parseFloat(m.toFixed(1)),
        T: 28 + Math.sin(i) * 4,
        RH: 50 + Math.cos(i) * 15,
        irrigating: i === 8 && currentNode.advisory.action === 'IRRIGATE',
      });
    }
    setHistoryPoints(pts);
  }, [currentNode.id]);

  // Valve countdown timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (currentNode.valveOpen && currentNode.valveCountdownSeconds > 0) {
      timer = setInterval(() => {
        const remaining = currentNode.valveCountdownSeconds - 1;
        if (remaining <= 0) {
          onUpdateNode({
            ...currentNode,
            valveOpen: false,
            valveCountdownSeconds: 0,
          });
        } else {
          onUpdateNode({
            ...currentNode,
            valveCountdownSeconds: remaining,
          });
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentNode.valveOpen, currentNode.valveCountdownSeconds]);

  // Auto-streaming simulator
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoStreaming) {
      interval = setInterval(() => {
        handleSimulatePulse();
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [isAutoStreaming, currentNode]);

  const handleSimulatePulse = () => {
    // Generate new sensor reading with natural variation
    const currentM = currentNode.reading.soil_moisture_pct;
    // If valve is open, moisture rises; otherwise it drops due to ET
    const deltaM = currentNode.valveOpen ? 2.5 : -0.4;
    const newM = Math.max(15, Math.min(92, parseFloat((currentM + deltaM).toFixed(1))));

    const newT = parseFloat((29 + Math.random() * 5).toFixed(1));
    const newRH = parseFloat((45 + Math.random() * 15).toFixed(1));
    const newTs = new Date().toISOString();

    const newReading: Reading = {
      ...currentNode.reading,
      ts: newTs,
      soil_moisture_pct: newM,
      air_temp_c: newT,
      rh_pct: newRH,
      battery_v: parseFloat((currentNode.reading.battery_v - 0.001).toFixed(2)),
    };

    // Evaluate rules
    const ctx: Context = {
      m: newM,
      T: newT,
      RH: newRH,
      rain24h_mm: currentNode.rainForecast.rain24h_mm,
      rain_prob: currentNode.rainForecast.rain_prob,
      batt: newReading.battery_v,
      data_age_min: 0,
      forecast_fresh: true,
      already_irrigated_min_today: currentNode.alreadyIrrigatedToday,
      now: new Date(),
      valid: true,
    };

    const dec = decide(ctx);
    const { advisory, meta } = buildAdvisory(ctx, dec);

    const updatedNode: NodeState = {
      ...currentNode,
      reading: newReading,
      advisory: {
        ...advisory,
        node_id: currentNode.id,
        issued: newTs.replace('T', ' ').slice(0, 19),
        latency_s: meta.latency_s,
        source: meta.source,
      },
      valveOpen: dec.valve_allowed && dec.minutes > 0 ? true : currentNode.valveOpen,
      valveCountdownSeconds:
        dec.valve_allowed && dec.minutes > 0
          ? dec.minutes * 60
          : currentNode.valveCountdownSeconds,
    };

    onUpdateNode(updatedNode);

    setHistoryPoints((prev) => [
      ...prev.slice(1),
      {
        ts: newTs,
        m: newM,
        T: newT,
        RH: newRH,
        irrigating: updatedNode.valveOpen,
      },
    ]);
  };

  const handleToggleValveManual = () => {
    if (currentNode.valveOpen) {
      // Emergency halt
      onUpdateNode({
        ...currentNode,
        valveOpen: false,
        valveCountdownSeconds: 0,
      });
    } else {
      // Manual test pulse with 15 min safety watchdog
      onUpdateNode({
        ...currentNode,
        valveOpen: true,
        valveCountdownSeconds: 15 * 60,
      });
    }
  };

  const action = currentNode.advisory.action;
  const isIrrigate = action === 'IRRIGATE';
  const isHold = action === 'HOLD';

  return (
    <div className="space-y-6">
      {/* Node selector & operational status header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200 dark:border-stone-800">
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
            Active Telemetry Node
          </div>
          <div className="flex items-center gap-3 mt-1">
            <select
              value={selectedNodeId}
              onChange={(e) => onSelectNode(e.target.value)}
              className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 bg-transparent border-0 focus:ring-0 p-0 cursor-pointer"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id} className="text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-900">
                  {n.name} ({n.id})
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            <span>{currentNode.crop}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{currentNode.zone}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>ESP32 Dual-Core FreeRTOS</span>
          </div>
        </div>

        {/* Live streaming controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsAutoStreaming(!isAutoStreaming)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              isAutoStreaming
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isAutoStreaming ? 'text-emerald-600 animate-pulse' : 'text-stone-400'}`} />
            <span>{isAutoStreaming ? 'Telemetry Streaming' : 'Live Stream Off'}</span>
          </button>

          <button
            onClick={handleSimulatePulse}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            title="Inject simulated 15-minute sensor reading"
          >
            <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
            <span>Simulate Pulse</span>
          </button>

          <button
            onClick={onOpenSandbox}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Tweak Rules</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Advisory & Watchdog vs. Moisture Gauge & Environmental Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: PRISM Advisory Decision & Hardware Watchdog (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* PRISM Advisory Card */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                PRISM Irrigation Advisory
              </div>
              <div className="text-xs text-stone-400 dark:text-stone-500 font-mono tabular-nums">
                {currentNode.advisory.issued?.slice(11, 19) || 'Just now'}
              </div>
            </div>

            {/* Recommended Action Display */}
            <div className="mb-4">
              <div
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  isIrrigate
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isHold
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-stone-700 dark:text-stone-300'
                }`}
              >
                {action.replace('_', ' ')}
              </div>

              {/* Detail row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-stone-600 dark:text-stone-300">
                <div>
                  Duration: <strong className="text-stone-900 dark:text-stone-100 font-mono tabular-nums">{currentNode.advisory.duration_min} min</strong>
                </div>
                <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
                <div>
                  Window: <strong className="text-stone-900 dark:text-stone-100">{currentNode.advisory.timing_window}</strong>
                </div>
                <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
                <div>
                  Confidence: <strong className="text-stone-900 dark:text-stone-100">{currentNode.advisory.confidence}</strong>
                </div>
              </div>
            </div>

            {/* Agronomic Justification */}
            <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
              <p className="font-normal">{currentNode.advisory.justification}</p>

              {currentNode.advisory.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{currentNode.advisory.warnings.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Metadata Footer */}
            <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <div>
                <span>Source: </span>
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  {currentNode.advisory.source === 'llm' ? 'Ollama Qwen2.5 1.5B' : 'Agronomic Safety Template'}
                </span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{currentNode.advisory.latency_s}s</span>
              </div>

              <button
                onClick={() => setShowTrace(!showTrace)}
                className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                <span>{showTrace ? 'Hide Trace' : 'View Trace'}</span>
                {showTrace ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Expandable Explanation Trace */}
            {showTrace && (
              <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                <div className="text-xs font-semibold text-stone-600 dark:text-stone-300 mb-2">
                  Deterministic Rule Trace (Spec 4.1)
                </div>
                <div className="bg-stone-900 text-stone-200 dark:bg-stone-950 p-3 rounded font-mono text-xs overflow-x-auto space-y-1 max-h-48">
                  {currentNode.advisory.trace.map((line, idx) => (
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
            )}
          </div>

          {/* Hardware Relay & Valve Watchdog Card */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-stone-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  GPIO26 Solenoid Relay Watchdog
                </span>
              </div>
              <div className="text-xs text-stone-400">
                FreeRTOS Core 1 Task
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                  Relay Hardware State
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      currentNode.valveOpen
                        ? 'bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950/60'
                        : 'bg-stone-400'
                    }`}
                  />
                  <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm">
                    {currentNode.valveOpen ? 'ENERGIZED (FLOWING)' : 'CLOSED (SECURE)'}
                  </span>
                </div>
              </div>

              {currentNode.valveOpen && (
                <div className="text-right">
                  <div className="text-xs text-stone-500 dark:text-stone-400">Watchdog Deadline</div>
                  <div className="font-mono tabular-nums text-sm font-bold text-sky-700 dark:text-sky-400">
                    {Math.floor(currentNode.valveCountdownSeconds / 60)}:
                    {String(currentNode.valveCountdownSeconds % 60).padStart(2, '0')}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>Safety Limit: 60 min hard cap (`VALVE_MAX_MS`)</span>
              <button
                onClick={handleToggleValveManual}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  currentNode.valveOpen
                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 hover:bg-rose-200'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {currentNode.valveOpen ? 'Emergency Close' : 'Manual Test Valve'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Agronomic Soil Band & Environmental Telemetry (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Soil Moisture Band & History Chart */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100">
                  Soil Moisture & Agronomic Target Band
                </h3>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  Band: 40%–70% Target Zone · 55% Setpoint · Depth: 300 mm
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-700/20 border border-emerald-600 inline-block" />
                  <span className="text-stone-600 dark:text-stone-300">Optimal (40–70%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-amber-500 inline-block" />
                  <span className="text-stone-600 dark:text-stone-300">Setpoint 55%</span>
                </div>
              </div>
            </div>

            {/* Current Moisture Highlight Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 mb-4 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">Current Moisture</div>
                <div className="text-xl font-bold font-mono tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
                  {currentNode.reading.soil_moisture_pct.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">Band Status</div>
                <div className="text-sm font-semibold mt-1">
                  {currentNode.reading.soil_moisture_pct < BAND_LOW ? (
                    <span className="text-rose-600 dark:text-rose-400">Deficit (&lt;40%)</span>
                  ) : currentNode.reading.soil_moisture_pct > BAND_HIGH ? (
                    <span className="text-sky-600 dark:text-sky-400">Supersaturated (&gt;70%)</span>
                  ) : currentNode.reading.soil_moisture_pct >= COMFORT ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Comfort (50–70%)</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Falling toward min</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">Target Deficit</div>
                <div className="text-base font-bold font-mono tabular-nums text-stone-800 dark:text-stone-200 mt-0.5">
                  {Math.max(
                    0,
                    parseFloat(
                      (((SETPOINT - currentNode.reading.soil_moisture_pct) / 100) * 300).toFixed(1)
                    )
                  )}{' '}
                  <span className="text-xs font-normal text-stone-500">mm</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">Daily Cap Used</div>
                <div className="text-base font-bold font-mono tabular-nums text-stone-800 dark:text-stone-200 mt-0.5">
                  {currentNode.alreadyIrrigatedToday} / 60{' '}
                  <span className="text-xs font-normal text-stone-500">min</span>
                </div>
              </div>
            </div>

            {/* Moisture Chart Canvas */}
            <MoistureCanvas data={historyPoints} height={190} />
          </div>

          {/* Environmental Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Air Temp & Humidity */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 mb-1">
                <span className="text-xs font-medium">Air Temp / RH</span>
                <Thermometer className="w-4 h-4 text-stone-400" />
              </div>
              <div className="font-mono tabular-nums font-bold text-lg text-stone-900 dark:text-stone-100">
                {currentNode.reading.air_temp_c}°C
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 flex items-center gap-1 font-mono tabular-nums">
                <Wind className="w-3 h-3 text-stone-400" />
                <span>{currentNode.reading.rh_pct}% RH</span>
              </div>
              <div className="text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                {currentNode.reading.air_temp_c > 35 || currentNode.reading.rh_pct < 30 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">High ET (x1.2 dur)</span>
                ) : currentNode.reading.air_temp_c < 20 ? (
                  <span className="text-stone-500 font-medium">Low ET (x0.8 dur)</span>
                ) : (
                  <span>Normal ET baseline</span>
                )}
              </div>
            </div>

            {/* Soil Temp & pH */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 mb-1">
                <span className="text-xs font-medium">Soil Temp / pH</span>
                <Droplets className="w-4 h-4 text-stone-400" />
              </div>
              <div className="font-mono tabular-nums font-bold text-lg text-stone-900 dark:text-stone-100">
                {currentNode.reading.soil_temp_c !== null ? `${currentNode.reading.soil_temp_c}°C` : 'N/A'}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-mono tabular-nums">
                pH {currentNode.reading.soil_ph?.toFixed(1) || '6.5'} (SEN0169)
              </div>
              <div className="text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                DS18B20 1-Wire probe
              </div>
            </div>

            {/* Rain Forecast */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 mb-1">
                <span className="text-xs font-medium">Rain 24h Outlook</span>
                <CloudRain className="w-4 h-4 text-stone-400" />
              </div>
              <div className="font-mono tabular-nums font-bold text-lg text-stone-900 dark:text-stone-100">
                {currentNode.rainForecast.rain24h_mm} mm
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-mono tabular-nums">
                {currentNode.rainForecast.rain_prob}% probability
              </div>
              <div className="text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                {currentNode.rainForecast.rain24h_mm >= 5 || currentNode.rainForecast.rain_prob >= 70 ? (
                  <span className="text-sky-600 dark:text-sky-400 font-medium">R1 Rain Interlock Active</span>
                ) : (
                  <span>Clear window</span>
                )}
              </div>
            </div>

            {/* Battery Voltage */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 mb-1">
                <span className="text-xs font-medium">Battery Cell</span>
                <Battery className="w-4 h-4 text-stone-400" />
              </div>
              <div className="font-mono tabular-nums font-bold text-lg text-stone-900 dark:text-stone-100">
                {currentNode.reading.battery_v.toFixed(2)} V
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {currentNode.reading.battery_v < 3.5 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-medium">R9 Low Battery</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Nominal (&gt;3.5V)</span>
                )}
              </div>
              <div className="text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                100k/100k divider (GPIO35)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
