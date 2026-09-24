/**
 * Browser-side acoustic evidence fallback.
 *
 * This keeps visual evidence available for formats the server cannot decode
 * locally (for example, WebM microphone recordings when FFmpeg is absent).
 * All values are calculated from the selected audio samples; no chart data is
 * invented or inferred from the risk score.
 */
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));

function mixToMono(audioBuffer) {
  const output = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const input = audioBuffer.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) output[index] += input[index] / audioBuffer.numberOfChannels;
  }
  return output;
}

function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
function melToHz(mel) { return 700 * (10 ** (mel / 2595) - 1); }

export async function extractClientForensics(file) {
  if (!file) return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
    const samples = mixToMono(decoded);
    const sampleRate = decoded.sampleRate;
    const duration = decoded.duration;
    if (!samples.length || !Number.isFinite(duration)) return null;

    const pointCount = Math.min(1000, Math.max(160, Math.floor(duration * 80)));
    const step = Math.max(1, Math.floor(samples.length / pointCount));
    const times = [];
    const amplitudes = [];
    const peaks = [];
    for (let start = 0; start < samples.length; start += step) {
      const end = Math.min(samples.length, start + step);
      let min = 0;
      let max = 0;
      for (let i = start; i < end; i += 1) {
        min = Math.min(min, samples[i]);
        max = Math.max(max, samples[i]);
      }
      times.push(round(start / sampleRate));
      amplitudes.push(round(samples[start]));
      peaks.push([round(min), round(max)]);
    }

    // 64 logarithmically-spaced spectral bands across up to 128 real frames.
    const fftSize = 512;
    const bandCount = 64;
    const timeBins = Math.min(128, Math.max(24, Math.floor(duration * 2)));
    const nyquist = sampleRate / 2;
    const minMel = hzToMel(80);
    const maxMel = hzToMel(Math.min(8000, nyquist));
    const frequencies = Array.from({ length: bandCount }, (_, i) => round(melToHz(minMel + ((maxMel - minMel) * i) / (bandCount - 1)), 1));
    const values = [];
    const melTimes = [];
    const windowScale = 2 / fftSize;
    for (let frame = 0; frame < timeBins; frame += 1) {
      const center = Math.floor(((frame + 0.5) / timeBins) * samples.length);
      const start = center - Math.floor(fftSize / 2);
      const row = [];
      let rowPeak = -120;
      for (let band = 0; band < bandCount; band += 1) {
        const bin = Math.max(1, Math.min(Math.floor(fftSize / 2) - 1, Math.round((frequencies[band] / sampleRate) * fftSize)));
        let real = 0;
        let imaginary = 0;
        for (let n = 0; n < fftSize; n += 1) {
          const sampleIndex = start + n;
          const sample = sampleIndex >= 0 && sampleIndex < samples.length ? samples[sampleIndex] : 0;
          const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (fftSize - 1));
          const angle = (2 * Math.PI * bin * n) / fftSize;
          real += sample * window * Math.cos(angle);
          imaginary -= sample * window * Math.sin(angle);
        }
        const db = 20 * Math.log10(Math.max(1e-7, Math.hypot(real, imaginary) * windowScale));
        row.push(db);
        rowPeak = Math.max(rowPeak, db);
      }
      values.push(row.map(value => round(Math.max(-80, value - rowPeak), 2)));
      melTimes.push(round(center / sampleRate, 3));
    }

    return {
      available: true,
      provider: 'browser_audio_decoder',
      metadata: { duration: round(duration, 3), sample_rate: sampleRate, processed_sample_rate: sampleRate, channels: decoded.numberOfChannels, total_samples: samples.length },
      waveform: { times, amplitudes, peaks, resolution: peaks.length },
      log_mel_spectrogram: { times: melTimes, frequencies, values, bands_count: bandCount },
      summary: { duration_sec: round(duration, 2), sample_rate_hz: sampleRate, peak_amplitude: round(Math.max(...peaks.map(([min, max]) => Math.max(Math.abs(min), Math.abs(max)))), 3) }
    };
  } finally {
    await context.close();
  }
}

export function hasVisualForensics(forensics) {
  return Boolean(forensics?.waveform?.peaks?.length && forensics?.log_mel_spectrogram?.values?.length);
}
