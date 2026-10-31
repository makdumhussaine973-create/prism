import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

const WORKSPACE_ROOT = process.cwd();

// Helper to run python code or command
function runPythonScript(scriptPath: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('python3', [scriptPath, ...args], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    // Timeout safety 10 seconds
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      stderr += '\n[Execution timed out after 10 seconds]';
      resolve({ stdout, stderr, exitCode: -1 });
    }, 10000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

// 1. Run 7-day Python simulation
app.post('/api/python/run-simulation', async (req, res) => {
  try {
    const { rainDay4Mm, heatwaveOffset, initialMoisture } = req.body || {};

    // Dynamic runner script that can override parameters
    const runnerCode = `
import sys
sys.path.insert(0, "${path.join(WORKSPACE_ROOT, 'gateway')}")
from simulate import run
import json

man = run("manual", seed=1)
pri = run("prism", seed=1)
saving = 100 * (1 - pri["water_min"] / man["water_min"])

result = {
  "manual": man,
  "prism": pri,
  "saving_pct": round(saving, 1),
  "in_band_pass": pri["time_in_band_pct"] >= 90.0,
  "water_saving_pass": saving >= 30.0
}
print("---OUTPUT_JSON---")
print(json.dumps(result))
`;

    const runnerFile = path.join(WORKSPACE_ROOT, 'gateway', '_sim_runner.py');
    fs.writeFileSync(runnerFile, runnerCode);

    const execResult = await runPythonScript(runnerFile);
    try { fs.unlinkSync(runnerFile); } catch {}

    let parsed = null;
    if (execResult.stdout.includes('---OUTPUT_JSON---')) {
      const parts = execResult.stdout.split('---OUTPUT_JSON---');
      try {
        parsed = JSON.parse(parts[1].trim());
      } catch {}
    }

    res.json({
      success: execResult.exitCode === 0,
      stdout: execResult.stdout.replace(/---OUTPUT_JSON---[\s\S]*/, '').trim() || execResult.stdout,
      stderr: execResult.stderr,
      exitCode: execResult.exitCode,
      data: parsed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Run real Python unit test suite
app.post('/api/python/run-tests', async (_req, res) => {
  try {
    const testFile = path.join(WORKSPACE_ROOT, 'tests', 'test_rules.py');
    const result = await runPythonScript(testFile);
    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Evaluate rules via Python
app.post('/api/python/decide', async (req, res) => {
  try {
    const payload = req.body || {};
    const runnerCode = `
import sys
sys.path.insert(0, "${path.join(WORKSPACE_ROOT, 'gateway')}")
from prism_rules import Context, decide
from advisor import build_advisory, format_advisory
from datetime import datetime
import json

c = Context(
    m=float(${payload.m ?? 38.0}),
    T=float(${payload.T ?? 32.0}),
    RH=float(${payload.RH ?? 44.0}),
    rain24h_mm=float(${payload.rain24h_mm ?? 0.0}),
    rain_prob=float(${payload.rain_prob ?? 0.0}),
    batt=float(${payload.batt ?? 3.9}),
    data_age_min=float(${payload.data_age_min ?? 0.0}),
    forecast_fresh=${payload.forecast_fresh !== false ? 'True' : 'False'},
    already_irrigated_min_today=float(${payload.already_irrigated_min_today ?? 0.0}),
    valid=${payload.valid !== false ? 'True' : 'False'}
)

d = decide(c)
adv, meta = build_advisory(c, d, use_llm=False)
formatted = format_advisory(adv, node_id="prism-py01", issued=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

out = {
    "decision": d.as_dict(),
    "advisory": adv,
    "meta": meta,
    "formatted": formatted
}
print("---DECISION_JSON---")
print(json.dumps(out))
`;
    const runnerFile = path.join(WORKSPACE_ROOT, 'gateway', '_eval_runner.py');
    fs.writeFileSync(runnerFile, runnerCode);
    const execResult = await runPythonScript(runnerFile);
    try { fs.unlinkSync(runnerFile); } catch {}

    let parsed = null;
    if (execResult.stdout.includes('---DECISION_JSON---')) {
      const parts = execResult.stdout.split('---DECISION_JSON---');
      try {
        parsed = JSON.parse(parts[1].trim());
      } catch {}
    }

    res.json({
      success: execResult.exitCode === 0,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      data: parsed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Run arbitrary user Python code from in-browser IDE / REPL
app.post('/api/python/execute', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing code' });
    }

    const tempFile = path.join(WORKSPACE_ROOT, 'gateway', `_custom_${Date.now()}.py`);
    fs.writeFileSync(tempFile, code);

    const result = await runPythonScript(tempFile);
    try { fs.unlinkSync(tempFile); } catch {}

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.exitCode === 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. List and get Python files
app.get('/api/python/files', (_req, res) => {
  try {
    const files = [
      { name: 'gateway/prism_rules.py', title: 'prism_rules.py (R0-R10 Safety Rules)' },
      { name: 'gateway/advisor.py', title: 'advisor.py (Explanatory Agronomic AI Layer)' },
      { name: 'gateway/simulate.py', title: 'simulate.py (7-Day Soil Bucket Simulation)' },
      { name: 'gateway/gateway.py', title: 'gateway.py (MQTT Ingestion & SQLite Engine)' },
      { name: 'tests/test_rules.py', title: 'test_rules.py (Unit Tests for Spec Invariants)' },
    ];

    const contents = files.map((f) => {
      const fullPath = path.join(WORKSPACE_ROOT, f.name);
      const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
      return { ...f, content };
    });

    res.json(contents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Save modified Python file
app.put('/api/python/files', (req, res) => {
  try {
    const { filename, content } = req.body;
    const allowed = [
      'gateway/prism_rules.py',
      'gateway/advisor.py',
      'gateway/simulate.py',
      'gateway/gateway.py',
      'tests/test_rules.py',
    ];
    if (!allowed.includes(filename)) {
      return res.status(400).json({ error: 'File not permitted for modification' });
    }
    const fullPath = path.join(WORKSPACE_ROOT, filename);
    fs.writeFileSync(fullPath, content, 'utf8');
    res.json({ success: true, message: `Saved ${filename}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  // Mount Vite middlewares in development
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(WORKSPACE_ROOT, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(WORKSPACE_ROOT, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PRISM Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
