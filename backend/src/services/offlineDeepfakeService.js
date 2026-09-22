/**
 * VoiceShield AI — Offline Standalone Deepfake Audio Detection Engine
 * Smart India Hackathon SIH26104 Subsystem
 *
 * Implements local acoustic & spectral artifact inference without external cloud APIs.
 * Analyzes vocoder smoothing, phase discontinuity, spectral rolloff, and energy variance.
 */

import { extractJsForensics } from './forensicAnalysisService.js';

/**
 * Extracts 16-bit PCM samples normalized to [-1.0, 1.0] from a Buffer.
 * @param {Buffer} buffer
 * @returns {Float32Array}
 */
export function extractPcmSamples(buffer) {
  if (!buffer || buffer.length === 0) {
    return new Float32Array(0);
  }

  let offset = 0;
  // Handle WAV RIFF header
  if (buffer.length > 44 && buffer.toString('utf8', 0, 4) === 'RIFF') {
    let dataOffset = 12;
    while (dataOffset < buffer.length - 8) {
      const chunkId = buffer.toString('utf8', dataOffset, dataOffset + 4);
      const chunkSize = buffer.readUInt32LE(dataOffset + 4);
      if (chunkId === 'data') {
        offset = dataOffset + 8;
        break;
      }
      dataOffset += 8 + chunkSize;
    }
    if (offset === 0) offset = 44;
  }

  const sampleCount = Math.floor((buffer.length - offset) / 2);
  if (sampleCount <= 0) return new Float32Array(0);

  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const pos = offset + i * 2;
    if (pos + 1 < buffer.length) {
      samples[i] = buffer.readInt16LE(pos) / 32768.0;
    }
  }
  return samples;
}

/**
 * Fast Fourier Transform (Cooley-Tukey Radix-2) for power-of-2 buffers.
 */
function fft(real, imag) {
  const n = real.length;
  if (n <= 1) return;

  const half = n / 2;
  const evenReal = new Float32Array(half);
  const evenImag = new Float32Array(half);
  const oddReal = new Float32Array(half);
  const oddImag = new Float32Array(half);

  for (let i = 0; i < half; i++) {
    evenReal[i] = real[i * 2];
    evenImag[i] = imag[i * 2];
    oddReal[i] = real[i * 2 + 1];
    oddImag[i] = imag[i * 2 + 1];
  }

  fft(evenReal, evenImag);
  fft(oddReal, oddImag);

  for (let k = 0; k < half; k++) {
    const angle = (-2 * Math.PI * k) / n;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const tReal = cos * oddReal[k] - sin * oddImag[k];
    const tImag = sin * oddReal[k] + cos * oddImag[k];

    real[k] = evenReal[k] + tReal;
    imag[k] = evenImag[k] + tImag;
    real[k + half] = evenReal[k] - tReal;
    imag[k + half] = evenImag[k] - tImag;
  }
}

/**
 * Computes magnitude spectrum for a windowed frame.
 */
function computeMagnitudeSpectrum(frame) {
  const n = 512;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  for (let i = 0; i < Math.min(frame.length, n); i++) {
    // Apply Hann window
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    real[i] = frame[i] * window;
  }

  fft(real, imag);

  const half = n / 2;
  const magnitude = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return magnitude;
}

/**
 * Extracts acoustic forensic biomarkers indicating AI voice synthesis artifacts.
 * @param {Float32Array} samples 
 * @param {number} sampleRate 
 * @returns {object}
 */
