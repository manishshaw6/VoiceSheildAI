/**
 * VoxShield Validation — Test Audio Generator
 * Generates synthetic WAV files for pipeline validation.
 * These are NOT real speech — results must be labelled as prototype validation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, 'samples');
const METADATA_PATH = path.join(__dirname, 'metadata.json');

// WAV file parameters
const SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

function createWavBuffer(samples, sampleRate = SAMPLE_RATE) {
  const dataLength = samples.length * 2; // 16-bit PCM
  const headerLength = 44;
  const buffer = Buffer.alloc(headerLength + dataLength);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);            // chunk size
  buffer.writeUInt16LE(1, 20);             // PCM format
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * NUM_CHANNELS * BITS_PER_SAMPLE / 8, 28);
  buffer.writeUInt16LE(NUM_CHANNELS * BITS_PER_SAMPLE / 8, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), headerLength + i * 2);
  }

  return buffer;
}

function generateTone(frequency, durationSec, amplitude = 0.6, sampleRate = SAMPLE_RATE) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return samples;
}

function addNoise(samples, noiseLevel = 0.1) {
  const noisy = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    noisy[i] = samples[i] + (Math.random() * 2 - 1) * noiseLevel;
  }
  return noisy;
}

function generateWhiteNoise(durationSec, amplitude = 0.3, sampleRate = SAMPLE_RATE) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return samples;
}

function generateSilence(durationSec, sampleRate = SAMPLE_RATE) {
  return new Float32Array(Math.floor(sampleRate * durationSec));
}

function generateMultiTone(frequencies, durationSec, amplitude = 0.4, sampleRate = SAMPLE_RATE) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    let sum = 0;
    for (const freq of frequencies) {
      sum += Math.sin(2 * Math.PI * freq * i / sampleRate);
    }
    samples[i] = (sum / frequencies.length) * amplitude;
  }
  return samples;
}

// ─── Sample Definitions ───────────────────────────────────────────────────────

const SAMPLES = [
  {
    id: 'sample_A_genuine_enrolled',
    filename: 'sample_A_genuine_enrolled.wav',
    description: 'Genuine enrolled speaker baseline — 440Hz tone, clean',
    generator: () => generateTone(440, 3, 0.6),
    metadata: {
      speaker_id: 'speaker_genuine', language: 'en', known_speaker: true,
      synthetic: false, scam_intent: false, expected_risk_class: 'SAFE'
    }
  },
  {
    id: 'sample_B_same_speaker',
    filename: 'sample_B_same_speaker.wav',
    description: 'Same speaker second sample — 440Hz tone with slight noise',
    generator: () => addNoise(generateTone(440, 3, 0.6), 0.02),
    metadata: {
      speaker_id: 'speaker_genuine', language: 'en', known_speaker: true,
      synthetic: false, scam_intent: false, expected_risk_class: 'SAFE'
    }
  },
  {
    id: 'sample_C_different_speaker',
    filename: 'sample_C_different_speaker.wav',
    description: 'Different speaker — 880Hz tone, clean',
    generator: () => generateTone(880, 3, 0.6),
    metadata: {
      speaker_id: 'speaker_different', language: 'en', known_speaker: false,
      synthetic: false, scam_intent: false, expected_risk_class: 'SAFE'
    }
  },
  {
    id: 'sample_D_different_scam',
    filename: 'sample_D_different_scam.wav',
    description: 'Different speaker + scam intent (simulated) — 880Hz + noise',
    generator: () => addNoise(generateTone(880, 3, 0.6), 0.05),
    metadata: {
      speaker_id: 'speaker_different', language: 'en', known_speaker: false,
      synthetic: false, scam_intent: true, expected_risk_class: 'HIGH'
    }
  },
  {
    id: 'sample_E_synthetic_generic',
    filename: 'sample_E_synthetic_generic.wav',
    description: 'Synthetic generic voice (simulated) — multi-tone pattern',
    generator: () => generateMultiTone([440, 660, 880], 3, 0.4),
    metadata: {
      speaker_id: 'speaker_synthetic', language: 'en', known_speaker: false,
      synthetic: true, scam_intent: true, expected_risk_class: 'CRITICAL'
    }
  },
  {
    id: 'sample_F_too_short',
    filename: 'sample_F_too_short.wav',
    description: 'Too short for reliable analysis — 0.3s',
    generator: () => generateTone(440, 0.3, 0.6),
    metadata: {
      speaker_id: 'speaker_genuine', language: 'en', known_speaker: true,
      synthetic: false, scam_intent: false, expected_risk_class: 'INSUFFICIENT'
    }
  },
  {
    id: 'sample_G_noisy',
    filename: 'sample_G_noisy.wav',
    description: 'Pure white noise — degraded audio quality',
    generator: () => generateWhiteNoise(3, 0.3),
    metadata: {
      speaker_id: 'unknown', language: 'unknown', known_speaker: false,
      synthetic: false, scam_intent: false, expected_risk_class: 'DEGRADED'
    }
  },
  {
    id: 'sample_H_near_silence',
    filename: 'sample_H_near_silence.wav',
    description: 'Near silence — quality gate should reject',
    generator: () => addNoise(generateSilence(3), 0.001),
    metadata: {
      speaker_id: 'unknown', language: 'unknown', known_speaker: false,
      synthetic: false, scam_intent: false, expected_risk_class: 'AUDIO_UNUSABLE'
    }
  }
];

// ─── Generate ─────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });

  const metadata = [];

  for (const sample of SAMPLES) {
    const samples = sample.generator();
    const wavBuffer = createWavBuffer(samples);
    const outputPath = path.join(SAMPLES_DIR, sample.filename);
    fs.writeFileSync(outputPath, wavBuffer);

    const entry = {
      sample_id: sample.id,
      filename: sample.filename,
      description: sample.description,
      duration_sec: samples.length / SAMPLE_RATE,
      file_size_bytes: wavBuffer.length,
      sample_rate: SAMPLE_RATE,
      ...sample.metadata
    };
    metadata.push(entry);

    console.log(`✓ Generated ${sample.filename} (${wavBuffer.length} bytes, ${(samples.length / SAMPLE_RATE).toFixed(1)}s)`);
  }

  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
  console.log(`\n✓ Metadata written to ${METADATA_PATH}`);
  console.log(`✓ ${SAMPLES.length} samples generated in ${SAMPLES_DIR}`);
}

main();
