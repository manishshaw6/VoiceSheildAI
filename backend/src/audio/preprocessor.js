/**
 * VoxShield AI — Audio Preprocessor
 * Reusable pipeline: decode → mono → resample → normalize → optional denoise → chunk.
 * Keeps original evidence intact; never overwrites forensic source audio.
 */

import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'audio_preprocessor' });

/**
 * Extracts PCM Float32 samples from a WAV buffer.
 * For non-WAV formats, returns null (requires external decoder).
 *
 * @param {Buffer} buffer - Audio file buffer
 * @returns {{ samples: Float32Array, sampleRate: number, channels: number } | null}
 */
export function decodeWavBuffer(buffer) {
  if (!buffer || buffer.length < 44) return null;
  if (buffer.toString('utf8', 0, 4) !== 'RIFF') return null;

  try {
    const channels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);

    // Find data chunk
    let dataOffset = 44;
    let dataSize = buffer.length - 44;
    let offset = 12;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('utf8', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = Math.min(chunkSize, buffer.length - dataOffset);
        break;
      }
      offset += 8 + chunkSize;
    }

    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = Math.floor(dataSize / bytesPerSample);
    const samples = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      const bytePos = dataOffset + i * bytesPerSample;
      if (bytePos + bytesPerSample <= buffer.length) {
        if (bitsPerSample === 16) {
          samples[i] = buffer.readInt16LE(bytePos) / 32768.0;
        } else if (bitsPerSample === 8) {
          samples[i] = (buffer.readUInt8(bytePos) - 128) / 128.0;
        } else if (bitsPerSample === 32) {
          samples[i] = buffer.readFloatLE(bytePos);
        }
      }
    }

    return { samples, sampleRate, channels };
  } catch (err) {
    logger.warn('audio.decode_failed', { error: err.message });
    return null;
  }
}

/**
 * Converts multi-channel audio to mono by averaging channels.
 *
 * @param {Float32Array} samples - Interleaved multi-channel samples
 * @param {number} channels - Number of channels
 * @returns {Float32Array} Mono samples
 */
export function toMono(samples, channels) {
  if (channels <= 1) return samples;

  const monoLength = Math.floor(samples.length / channels);
  const mono = new Float32Array(monoLength);

  for (let i = 0; i < monoLength; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += samples[i * channels + ch];
    }
    mono[i] = sum / channels;
  }

  return mono;
}

/**
 * Simple linear resampling.
 * For production ML use, a proper resampler (e.g., libsamplerate) is preferred.
 *
 * @param {Float32Array} samples
 * @param {number} fromRate
 * @param {number} toRate
 * @returns {Float32Array}
 */
export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;

  const ratio = toRate / fromRate;
  const newLength = Math.round(samples.length * ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcPos = i / ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    if (srcIdx + 1 < samples.length) {
      resampled[i] = samples[srcIdx] * (1 - frac) + samples[srcIdx + 1] * frac;
    } else if (srcIdx < samples.length) {
      resampled[i] = samples[srcIdx];
    }
  }

  return resampled;
}

/**
 * Peak-normalizes audio to a target maximum amplitude.
 *
 * @param {Float32Array} samples
 * @param {number} [targetMax=0.95] - Target peak amplitude
 * @returns {Float32Array}
 */
export function normalize(samples, targetMax = 0.95) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }

  if (peak === 0 || peak >= targetMax * 0.9) return samples;

  const gain = targetMax / peak;
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * gain;
  }

  return normalized;
}

/**
 * Splits audio into chunks of a given length in seconds.
 *
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {number} chunkLengthSec
 * @returns {Float32Array[]}
 */
export function chunk(samples, sampleRate, chunkLengthSec) {
  const chunkSize = Math.floor(sampleRate * chunkLengthSec);
  const chunks = [];

  for (let offset = 0; offset < samples.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, samples.length);
    chunks.push(samples.slice(offset, end));
  }

  return chunks;
}

/**
 * Full preprocessing pipeline for WAV buffers.
 * decode → mono → resample to 16kHz → normalize
 *
 * @param {Buffer} audioBuffer
 * @param {object} [options]
 * @param {number} [options.targetSampleRate=16000]
 * @param {boolean} [options.shouldNormalize=true]
 * @returns {{ samples: Float32Array, sampleRate: number, duration: number } | null}
 */
export function preprocessWav(audioBuffer, { targetSampleRate = 16000, shouldNormalize = true } = {}) {
  const timer = logger.startTimer();

  const decoded = decodeWavBuffer(audioBuffer);
  if (!decoded) {
    logger.warn('audio.preprocess_failed', { reason: 'Could not decode WAV' });
    return null;
  }

  let { samples, sampleRate, channels } = decoded;

  // Mono
  if (channels > 1) {
    samples = toMono(samples, channels);
  }

  // Resample
  if (sampleRate !== targetSampleRate) {
    samples = resample(samples, sampleRate, targetSampleRate);
    sampleRate = targetSampleRate;
  }

  // Normalize
  if (shouldNormalize) {
    samples = normalize(samples);
  }

  const duration = samples.length / sampleRate;

  timer.end('audio.preprocessed', {
    original_rate: decoded.sampleRate,
    target_rate: sampleRate,
    original_channels: decoded.channels,
    duration: Number(duration.toFixed(2)),
    samples: samples.length
  });

  return { samples, sampleRate, duration };
}
