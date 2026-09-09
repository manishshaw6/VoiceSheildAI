/**
 * VoxShield Validation — faster-whisper STT Validation
 * Validates local faster-whisper model on all test samples.
 * Records transcription text, detected language, segments, latency, and Real-Time Factor (RTF).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MlServiceClient } from '../src/integrations/mlServiceClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, 'samples');
const METADATA_PATH = path.join(__dirname, 'metadata.json');

const mlClient = new MlServiceClient({ baseUrl: 'http://127.0.0.1:8001', timeoutMs: 30000 });

async function main() {
  console.log('====================================================');
  console.log('🎙️ VoxShield — Phase 5: faster-whisper Local Validation');
  console.log('====================================================\n');

  const health = await mlClient.health();
  console.log('ML Service Health:', JSON.stringify(health.whisper));
  if (!health.whisper?.loaded) {
    console.error('❌ faster-whisper model not loaded!');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  const results = [];

  for (const item of metadata) {
    const filePath = path.join(SAMPLES_DIR, item.filename);
    const audioBuffer = fs.readFileSync(filePath);
    const duration = item.duration_sec || 3.0;

    console.log(`\nTesting ${item.filename} (${duration}s)...`);
    const start = Date.now();
    const resp = await mlClient.transcribe(audioBuffer, item.filename);
    const latencyMs = Date.now() - start;
    const rtf = Number((latencyMs / (duration * 1000)).toFixed(3));

    console.log(`  Status: ${resp.available ? 'AVAILABLE' : 'REJECTED'}`);
    console.log(`  Model: ${resp.model || health.whisper.model} | Device: ${resp.device || health.whisper.device}`);
    console.log(`  Detected Language: ${resp.language || 'none'} (${((resp.language_probability || 0) * 100).toFixed(1)}%)`);
    console.log(`  Transcript: "${resp.text || ''}"`);
    console.log(`  Segments: ${resp.segments?.length || 0}`);
    console.log(`  Latency: ${latencyMs}ms | RTF: ${rtf}x`);

    results.push({
      sample_id: item.sample_id,
      filename: item.filename,
      duration_sec: duration,
      available: resp.available,
      language: resp.language || null,
      language_probability: resp.language_probability || null,
      text: resp.text || '',
      segment_count: resp.segments?.length || 0,
      latency_ms: latencyMs,
      rtf,
      error_reason: resp.reason || null
    });
  }

  const validRuns = results.filter(r => r.available);
  const avgLatency = Math.round(validRuns.reduce((sum, r) => sum + r.latency_ms, 0) / (validRuns.length || 1));
  const avgRtf = Number((validRuns.reduce((sum, r) => sum + r.rtf, 0) / (validRuns.length || 1)).toFixed(3));

  console.log('\n----------------------------------------------------');
  console.log(`Summary: ${validRuns.length}/${results.length} samples processed`);
  console.log(`Average Latency: ${avgLatency}ms | Average RTF: ${avgRtf}x`);
  console.log('----------------------------------------------------');

  const outData = {
    timestamp: new Date().toISOString(),
    whisper_health: health.whisper,
    summary: { total: results.length, processed: validRuns.length, avg_latency_ms: avgLatency, avg_rtf: avgRtf },
    samples: results
  };

  const resultsDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, 'whisper_validation_results.json');
  fs.writeFileSync(outPath, JSON.stringify(outData, null, 2));
  console.log(`✓ Results saved to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal Whisper validation error:', err);
  process.exit(1);
});
