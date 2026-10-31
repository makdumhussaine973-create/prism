import React, { useState } from 'react';
import { Download, Upload, Plus, X, Check, Database } from 'lucide-react';
import { Reading, NodeState } from '../types/prism';

interface TelemetryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentNode: NodeState;
  onIngestReading: (reading: Reading) => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  isOpen,
  onClose,
  currentNode,
  onIngestReading,
}) => {
  const [customMoisture, setCustomMoisture] = useState<number>(38.5);
  const [customTemp, setCustomTemp] = useState<number>(31.0);
  const [customRH, setCustomRH] = useState<number>(45.0);
  const [customBatt, setCustomBatt] = useState<number>(3.9);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleIngest = (e: React.FormEvent) => {
    e.preventDefault();
    const newReading: Reading = {
      node_id: currentNode.id,
      ts: new Date().toISOString(),
      soil_moisture_pct: customMoisture,
      air_temp_c: customTemp,
      rh_pct: customRH,
      soil_temp_c: 24.0,
      soil_ph: 6.5,
      battery_v: customBatt,
      buffered: false,
    };
    onIngestReading(newReading);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentNode, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${currentNode.id}_telemetry_advisory.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">
              Telemetry Ingestion API (/api/ingest)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-600 dark:text-stone-400">
          Simulate a raw MQTT or HTTP telemetry POST from node <code className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">{currentNode.id}</code> into the gateway rule engine.
        </p>

        <form onSubmit={handleIngest} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Soil Moisture (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={customMoisture}
                onChange={(e) => setCustomMoisture(parseFloat(e.target.value))}
                className="mt-1 w-full px-3 py-1.5 text-sm font-mono border border-stone-300 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Air Temp (°C)
              </label>
              <input
                type="number"
                step="0.1"
                min="-10"
                max="60"
                value={customTemp}
                onChange={(e) => setCustomTemp(parseFloat(e.target.value))}
                className="mt-1 w-full px-3 py-1.5 text-sm font-mono border border-stone-300 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Relative Humidity (%)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={customRH}
                onChange={(e) => setCustomRH(parseFloat(e.target.value))}
                className="mt-1 w-full px-3 py-1.5 text-sm font-mono border border-stone-300 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Battery Voltage (V)
              </label>
              <input
                type="number"
                step="0.05"
                min="2.0"
                max="5.0"
                value={customBatt}
                onChange={(e) => setCustomBatt(parseFloat(e.target.value))}
                className="mt-1 w-full px-3 py-1.5 text-sm font-mono border border-stone-300 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Node JSON</span>
            </button>

            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer"
            >
              {isSuccess ? <Check className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{isSuccess ? 'Ingested!' : 'Ingest Reading'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
