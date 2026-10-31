import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { FieldMonitor } from './components/FieldMonitor';
import { SimulationLab } from './components/SimulationLab';
import { RuleSandbox } from './components/RuleSandbox';
import { ArchitectureView } from './components/ArchitectureView';
import { UnitTestRunner } from './components/UnitTestRunner';
import { PythonStudio } from './components/PythonStudio';
import { TelemetryDrawer } from './components/TelemetryDrawer';
import { INITIAL_NODES } from './data/mockNodes';
import { NodeState, Reading, Context } from './types/prism';
import { decide } from './core/prismRules';
import { buildAdvisory } from './core/advisor';
import { Database, Sprout, ArrowUpRight } from 'lucide-react';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState<'monitor' | 'simulation' | 'sandbox' | 'python' | 'architecture' | 'tests'>('monitor');
  const [nodes, setNodes] = useState<NodeState[]>(INITIAL_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('prism-n01');
  const [isIngestOpen, setIsIngestOpen] = useState<boolean>(false);

  // Sync dark class on document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleToggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const handleUpdateNode = (updatedNode: NodeState) => {
    setNodes((prev) => prev.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
  };

  const currentNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  const handleIngestReading = (reading: Reading) => {
    const ctx: Context = {
      m: reading.soil_moisture_pct,
      T: reading.air_temp_c,
      RH: reading.rh_pct,
      rain24h_mm: currentNode.rainForecast.rain24h_mm,
      rain_prob: currentNode.rainForecast.rain_prob,
      batt: reading.battery_v,
      data_age_min: 0,
      forecast_fresh: true,
      already_irrigated_min_today: currentNode.alreadyIrrigatedToday,
      now: new Date(),
      valid: true,
    };

    const dec = decide(ctx);
    const { advisory, meta } = buildAdvisory(ctx, dec);

    const updated: NodeState = {
      ...currentNode,
      reading,
      advisory: {
        ...advisory,
        node_id: currentNode.id,
        issued: reading.ts.replace('T', ' ').slice(0, 19),
        latency_s: meta.latency_s,
        source: meta.source,
      },
      valveOpen: dec.valve_allowed && dec.minutes > 0,
      valveCountdownSeconds: dec.valve_allowed && dec.minutes > 0 ? dec.minutes * 60 : 0,
    };

    handleUpdateNode(updated);
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors">
      {/* Top Bar Navigation */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onQuickSimulate={() => setActiveTab('simulation')}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'monitor' && (
          <FieldMonitor
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onUpdateNode={handleUpdateNode}
            onOpenSandbox={() => setActiveTab('sandbox')}
          />
        )}

        {activeTab === 'simulation' && <SimulationLab />}

        {activeTab === 'sandbox' && <RuleSandbox />}

        {activeTab === 'python' && <PythonStudio />}

        {activeTab === 'architecture' && <ArchitectureView />}

        {activeTab === 'tests' && <UnitTestRunner />}
      </main>

      {/* Persistent Floating Utility Action */}
      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
        <button
          onClick={() => setIsIngestOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
        >
          <Database className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
          <span>Ingest Telemetry (/api/ingest)</span>
        </button>
      </div>

      {/* Ingest Telemetry Drawer */}
      <TelemetryDrawer
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        currentNode={currentNode}
        onIngestReading={handleIngestReading}
      />

      {/* Quiet Professional Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 py-6 text-xs text-stone-500 dark:text-stone-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sprout className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-stone-700 dark:text-stone-300">
              PRISM GP-02 Precision Irrigation Advisory
            </span>
            <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
            <span>Deterministic Rules R0–R10</span>
            <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
            <span>ESP32 FreeRTOS Node</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span>Band 40–70%</span>
            <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
            <span>60-min Daily Cap</span>
            <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
            <span>15-min Telemetry Loop</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
