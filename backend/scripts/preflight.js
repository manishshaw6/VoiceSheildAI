#!/usr/bin/env node

/**
 * VoxShieldAI — Demo Preflight Diagnostics
 * 
 * Comprehensive pre-presentation check of all system components.
 * Run: node scripts/preflight.js   OR   npm run preflight
 * 
 * Checks:
 *   ✓ Express API (/api/health)
 *   ✓ SQLite Database
 *   ✓ Python ML Service (/internal/ready)
 *   ✓ faster-whisper (small, CPU int8)
 *   ✓ SpeechBrain ECAPA-TDNN (192-dim)
 *   ✓ Sarvam Saaras v4 (Cloud) → DEGRADED if offline
 *   ✓ Reality Defender (Cloud) → DEGRADED if offline
 */

const EXPRESS_URL = process.env.EXPRESS_URL || 'http://localhost:5000';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001';

const checks = [];

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function record(name, status, detail = '') {
  checks.push({ name, status, detail });
}

// ─── Check Functions ──────────────────────────────────────────────────────────

async function checkExpress() {
  try {
    const data = await fetchJson(`${EXPRESS_URL}/api/health`);
    record('Express API', data.status === 'ok' ? 'PASS' : 'FAIL', `v${data.version || '?'}`);
  } catch (err) {
    record('Express API', 'FAIL', err.message);
  }
}

async function checkDatabase() {
  try {
    const data = await fetchJson(`${EXPRESS_URL}/api/system/providers`);
    record('SQLite Database', data.database?.available ? 'PASS' : 'FAIL');
  } catch (err) {
    record('SQLite Database', 'FAIL', err.message);
  }
}

async function checkMLService() {
  try {
    const data = await fetchJson(`${ML_SERVICE_URL}/internal/ready`, 8000);
    if (data.ready) {
      record('Python ML Service', 'PASS', 'Models loaded');
      // Check individual models
      const models = data.models || {};
      record('faster-whisper', models.whisper?.loaded ? 'PASS' : 'FAIL',
        models.whisper?.loaded ? `${models.whisper.model || 'small'} / ${models.whisper.device || 'cpu'}` : 'Not loaded');
      record('ECAPA-TDNN (SpeechBrain)', models.ecapa?.loaded ? 'PASS' : 'FAIL',
        models.ecapa?.loaded ? `${models.ecapa.dimensions || 192}-dim` : 'Not loaded');
    } else {
      record('Python ML Service', 'FAIL', 'Service not ready');
      record('faster-whisper', 'FAIL', 'ML service not ready');
      record('ECAPA-TDNN (SpeechBrain)', 'FAIL', 'ML service not ready');
    }
  } catch (err) {
    record('Python ML Service', 'FAIL', err.message);
    record('faster-whisper', 'FAIL', 'ML service unreachable');
    record('ECAPA-TDNN (SpeechBrain)', 'FAIL', 'ML service unreachable');
  }
}

async function checkSarvam() {
  try {
    const data = await fetchJson(`${EXPRESS_URL}/api/system/providers`);
    const sarvam = data.speech_recognition?.providers?.sarvam || data.transcription?.sarvam;
    if (sarvam?.available || sarvam?.configured) {
      record('Sarvam Saaras v4 (Cloud)', sarvam.available ? 'PASS' : 'DEGRADED',
        sarvam.available ? 'API reachable' : 'Configured but unreachable');
    } else {
      record('Sarvam Saaras v4 (Cloud)', 'DEGRADED', 'Not configured or unavailable');
    }
  } catch (err) {
    record('Sarvam Saaras v4 (Cloud)', 'DEGRADED', err.message);
  }
}

