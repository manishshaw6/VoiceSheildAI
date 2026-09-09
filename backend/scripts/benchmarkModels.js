import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

const input = process.argv[2];
const baseUrl = (process.env.BENCHMARK_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
if (!input) {
  console.error('Usage: npm run benchmark -- <audio-file>');
  process.exitCode = 1;
} else {
  const audio = await fs.readFile(input);
  const form = new FormData();
  form.append('audio', new Blob([audio]), path.basename(input));
  const start = performance.now();
  const response = await fetch(`${baseUrl}/api/audio/analyze`, { method: 'POST', body: form });
  const body = await response.json();
  const totalMs = Math.round(performance.now() - start);
  if (!response.ok) throw new Error(`Analysis failed (${response.status}): ${body?.error?.code || body?.state || 'unknown'}`);
  const duration = body.duration || 0;
  const telemetry = body.telemetry || {};
  console.log(JSON.stringify({ audio_duration_s: duration, preprocessing_ms: telemetry.preprocessingMs ?? null,
    deepfake_ms: telemetry.deepfakeMs ?? null, whisper_ms: telemetry.whisperMs ?? telemetry.sttMs ?? null,
    speaker_ms: telemetry.speakerMs ?? null, context_ms: telemetry.contextMs ?? null, fusion_ms: telemetry.fusionMs ?? null,
    total_ms: totalMs, rtf: duration > 0 ? Number(((totalMs / 1000) / duration).toFixed(3)) : null,
    providers: { transcription: body.transcription?.provider, speaker: body.speaker?.provider } }, null, 2));
}
