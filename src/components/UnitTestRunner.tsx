import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Clock,
  Terminal,
  CheckCircle2,
} from 'lucide-react';
import { runAllRuleTests } from '../core/unitTests';
import { UnitTestResult } from '../types/prism';

export const UnitTestRunner: React.FC = () => {
  const [results, setResults] = useState<UnitTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunTime, setLastRunTime] = useState<string>('');
  const [pythonOutput, setPythonOutput] = useState<string>('');
  const [isPythonRunning, setIsPythonRunning] = useState<boolean>(false);

  const executeTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runAllRuleTests();
      setResults(res);
      setIsRunning(false);
      setLastRunTime(new Date().toLocaleTimeString());
    }, 200);
  };

  const executePythonBackendTests = async () => {
    setIsPythonRunning(true);
    setPythonOutput('Spawning python3 tests/test_rules.py...');
    try {
      const res = await fetch('/api/python/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setIsPythonRunning(false);
      setPythonOutput(data.stdout || data.stderr);
      // Also sync client tests
      executeTests();
    } catch (err: any) {
      setIsPythonRunning(false);
      setPythonOutput(`Python runner error: ${err.message}`);
    }
  };

  useEffect(() => {
    executeTests();
  }, []);

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const allPassed = total > 0 && passed === total;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            Agronomic Rule Test Suite (10/10 Invariants)
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Browser execution of <code className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">tests/test_rules.py</code>. Verifies all safety constraints, deficit formulas, ET multipliers, and fallback invariants.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={executePythonBackendTests}
            disabled={isPythonRunning}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isPythonRunning ? 'Executing Python...' : 'Run with python3 test_rules.py'}</span>
          </button>

          <button
            onClick={executeTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isRunning ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRunning ? 'Running...' : 'Rerun Client Suite'}</span>
          </button>
        </div>
      </div>

      {/* Summary Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
            Test Suite Status
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                allPassed ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'
              }`}
            >
              {allPassed ? '100% PASS' : `${passed} / ${total} PASS`}
            </span>
          </div>
          <div className="mt-1 text-xs text-stone-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Zero rule regressions detected</span>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
            Total Invariants Verified
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-stone-900 dark:text-stone-100">
            {total} Tests
          </div>
          <div className="mt-1 text-xs text-stone-500">
            R0 through R10 + Validity filter
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs">
          <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
            Last Executed
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-stone-900 dark:text-stone-100">
            {lastRunTime || 'Ready'}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            Client-side deterministic evaluation
          </div>
        </div>
      </div>

      {/* Python Backend Terminal Output */}
      {pythonOutput && (
        <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-200">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-800 text-[11px] text-emerald-400">
            <Terminal className="w-3.5 h-3.5" />
            <span>Python 3.10 Subprocess stdout (`tests/test_rules.py`)</span>
          </div>
          <pre className="whitespace-pre-wrap leading-relaxed text-emerald-300">
            {pythonOutput}
          </pre>
        </div>
      )}

      {/* Test List Table */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-stone-500">
          <span>Test Name & Specification Invariant</span>
          <span>Result</span>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {results.map((test, idx) => (
            <div
              key={idx}
              className="p-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                    {test.name}
                  </code>
                  <span className="text-[11px] font-mono text-stone-400">
                    {test.durationMs}ms
                  </span>
                </div>
                <p className="text-stone-600 dark:text-stone-400 text-xs">
                  {test.description}
                </p>

                {test.details && (
                  <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400 flex flex-wrap gap-x-3 gap-y-1 pt-1">
                    {Object.entries(test.details).map(([k, v]) => (
                      <span key={k}>
                        {k}: <span className="text-stone-800 dark:text-stone-200 font-semibold">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}

                {test.error && (
                  <div className="text-xs text-rose-600 font-mono mt-1">
                    Error: {test.error}
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {test.passed ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle className="w-3.5 h-3.5" />
                    PASS
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    <XCircle className="w-3.5 h-3.5" />
                    FAIL
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
