/**
 * VoxShield AI — Audio Quality Gate
 * Validates audio before any expensive analysis.
 * Calculates duration, RMS, silence ratio, clipping ratio, basic SNR estimate.
 * If audio is unusable, analysis must NOT fabricate intelligence results.
 */

import fs from 'fs';
import { createAudioQualityResult } from '../schemas/evidence.js';
import { config } from '../config/index.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'audio_quality_gate' });

/**
 * Analyzes audio quality from a file buffer.
 * Supports WAV files natively; for other formats returns a basic assessment.
 *
 * @param {Buffer} audioBuffer - Raw file buffer
 * @param {string} [filename] - Original filename for format detection
 * @returns {import('../schemas/evidence.js').AudioQualityResult}
 */
export function assessAudioQuality(audioBuffer, filename = '') {
  const warnings = [];

  if (!audioBuffer || audioBuffer.length === 0) {
    return createAudioQualityResult({
      usable: false,
      qualityScore: 0,
      warnings: ['Audio buffer is empty']
    });
  }

  const fileSizeKB = audioBuffer.length / 1024;
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  const isWav = ext === '.wav' || (audioBuffer.length > 4 && audioBuffer.toString('utf8', 0, 4) === 'RIFF');

  // ─── WAV-specific deep analysis ───────────────────────────────────────

  if (isWav && audioBuffer.length > 44) {
    return analyzeWavBuffer(audioBuffer, warnings);
  }

  // ─── Non-WAV basic assessment (size-based heuristic) ──────────────────

  // For non-WAV formats, we can't easily parse without an audio library.
  // Provide a basic size-based estimate.
  const estimatedDuration = estimateDurationFromSize(audioBuffer.length, ext);

  if (estimatedDuration < config.audio.minDurationSec) {
    warnings.push(`Estimated audio too short (${estimatedDuration.toFixed(1)}s)`);
  }

  if (fileSizeKB < 1) {
    warnings.push('Audio file is extremely small');
    return createAudioQualityResult({
      usable: false,
      duration: estimatedDuration,
      qualityScore: 0.1,
      warnings
    });
  }

  return createAudioQualityResult({
    usable: true,
    duration: estimatedDuration,
    qualityScore: 0.7, // default for non-WAV since we can't analyze deeply
    warnings: warnings.length > 0 ? warnings : ['Non-WAV format; detailed quality analysis requires preprocessing']
  });
}

/**
 * Deep analysis of WAV audio buffers.
 */
