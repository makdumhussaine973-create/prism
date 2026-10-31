import React, { useState } from 'react';
import {
  Cpu,
  Server,
  Wifi,
  WifiOff,
  Database,
  Radio,
  Clock,
  ShieldAlert,
  ArrowRight,
  HardDrive,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';

interface PinSpec {
  pin: string;
  gpio: string;
  sensor: string;
  protocol: string;
  function: string;
  details: string;
}

const PIN_SPECS: PinSpec[] = [
  {
    pin: 'SEN0193',
    gpio: 'GPIO 34',
    sensor: 'Capacitive Soil Moisture',
    protocol: 'ADC1 (11dB Atten)',
    function: 'Root zone volumetric water content',
    details: 'Median of 5 samples. Calibrated in air (3000 raw = 0%) and water (1300 raw = 100%).',
  },
  {
    pin: 'DS18B20',
    gpio: 'GPIO 4',
    sensor: 'Soil Temperature Probe',
    protocol: '1-Wire Bus',
    function: 'Underground temperature monitor',
    details: 'Requires 4.7kΩ pull-up resistor to 3V3 rail. Used for frost and microbial activity.',
  },
  {
    pin: 'SHT31',
    gpio: 'GPIO 21 / 22',
    sensor: 'Air Temp & Humidity Sensor',
    protocol: 'I2C (0x44)',
    function: 'Atmospheric boundary layer vapor deficit',
    details: 'Precision digital output. Feeds Rule 6 Evapotranspiration multiplier (T > 35°C or RH < 30%).',
  },
  {
    pin: 'SEN0169',
    gpio: 'GPIO 32',
    sensor: 'Analog Soil pH Electrode',
    protocol: 'ADC1 Analog',
    function: 'Soil acidity / alkalinity check',
    details: 'Transfer function: 3.5 * V + offset. Calibrated with pH 4.0 / 7.0 buffer solutions.',
  },
  {
    pin: 'Divider',
    gpio: 'GPIO 35',
    sensor: '100k / 100k Resistor Divider',
    protocol: 'ADC1 Analog',
    function: 'Node LiPo Battery Voltage',
    details: 'Monitors 3.7V LiPo cell. If battery drops < 3.5V, triggers Rule 9 Low Battery warning.',
  },
  {
    pin: 'Relay',
    gpio: 'GPIO 26',
    sensor: 'Optocoupled Solenoid Relay',
    protocol: 'Digital GPIO Output',
    function: 'Physical irrigation valve actuator',
    details: 'Monitored by FreeRTOS valveTask with hardware millis() watchdog. Closes automatically on timeout.',
  },
];

export const ArchitectureView: React.FC = () => {
  const [wifiSimState, setWifiSimState] = useState<'connected' | 'disconnected'>('connected');
  const [bufferCount, setBufferCount] = useState(0);

  const handleSimulateOfflineCycle = () => {
    if (wifiSimState === 'disconnected') {
      setBufferCount((prev) => Math.min(96, prev + 1));
    }
  };

  const handleToggleWifi = () => {
    if (wifiSimState === 'connected') {
      setWifiSimState('disconnected');
    } else {
      setWifiSimState('connected');
      // simulate flush
      setTimeout(() => {
        setBufferCount(0);
      }, 800);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100">
          Hardware & Edge Gateway Architecture
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
          Complete structural breakdown of the dual-core FreeRTOS ESP32 node (<code className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">firmware/prism_node.ino</code>) and Raspberry Pi edge gateway (<code className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">gateway/gateway.py</code>).
        </p>
      </div>

      {/* FreeRTOS Dual-Core Architecture Diagram */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-6 border-b border-stone-100 dark:border-stone-800">
          <div>
            <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              ESP32 Dual-Core FreeRTOS Task Separation
            </h3>
            <div className="text-xs text-stone-500 mt-0.5">
              Spec note: ESP8266 single-core lost sensor samples during blocking Wi-Fi transmissions. ESP32 pins tasks to dedicated silicon cores.
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 bg-stone-100 dark:bg-stone-800 rounded text-stone-600 dark:text-stone-400">
              Stack: 16 KB RAM
            </span>
          </div>
        </div>

        {/* Cores Split View */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Core 1 Box */}
          <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-display font-bold text-emerald-900 dark:text-emerald-300 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Core 1: Sensor Sampling & Valve Safety
              </div>
              <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                Priority 2 & 3
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
                <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                  <span>sensorTask (Priority 2, 6KB stack)</span>
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                </div>
                <p className="text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                  Polls every 15 minutes (<code className="font-mono">CYCLE_MS = 15m</code>).
                  Collects 5 samples per analog channel and takes the median to eliminate soil electrical noise.
                  Packages JSON document and pushes to FreeRTOS <code className="font-mono text-emerald-700 dark:text-emerald-400">readingQ</code>.
                </p>
              </div>

              <div className="p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
                <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                  <span>valveTask Watchdog (Priority 3, 2KB stack)</span>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <p className="text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                  Runs every 500ms. Compares current <code className="font-mono">millis()</code> against <code className="font-mono">valveOffAt</code> deadline.
                  If time expires or 60-min cap is exceeded, shuts GPIO26 LOW immediately even if network disconnects.
                </p>
              </div>
            </div>
          </div>

          {/* Core 0 Box */}
          <div className="p-5 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/30 dark:bg-sky-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-display font-bold text-sky-900 dark:text-sky-300 text-sm flex items-center gap-2">
                <Wifi className="w-4 h-4 text-sky-600" />
                Core 0: Networking & Offline Buffer
              </div>
              <span className="text-[11px] font-mono text-sky-700 dark:text-sky-400">
                Priority 1
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
                <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                  <span>netTask (Priority 1, 8KB stack)</span>
                  <Radio className="w-3.5 h-3.5 text-stone-400" />
                </div>
                <p className="text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                  Manages Wi-Fi STA connection to Raspberry Pi AP and Mosquitto MQTT.
                  Publishes telemetry to <code className="font-mono text-sky-700 dark:text-sky-400">prism/+/telemetry</code>.
                  Subscribes to <code className="font-mono text-sky-700 dark:text-sky-400">prism/+/valve</code> to receive open duration commands.
                </p>
              </div>

              <div className="p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
                <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                  <span>LittleFS Ring Buffer (`/buf.jsonl`)</span>
                  <HardDrive className="w-3.5 h-3.5 text-stone-400" />
                </div>
                <p className="text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                  Stores up to 96 offline readings in onboard SPI flash (24h history).
                  When connection restores, executes <code className="font-mono text-sky-700 dark:text-sky-400">bufferFlush()</code> to replay old packets flagged as <code className="font-mono">buffered=true</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Offline Resiliency Demonstration */}
        <div className="mt-6 pt-5 border-t border-stone-100 dark:border-stone-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700">
            <div>
              <div className="font-semibold text-xs text-stone-900 dark:text-stone-100 flex items-center gap-2">
                {wifiSimState === 'connected' ? (
                  <Wifi className="w-4 h-4 text-emerald-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-rose-500" />
                )}
                Interactive LittleFS Buffer Simulator
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                Simulate Wi-Fi dropouts: the node continues logging to flash memory and replays on reconnect.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs font-mono tabular-nums text-stone-600 dark:text-stone-300">
                Flash Buffer: <strong>{bufferCount} / 96</strong> stored
              </div>

              {wifiSimState === 'disconnected' && (
                <button
                  onClick={handleSimulateOfflineCycle}
                  className="px-2.5 py-1 text-xs font-medium bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-800 dark:text-stone-200 rounded transition-colors cursor-pointer"
                >
                  Log Reading
                </button>
              )}

              <button
                onClick={handleToggleWifi}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  wifiSimState === 'connected'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800'
                }`}
              >
                {wifiSimState === 'connected' ? 'Simulate Disconnect' : 'Reconnect & Flush'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Edge Server & Pi Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gateway Pipeline (6 cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600" />
              Raspberry Pi Edge Gateway
            </h3>
            <span className="text-xs text-stone-400 font-mono">gateway.py</span>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
              <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center font-bold shrink-0 text-xs">
                1
              </div>
              <div>
                <strong className="text-stone-900 dark:text-stone-100">Mosquitto MQTT Broker:</strong> Subscribes to <code className="font-mono">prism/+/telemetry</code>. Reassembles packets from all agricultural zone nodes.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
              <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center font-bold shrink-0 text-xs">
                2
              </div>
              <div>
                <strong className="text-stone-900 dark:text-stone-100">Deterministic Safety Rule Layer (prism_rules.py):</strong> Validates bounds. Decides Action (IRRIGATE/NO_IRRIGATION/HOLD), Duration, Window, and Reason.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
              <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center font-bold shrink-0 text-xs">
                3
              </div>
              <div>
                <strong className="text-stone-900 dark:text-stone-100">Local Ollama LLM / Template Fallback (advisor.py):</strong> Queries Qwen2.5 1.5B with a 3.0-second latency budget. If timeout or hallucination occurs, falls back cleanly to the template.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
              <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center font-bold shrink-0 text-xs">
                4
              </div>
              <div>
                <strong className="text-stone-900 dark:text-stone-100">SQLite & Actuator Dispatch:</strong> Records telemetry to <code className="font-mono">readings</code>, <code className="font-mono">advisories</code>, and <code className="font-mono">irrigation</code> tables. Dispatches valve JSON command to node.
              </div>
            </div>
          </div>
        </div>

        {/* Sensor Pinout Matrix (6 cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              ESP32 Pinout & Sensor Wiring Spec
            </h3>
            <span className="text-xs text-stone-400 font-mono">prism_node.ino</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 font-semibold">
                  <th className="py-2 pr-3">Pin</th>
                  <th className="py-2 pr-3">Sensor / Module</th>
                  <th className="py-2 pr-3">Bus</th>
                  <th className="py-2">Function</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-700 dark:text-stone-300">
                {PIN_SPECS.map((p, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="py-2 pr-3 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {p.gpio}
                    </td>
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{p.sensor}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-stone-500 whitespace-nowrap">
                      {p.protocol}
                    </td>
                    <td className="py-2 text-[11px] text-stone-600 dark:text-stone-400">{p.function}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