async function checkRealityDefender() {
  try {
    const data = await fetchJson(`${EXPRESS_URL}/api/system/providers`);
    const rd = data.reality_defender;
    if (rd?.available) {
      record('Reality Defender (Cloud)', 'PASS', 'API reachable');
    } else if (rd?.configured) {
      record('Reality Defender (Cloud)', 'DEGRADED', 'Key configured, API unreachable');
    } else {
      record('Reality Defender (Cloud)', 'DEGRADED', 'Not configured');
    }
  } catch (err) {
    record('Reality Defender (Cloud)', 'DEGRADED', err.message);
  }
}

// ─── Output Formatting ───────────────────────────────────────────────────────

function statusIcon(status) {
  switch (status) {
    case 'PASS': return '✓';
    case 'DEGRADED': return '⚠';
    case 'FAIL': return '✗';
    default: return '?';
  }
}

function statusColor(status) {
  switch (status) {
    case 'PASS': return '\x1b[32m';     // green
    case 'DEGRADED': return '\x1b[33m'; // yellow
    case 'FAIL': return '\x1b[31m';     // red
    default: return '\x1b[0m';
  }
}

function printResults() {
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';

  console.log('');
  console.log(`${cyan}  ╔════════════════════════════════════════════════════════╗${reset}`);
  console.log(`${cyan}  ║     VoxShieldAI — Preflight Diagnostics Report        ║${reset}`);
  console.log(`${cyan}  ╚════════════════════════════════════════════════════════╝${reset}`);
  console.log('');

  const maxName = Math.max(...checks.map(c => c.name.length));

  for (const check of checks) {
    const icon = statusIcon(check.status);
    const color = statusColor(check.status);
    const pad = ' '.repeat(maxName - check.name.length);
    const detail = check.detail ? `  ${check.detail}` : '';
    console.log(`  ${color}${icon}${reset}  ${bold}${check.name}${reset}${pad}  ${color}${check.status}${reset}${detail}`);
  }

  const passCount = checks.filter(c => c.status === 'PASS').length;
  const degradedCount = checks.filter(c => c.status === 'DEGRADED').length;
  const failCount = checks.filter(c => c.status === 'FAIL').length;

  console.log('');
  const overallStatus = failCount > 0 ? 'ISSUES DETECTED' : degradedCount > 0 ? 'DEGRADED (DEMO SAFE)' : 'ALL SYSTEMS GO';
  const overallColor = failCount > 0 ? '\x1b[31m' : degradedCount > 0 ? '\x1b[33m' : '\x1b[32m';
  console.log(`  ${overallColor}${bold}${overallStatus}${reset}  —  ${passCount} pass, ${degradedCount} degraded, ${failCount} fail`);
  console.log('');

  return { checks, summary: { pass: passCount, degraded: degradedCount, fail: failCount, overall: overallStatus } };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await checkExpress();
  await checkDatabase();
  await checkMLService();
  await checkSarvam();
  await checkRealityDefender();

  const result = printResults();

  // Exit code: 0 if all pass or degraded, 1 if any fail
  if (result.summary.fail > 0) process.exit(1);
  process.exit(0);
}

// Also export for use as an HTTP endpoint
export async function runPreflight() {
  checks.length = 0; // reset
  await checkExpress();
  await checkDatabase();
  await checkMLService();
  await checkSarvam();
  await checkRealityDefender();

  const passCount = checks.filter(c => c.status === 'PASS').length;
  const degradedCount = checks.filter(c => c.status === 'DEGRADED').length;
  const failCount = checks.filter(c => c.status === 'FAIL').length;
  const overall = failCount > 0 ? 'ISSUES_DETECTED' : degradedCount > 0 ? 'DEGRADED' : 'ALL_SYSTEMS_GO';

  return {
    timestamp: new Date().toISOString(),
    checks: [...checks],
    summary: { pass: passCount, degraded: degradedCount, fail: failCount, overall }
  };
}

// Run as CLI script if invoked directly
const isMain = process.argv[1]?.replace(/\\/g, '/').includes('preflight');
if (isMain) {
  main().catch(err => {
    console.error('Preflight failed:', err.message);
    process.exit(1);
  });
}