function analyzeWavBuffer(buffer, warnings) {
  // Parse WAV header
  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataSize = buffer.length - 44;

  try {
    // Read fmt chunk
    channels = buffer.readUInt16LE(22);
    sampleRate = buffer.readUInt32LE(24);
    bitsPerSample = buffer.readUInt16LE(34);

    // Find data chunk
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('utf8', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }
  } catch {
    warnings.push('Could not fully parse WAV header');
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / bytesPerSample);
  const duration = totalSamples / (sampleRate * channels);

  // ─── Duration check ───────────────────────────────────────────────────

  if (duration < config.audio.minDurationSec) {
    warnings.push(`Audio too short: ${duration.toFixed(2)}s (minimum ${config.audio.minDurationSec}s)`);
    return createAudioQualityResult({
      usable: false,
      duration,
      sampleRate,
      channels,
      qualityScore: 0.1,
      warnings
    });
  }

  // ─── Extract PCM samples for analysis ─────────────────────────────────

  const sampleCount = Math.min(totalSamples, sampleRate * channels * 60); // Max 60s for analysis
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const bytePos = dataOffset + i * bytesPerSample;
    if (bytePos + bytesPerSample <= buffer.length) {
      if (bitsPerSample === 16) {
        samples[i] = buffer.readInt16LE(bytePos) / 32768.0;
      } else if (bitsPerSample === 8) {
        samples[i] = (buffer.readUInt8(bytePos) - 128) / 128.0;
      } else {
        samples[i] = buffer.readInt16LE(bytePos) / 32768.0;
      }
    }
  }

  // ─── RMS Level ────────────────────────────────────────────────────────

  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rmsLevel = Math.sqrt(sumSquares / sampleCount);

  // ─── Silence Ratio ────────────────────────────────────────────────────

  const silenceThreshold = 0.01; // samples below this amplitude are "silent"
  let silentSamples = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (Math.abs(samples[i]) < silenceThreshold) {
      silentSamples++;
    }
  }
  const silenceRatio = silentSamples / sampleCount;

  // ─── Clipping Ratio ───────────────────────────────────────────────────

  const clipThreshold = 0.99;
  let clippedSamples = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (Math.abs(samples[i]) >= clipThreshold) {
      clippedSamples++;
    }
  }
  const clippingRatio = clippedSamples / sampleCount;

  // ─── Basic SNR Estimate ───────────────────────────────────────────────

  // Estimate noise from quiet regions, signal from loud regions
  const frameSize = Math.min(512, sampleCount);
  const numFrames = Math.floor(sampleCount / frameSize);
  const frameEnergies = [];

  for (let f = 0; f < numFrames; f++) {
    let frameEnergy = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[f * frameSize + i];
      frameEnergy += s * s;
    }
    frameEnergies.push(frameEnergy / frameSize);
  }

  frameEnergies.sort((a, b) => a - b);
  const noiseFloor = frameEnergies.length > 2 ? frameEnergies[Math.floor(frameEnergies.length * 0.1)] : 0.0001;
  const signalLevel = frameEnergies.length > 2 ? frameEnergies[Math.floor(frameEnergies.length * 0.9)] : rmsLevel * rmsLevel;
  const snrEstimate = noiseFloor > 0 ? 10 * Math.log10(signalLevel / noiseFloor) : 30;

  // ─── Quality Score ────────────────────────────────────────────────────

  let qualityScore = 1.0;

  // Penalize high silence
  if (silenceRatio > 0.95) {
    qualityScore -= 0.6;
    warnings.push(`Very high silence ratio (${(silenceRatio * 100).toFixed(1)}%)`);
  } else if (silenceRatio > 0.80) {
    qualityScore -= 0.3;
    warnings.push(`High silence ratio (${(silenceRatio * 100).toFixed(1)}%)`);
  }

  // Penalize clipping
  if (clippingRatio > 0.10) {
    qualityScore -= 0.3;
    warnings.push(`Significant audio clipping (${(clippingRatio * 100).toFixed(1)}%)`);
  } else if (clippingRatio > 0.02) {
    qualityScore -= 0.1;
    warnings.push(`Some audio clipping detected (${(clippingRatio * 100).toFixed(1)}%)`);
  }

  // Penalize very low RMS (near-silent audio)
  if (rmsLevel < 0.005) {
    qualityScore -= 0.4;
    warnings.push('Audio signal level is extremely low');
  } else if (rmsLevel < 0.02) {
    qualityScore -= 0.15;
    warnings.push('Audio signal level is low');
  }

  // Penalize low SNR
  if (snrEstimate < 5) {
    qualityScore -= 0.2;
    warnings.push(`Low signal-to-noise ratio (${snrEstimate.toFixed(1)} dB)`);
  }

  qualityScore = Math.max(0, Math.min(1, qualityScore));

  const usable = qualityScore >= 0.3 && silenceRatio < 0.98 && rmsLevel > 0.002;

  if (!usable) {
    warnings.push('Audio quality is too low for reliable analysis');
  }

  logger.info('audio.quality_assessed', {
    duration: Number(duration.toFixed(2)),
    sample_rate: sampleRate,
    channels,
    rms: Number(rmsLevel.toFixed(4)),
    silence_ratio: Number(silenceRatio.toFixed(3)),
    clipping_ratio: Number(clippingRatio.toFixed(4)),
    snr_estimate: Number(snrEstimate.toFixed(1)),
    quality_score: Number(qualityScore.toFixed(2)),
    usable
  });

  return createAudioQualityResult({
    usable,
    duration: Number(duration.toFixed(2)),
    sampleRate,
    channels,
    silenceRatio: Number(silenceRatio.toFixed(3)),
    clippingRatio: Number(clippingRatio.toFixed(4)),
    rmsLevel: Number(rmsLevel.toFixed(4)),
    snrEstimate: Number(snrEstimate.toFixed(1)),
    qualityScore: Number(qualityScore.toFixed(2)),
    warnings
  });
}

/**
 * Estimates audio duration from file size for non-WAV formats.
 */
function estimateDurationFromSize(sizeBytes, ext) {
  // Rough bitrate estimates
  const bitrateEstimates = {
    '.mp3': 128000,     // 128 kbps
    '.m4a': 128000,
    '.ogg': 96000,
    '.webm': 64000,
    '.wav': 256000      // 16kHz 16-bit mono
  };

  const bitrate = bitrateEstimates[ext] || 128000;
  return (sizeBytes * 8) / bitrate;
}
