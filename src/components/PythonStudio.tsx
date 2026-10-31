import React, { useState, useEffect } from 'react';
import {
  Code,
  Play,
  Save,
  RotateCcw,
  Terminal,
  FileCode,
  CheckCircle,
  Copy,
  Check,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface PythonFile {
  name: string;
  title: string;
  content: string;
}

const DEFAULT_SNIPPET = `# Quick interactive PRISM Python experiment
import sys
sys.path.insert(0, "gateway")
from prism_rules import Context, decide, BAND_LOW, BAND_HIGH
from advisor import build_advisory, format_advisory
from datetime import datetime

# 1. Define telemetry from sensor node
c = Context(
    m=38.0,          # soil moisture % (below 40% band)
    T=33.0,          # hot air temp
    RH=42.0,         # humidity %
    rain24h_mm=0.0,
    rain_prob=10,
    batt=3.92,
    forecast_fresh=True,
    already_irrigated_min_today=0.0,
    now=datetime.now(),
    valid=True
)

# 2. Evaluate deterministic rules R0-R10
decision = decide(c)

# 3. Generate agronomic advisory text
adv, meta = build_advisory(c, decision, use_llm=False)

# 4. Print formatted report
print(format_advisory(adv, node_id="prism-py-test", issued=datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
print(f"\\n[Rule Layer Decision: {decision.action} ({decision.reason}) - {decision.minutes} min during {decision.window}]")
`;

export const PythonStudio: React.FC = () => {
  const [files, setFiles] = useState<PythonFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('custom');
  const [code, setCode] = useState<string>(DEFAULT_SNIPPET);
  const [output, setOutput] = useState<string>('Ready to execute Python code.');
  const [isError, setIsError] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Fetch Python files from backend
  const loadFiles = async () => {
    try {
      const res = await fetch('/api/python/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.warn('Backend file loading error, using local buffer', err);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleSelectFile = (fileName: string) => {
    setSelectedFile(fileName);
    if (fileName === 'custom') {
      setCode(DEFAULT_SNIPPET);
      return;
    }
    const found = files.find((f) => f.name === fileName);
    if (found) {
      setCode(found.content);
    }
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput('Spawning Python 3.10 interpreter on server...');
    setIsError(false);

    try {
      const res = await fetch('/api/python/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      setIsRunning(false);

      if (data.stderr && data.exitCode !== 0) {
        setIsError(true);
        setOutput(`Exit code: ${data.exitCode}\n\n${data.stderr}\n${data.stdout}`);
      } else {
        setIsError(false);
        setOutput(data.stdout || (data.stderr ? `[Warnings]\n${data.stderr}` : 'Script executed successfully with no output.'));
      }
    } catch (err: any) {
      setIsRunning(false);
      setIsError(true);
      setOutput(`Failed to communicate with Python server:\n${err.message}`);
    }
  };

  const handleRunCommand = async (type: 'simulate' | 'tests') => {
    setIsRunning(true);
    setIsError(false);
    setOutput(`Executing: python3 ${type === 'simulate' ? 'gateway/simulate.py' : 'tests/test_rules.py'}...`);

    try {
      const endpoint = type === 'simulate' ? '/api/python/run-simulation' : '/api/python/run-tests';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      setIsRunning(false);

      if (data.stderr && !data.stdout) {
        setIsError(true);
        setOutput(data.stderr);
      } else {
        setOutput(data.stdout + (data.stderr ? `\n[Stderr]: ${data.stderr}` : ''));
      }
    } catch (err: any) {
      setIsRunning(false);
      setIsError(true);
      setOutput(`Error running command: ${err.message}`);
    }
  };

  const handleSaveFile = async () => {
    if (selectedFile === 'custom') return;
    setSaveStatus('Saving...');
    try {
      const res = await fetch('/api/python/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedFile, content: code }),
      });
      if (res.ok) {
        setSaveStatus('Saved to disk!');
        loadFiles();
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus('Save error');
      }
    } catch {
      setSaveStatus('Save error');
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <Code className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            Python 3.10 Core Engine Studio
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Browse, edit, and execute the genuine Python source code from the prototype specification directly against the backend Python runtime.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => handleRunCommand('simulate')}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-emerald-600 fill-current" />
            <span>Run simulate.py</span>
          </button>

          <button
            onClick={() => handleRunCommand('tests')}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Run test_rules.py</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Python File Selector & Editor (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-xs flex flex-col">
          {/* File Tab Bar */}
          <div className="bg-stone-50 dark:bg-stone-950/70 border-b border-stone-200 dark:border-stone-800 px-3 py-2 flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleSelectFile('custom')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  selectedFile === 'custom'
                    ? 'bg-white dark:bg-stone-800 text-emerald-700 dark:text-emerald-400 font-bold shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                <Terminal className="w-3 h-3 text-emerald-600" />
                <span>Custom Python Scratchpad</span>
              </button>

              {files.map((f) => (
                <button
                  key={f.name}
                  onClick={() => handleSelectFile(f.name)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    selectedFile === f.name
                      ? 'bg-white dark:bg-stone-800 text-emerald-700 dark:text-emerald-400 font-bold shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <FileCode className="w-3 h-3 text-stone-400" />
                  <span>{f.name.replace('gateway/', '').replace('tests/', '')}</span>
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedFile !== 'custom' && (
                <button
                  onClick={handleSaveFile}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 rounded transition-colors cursor-pointer"
                  title="Save edits to backend disk"
                >
                  <Save className="w-3.5 h-3.5 text-stone-500" />
                  <span>{saveStatus || 'Save'}</span>
                </button>
              )}

              <button
                onClick={handleCopyCode}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                title="Copy code"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Interactive Code Editor Textarea */}
          <div className="relative flex-1 min-h-[380px] bg-stone-950 font-mono text-xs">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="w-full h-full min-h-[380px] p-4 bg-transparent text-emerald-100 selection:bg-emerald-900 border-0 focus:ring-0 resize-y font-mono text-xs leading-relaxed outline-none"
              placeholder="# Enter Python 3 code here..."
            />
          </div>

          {/* Editor Footer */}
          <div className="bg-stone-900 text-stone-400 px-4 py-2 border-t border-stone-800 flex items-center justify-between text-[11px] font-mono">
            <span>Python 3.10.12 · Linux x86_64</span>
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-sans text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{isRunning ? 'Running...' : 'Execute in Python 3.10'}</span>
            </button>
          </div>
        </div>

        {/* Right Side: Real Terminal Standard Output (5 cols) */}
        <div className="lg:col-span-5 bg-stone-950 border border-stone-800 rounded-xl overflow-hidden shadow-xs flex flex-col">
          {/* Terminal Title Bar */}
          <div className="bg-stone-900 px-4 py-2.5 border-b border-stone-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
              <span className="ml-2 font-mono text-xs text-stone-300 font-semibold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                Backend Output / stdout
              </span>
            </div>

            <button
              onClick={() => setOutput('Ready.')}
              className="text-[11px] font-mono text-stone-500 hover:text-stone-300 cursor-pointer"
            >
              Clear
            </button>
          </div>

          {/* Terminal Body */}
          <div className="p-4 font-mono text-xs flex-1 min-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
            {isError ? (
              <div className="text-rose-400">{output}</div>
            ) : (
              <div className="text-stone-200">{output}</div>
            )}
          </div>

          {/* Interactive Hint */}
          <div className="p-3 bg-stone-900/90 border-t border-stone-800 text-[11px] text-stone-400">
            <div className="flex items-center gap-1.5 font-medium text-stone-300 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Direct execution of PDF Python modules:
            </div>
            You can call <code className="text-emerald-400 font-mono">decide(Context(...))</code> or import <code className="text-emerald-400 font-mono">gateway.simulate</code> in real time.
          </div>
        </div>
      </div>
    </div>
  );
};