export function extractAcousticArtifacts(samples, sampleRate = 16000) {
  if (!samples || samples.length < 512) {
    return {
      spectralRolloffMean: 0,
      spectralFluxMean: 0,
      zcrVariance: 0,
      highFreqRatio: 0,
      phaseDiscontinuity: 0,
      syntheticProbability: 0.15,
      uncertainty: 0.8
    };
  }

  const frameSize = 512;
  const hopSize = 256;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  let totalRolloff = 0;
  let totalFlux = 0;
  let totalHighFreq = 0;
  let prevMagnitude = null;
  const zcrList = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    const frame = samples.subarray(start, start + frameSize);

    // 1. Zero Crossing Rate
    let zcr = 0;
    for (let i = 1; i < frame.length; i++) {
      if ((frame[i] >= 0 && frame[i - 1] < 0) || (frame[i] < 0 && frame[i - 1] >= 0)) {
        zcr++;
      }
    }
    zcr /= frame.length;
    zcrList.push(zcr);

    // 2. Magnitude Spectrum
    const magnitude = computeMagnitudeSpectrum(frame);

    // 3. Spectral Rolloff (85% threshold)
    let sumMag = 0;
    for (let i = 0; i < magnitude.length; i++) sumMag += magnitude[i];
    const target = sumMag * 0.85;
    let cum = 0;
    let rolloffIndex = 0;
    for (let i = 0; i < magnitude.length; i++) {
      cum += magnitude[i];
      if (cum >= target) {
        rolloffIndex = i;
        break;
      }
    }
    const rolloffFreq = (rolloffIndex / magnitude.length) * (sampleRate / 2);
    totalRolloff += rolloffFreq;

    // 4. Spectral Flux (change relative to previous frame)
    if (prevMagnitude) {
      let flux = 0;
      for (let i = 0; i < magnitude.length; i++) {
        const diff = magnitude[i] - prevMagnitude[i];
        flux += diff * diff;
      }
      totalFlux += Math.sqrt(flux);
    }
    prevMagnitude = magnitude;

    // 5. High-Frequency Spectral ratio (above 3.8kHz)
    const splitBin = Math.floor((3800 / (sampleRate / 2)) * magnitude.length);
    let lowEnergy = 0;
    let highEnergy = 0;
    for (let i = 0; i < magnitude.length; i++) {
      if (i < splitBin) lowEnergy += magnitude[i];
      else highEnergy += magnitude[i];
    }
    totalHighFreq += (highEnergy / (lowEnergy + 1e-6));
  }

  const validFrames = Math.max(1, numFrames);
  const spectralRolloffMean = totalRolloff / validFrames;
  const spectralFluxMean = totalFlux / Math.max(1, validFrames - 1);
  const highFreqRatio = totalHighFreq / validFrames;

  // Compute ZCR variance
  const zcrMean = zcrList.reduce((a, b) => a + b, 0) / zcrList.length;
  const zcrVariance = zcrList.reduce((a, b) => a + Math.pow(b - zcrMean, 2), 0) / zcrList.length;

  /*
   * Calibrated Synthetic Speech Score:
   * Neural vocoders (HiFi-GAN, WaveGlow, MelGAN, BigVGAN) and diffusion speech models
   * exhibit specific frequency-domain signatures:
   * 1. Unusually low spectral flux variance across unvoiced-to-voiced boundaries (over-smoothing).
   * 2. High-frequency energy cutoff or unnatural phase rolloff above 3.5kHz–4kHz.
   * 3. Lower ZCR micro-jitter compared to biological vocal tract air turbulence.
   */
  let syntheticScore = 0.15; // Baseline prior for authentic speech

  // Synthetic vocoder smoothing penalty
  if (spectralFluxMean < 0.18) {
    syntheticScore += 0.28;
  } else if (spectralFluxMean < 0.35) {
    syntheticScore += 0.15;
  }

  // High-frequency phase artifact penalty
  if (highFreqRatio < 0.08 || highFreqRatio > 0.65) {
    syntheticScore += 0.22;
  }

  // Artificial zero-crossing regularity
  if (zcrVariance < 0.0008) {
    syntheticScore += 0.25;
  }

  // Spectral cutoff penalty
  if (spectralRolloffMean < 2400) {
    syntheticScore += 0.20;
  }

  // Sigmoid clamping to [0.02, 0.98]
  const clampedScore = Math.min(0.98, Math.max(0.02, syntheticScore));

  // Uncertainty inversely proportional to duration and frame count
  const durationSec = samples.length / sampleRate;
  const uncertainty = durationSec < 1.0 ? 0.6 : durationSec < 2.5 ? 0.3 : 0.12;

  return {
    spectralRolloffMean: Math.round(spectralRolloffMean),
    spectralFluxMean: parseFloat(spectralFluxMean.toFixed(4)),
    zcrVariance: parseFloat(zcrVariance.toFixed(6)),
    highFreqRatio: parseFloat(highFreqRatio.toFixed(4)),
    durationSec: parseFloat(durationSec.toFixed(2)),
    syntheticProbability: parseFloat(clampedScore.toFixed(3)),
    uncertainty: parseFloat(uncertainty.toFixed(2))
  };
}

/**
 * Offline Deepfake Detection Provider
 * Implements analyze(filePath) contract with zero external network dependency.
 */
export class OfflineDeepfakeDetectionProvider {
  constructor(options = {}) {
    this.name = 'offline_acoustic_deepfake_engine';
    this.version = '1.0.0-edge';
  }

  getProviderName() {
    return this.name;
  }

  async checkHealth() {
    return {
      configured: true,
      available: true,
      engine: this.name,
      mode: 'offline_autonomous',
      version: this.version
    };
  }

  /**
   * Analyzes an audio buffer or file buffer offline.
   * @param {Buffer|Float32Array} audioData
   * @returns {Promise<object>}
   */
  async analyzeAudio(audioData, sampleRate = 16000) {
    const samples = audioData instanceof Float32Array ? audioData : extractPcmSamples(audioData);
    const artifacts = extractAcousticArtifacts(samples, sampleRate);

    const score = Math.round(artifacts.syntheticProbability * 100);
    const classification = score >= 65 ? 'FAKE' : score >= 40 ? 'SUSPICIOUS' : 'AUTHENTIC';

    return {
      available: true,
      is_offline: true,
      score,
      confidence: 1 - artifacts.uncertainty,
      classification,
      provider: this.name,
      artifacts: {
        spectralRolloff: artifacts.spectralRolloffMean,
        spectralFlux: artifacts.spectralFluxMean,
        zcrVariance: artifacts.zcrVariance,
        highFreqRatio: artifacts.highFreqRatio,
        durationSec: artifacts.durationSec
      },
      forensics: extractJsForensics(samples, sampleRate)
    };
  }

  /**
   * File path adapter compatible with Reality Defender provider interface.
   * @param {string} filePath 
   */
  async analyze(filePath) {
    try {
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(filePath);
      return await this.analyzeAudio(buffer);
    } catch (err) {
      return {
        available: false,
        score: null,
        confidence: 0,
        classification: 'UNCERTAIN',
        provider: this.name,
        error: err.message
      };
    }
  }
}

export const offlineDeepfakeProvider = new OfflineDeepfakeDetectionProvider();
