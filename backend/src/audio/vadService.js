import { config } from '../config/index.js';

/** Lightweight energy-based VAD behind a stable abstraction. */
export class EnergyVoiceActivityDetector {
  constructor({ frameMs = 30, threshold = 0.015, minSpeechMs = 120 } = {}) {
    this.frameMs = frameMs;
    this.threshold = threshold;
    this.minSpeechMs = minSpeechMs;
  }

  detect(samples, sampleRate) {
    const frameSize = Math.max(1, Math.floor(sampleRate * this.frameMs / 1000));
    const windows = [];
    let startFrame = null;
    const frameCount = Math.ceil(samples.length / frameSize);
    for (let frame = 0; frame < frameCount; frame++) {
      let sum = 0;
      const start = frame * frameSize;
      const end = Math.min(samples.length, start + frameSize);
      for (let i = start; i < end; i++) sum += samples[i] * samples[i];
      const speech = Math.sqrt(sum / Math.max(1, end - start)) >= this.threshold;
      if (speech && startFrame == null) startFrame = frame;
      if ((!speech || frame === frameCount - 1) && startFrame != null) {
        const endFrame = speech && frame === frameCount - 1 ? frame + 1 : frame;
        const startSec = startFrame * this.frameMs / 1000;
        const endSec = Math.min(samples.length / sampleRate, endFrame * this.frameMs / 1000);
        if ((endSec - startSec) * 1000 >= this.minSpeechMs) windows.push({ start: startSec, end: endSec });
        startFrame = null;
      }
    }
    const speechDuration = windows.reduce((sum, item) => sum + item.end - item.start, 0);
    return { available: true, windows, speechDuration: Number(speechDuration.toFixed(3)),
      speechRatio: Number((speechDuration / Math.max(samples.length / sampleRate, 0.001)).toFixed(3)) };
  }
}

export const voiceActivityDetector = new EnergyVoiceActivityDetector({ threshold: config.audio.vadRmsThreshold });
