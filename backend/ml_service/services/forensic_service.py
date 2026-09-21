"""
VoxShield AI — Voice Forensic Signal Analysis Engine
Acoustic, spectral, and temporal feature extraction for voice cyber-forensics.
Computes real physical signal properties: waveform envelopes, log-mel spectrogram,
MFCCs, spectral centroid/rolloff/bandwidth/flatness, pitch (F0) prosody, RMS energy,
zero-crossing rates, and frequency band distribution.
"""

import math
from pathlib import Path
from typing import Dict, Any, List
import numpy as np
import torch
import torchaudio

def _sanitize_float(val: Any, default: float = 0.0) -> float:
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return round(f, 4)
    except Exception:
        return default

def _sanitize_list(arr: Any, round_digits: int = 4) -> List[float]:
    result = []
    for x in arr:
        try:
            f = float(x)
            if math.isnan(f) or math.isinf(f):
                result.append(0.0)
            else:
                result.append(round(f, round_digits))
        except Exception:
            result.append(0.0)
    return result

class ForensicService:
    def __init__(self, target_sample_rate: int = 16000):
        self.target_sample_rate = target_sample_rate

    def extract(self, audio_path: str | Path) -> Dict[str, Any]:
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Load audio with torchaudio
        waveform, sr = torchaudio.load(str(path))
        channels = waveform.shape[0]

        # Convert to mono
        if channels > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        duration = float(waveform.shape[1]) / float(sr) if sr > 0 else 0.0

        # Resample to canonical 16kHz for uniform spectral analysis if needed
        if sr != self.target_sample_rate and sr > 0:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=self.target_sample_rate)
            waveform_16k = resampler(waveform)
            sr_active = self.target_sample_rate
        else:
            waveform_16k = waveform
            sr_active = sr

        samples = waveform_16k.squeeze(0).cpu().numpy()
        total_samples = len(samples)

        if total_samples == 0:
            return self._empty_result(duration=0.0, sr=sr, channels=channels)

        # 1. Downsampled Waveform (approx 800 - 1000 display points)
        target_points = 1000
        step = max(1, total_samples // target_points)
        time_step = float(step) / float(sr_active)
        
        downsampled_times = []
        downsampled_amplitudes = []
        downsampled_peaks = []

        for i in range(0, total_samples, step):
            chunk = samples[i:i + step]
            if len(chunk) == 0:
                continue
            t = float(i) / float(sr_active)
            downsampled_times.append(round(t, 4))
            # Representative sample + peak envelope
            max_amp = float(np.max(chunk))
            min_amp = float(np.min(chunk))
            downsampled_amplitudes.append(round(float(chunk[0]), 4))
            downsampled_peaks.append([round(min_amp, 4), round(max_amp, 4)])

        # 2. Frame-level Analysis: RMS Energy & Zero Crossing Rate
        frame_len = int(0.025 * sr_active) # 25ms
        hop_len = int(0.010 * sr_active)   # 10ms
        
        frame_times = []
        rms_values = []
        zcr_values = []

        for start in range(0, total_samples - frame_len, hop_len):
            frame = samples[start:start + frame_len]
            t = float(start + frame_len // 2) / float(sr_active)
            frame_times.append(round(t, 4))

            # RMS
            rms = np.sqrt(np.mean(frame ** 2) + 1e-12)
            rms_values.append(round(float(rms), 5))

            # Zero Crossing Rate
            zero_crossings = np.sum(np.abs(np.diff(np.sign(frame)))) / (2.0 * frame_len)
            zcr_values.append(round(float(zero_crossings), 5))

        mean_rms = float(np.mean(rms_values)) if rms_values else 0.0
        peak_rms = float(np.max(rms_values)) if rms_values else 0.0
        
        # Silence & Speech Ratio (threshold based on relative energy)
        silence_thresh = max(0.015, mean_rms * 0.3)
        voiced_mask = np.array(rms_values) > silence_thresh
        silence_ratio = float(np.sum(~voiced_mask)) / max(1, len(rms_values))
        speech_ratio = 1.0 - silence_ratio

        # 3. Spectral Features via STFT
        n_fft = 512
        window = torch.hann_window(frame_len)
        tensor_16k = torch.from_numpy(samples).float()
        
        # STFT
        stft = torch.stft(
            tensor_16k,
            n_fft=n_fft,
            hop_length=hop_len,
            win_length=frame_len,
            window=window,
            return_complex=True
        )
        # Power spectrogram
        magnitude = torch.abs(stft).cpu().numpy() # [freq_bins, frames]
        freq_bins = np.linspace(0, sr_active / 2, magnitude.shape[0])
        num_frames = magnitude.shape[1]

        spectral_centroids = []
        spectral_bandwidths = []
        spectral_rolloffs = []
        spectral_flatnesses = []

        total_energy_per_bin = np.sum(magnitude, axis=1) + 1e-12
        total_spectrum_energy = np.sum(total_energy_per_bin)

        # Compute per-frame spectral metrics
        for t_idx in range(num_frames):
            mag_col = magnitude[:, t_idx]
            mag_sum = np.sum(mag_col) + 1e-12
            
            # Centroid
            centroid = np.sum(freq_bins * mag_col) / mag_sum
            spectral_centroids.append(centroid)

            # Bandwidth
            bandwidth = np.sqrt(np.sum(((freq_bins - centroid) ** 2) * mag_col) / mag_sum)
            spectral_bandwidths.append(bandwidth)

            # Rolloff (85% energy)
            cum_mag = np.cumsum(mag_col)
            rolloff_idx = np.searchsorted(cum_mag, 0.85 * cum_mag[-1])
            rolloff = freq_bins[min(rolloff_idx, len(freq_bins) - 1)]
            spectral_rolloffs.append(rolloff)

            # Flatness (geometric mean / arithmetic mean of power)
            power_col = mag_col ** 2 + 1e-12
            geom_mean = np.exp(np.mean(np.log(power_col)))
            arith_mean = np.mean(power_col)
            flatness = min(1.0, geom_mean / max(1e-12, arith_mean))
            spectral_flatnesses.append(flatness)

        # 4. Frequency Energy Profile (6 Forensic Bands)
        bands_def = [
            ("0–250 Hz", 0, 250, "Low fundamentals & sub-harmonics"),
            ("250–500 Hz", 250, 500, "Vocal fundamentals & first formants"),
            ("500–1 kHz", 500, 1000, "Vowel formant resonance (F1)"),
            ("1–2 kHz", 1000, 2000, "Acoustic clarity & formant F2"),
            ("2–4 kHz", 2000, 4000, "Vocal presence & formant F3"),
            ("4–8 kHz", 4000, 8000, "Sibilance, fricatives & high frequencies")
        ]

        frequency_energy = []
        for label, low, high, desc in bands_def:
            bin_mask = (freq_bins >= low) & (freq_bins < min(high, sr_active / 2))
            band_e = np.sum(total_energy_per_bin[bin_mask]) if np.any(bin_mask) else 0.0
            pct = float((band_e / total_spectrum_energy) * 100.0) if total_spectrum_energy > 0 else 0.0
            frequency_energy.append({
                "band": label,
                "lowHz": low,
                "highHz": high,
                "percentage": round(pct, 2),
                "description": desc
            })

        # 5. Log-Mel Spectrogram (64 Mel bands, downsampled in time for fast UI transfer)
        n_mels = 64
        mel_transform = torchaudio.transforms.MelSpectrogram(
            sample_rate=sr_active,
            n_fft=n_fft,
            win_length=frame_len,
            hop_length=hop_len,
            n_mels=n_mels,
            power=2.0
        )
        mel_spec = mel_transform(waveform_16k).squeeze(0).cpu().numpy() # [64, frames]
        mel_db = 10.0 * np.log10(np.maximum(mel_spec, 1e-8))

        # Downsample mel_db temporally to at most 120 time bins
        max_time_bins = 120
        mel_frames = mel_db.shape[1]
        time_stride = max(1, mel_frames // max_time_bins)
        
        downsampled_mel_times = []
        downsampled_mel_values = []
        
        for f_idx in range(0, mel_frames, time_stride):
            t = float(f_idx * hop_len) / float(sr_active)
            downsampled_mel_times.append(round(t, 3))
            col = mel_db[:, f_idx]
            max_val = np.max(col)
            normalized_col = [round(float(max(-80.0, v - max_val)), 2) for v in col]
            downsampled_mel_values.append(normalized_col)

        mel_frequencies = np.linspace(100, min(8000, sr_active // 2), n_mels).tolist()

        # 6. MFCC (13 coefficients)
        mfcc_transform = torchaudio.transforms.MFCC(
            sample_rate=sr_active,
            n_mfcc=13,
            melkwargs={
                "n_fft": n_fft,
                "n_mels": n_mels,
                "hop_length": hop_len,
                "win_length": frame_len
            }
        )
        mfcc_data = mfcc_transform(waveform_16k).squeeze(0).cpu().numpy() # [13, frames]
        mfcc_times = []
        mfcc_matrix = []

        mfcc_stride = max(1, mfcc_data.shape[1] // max_time_bins)
        for c in range(13):
            mfcc_row = []
            for f_idx in range(0, mfcc_data.shape[1], mfcc_stride):
                if c == 0:
                    t = float(f_idx * hop_len) / float(sr_active)
                    mfcc_times.append(round(t, 3))
                val = float(mfcc_data[c, f_idx])
                mfcc_row.append(round(val, 3) if not math.isnan(val) else 0.0)
            mfcc_matrix.append(mfcc_row)

        # 7. Pitch (F0) Prosody Extraction via Normalized Autocorrelation on Voiced Frames
        min_lag = int(sr_active / 400.0)
        max_lag = int(sr_active / 65.0)
        pitch_times = []
        pitch_f0 = []
        voiced_pitches = []

        pitch_frame_len = int(0.030 * sr_active) # 30ms
        pitch_hop_len = int(0.015 * sr_active)   # 15ms

        for start in range(0, total_samples - pitch_frame_len, pitch_hop_len):
            pframe = samples[start:start + pitch_frame_len]
            t = float(start + pitch_frame_len // 2) / float(sr_active)
            frame_energy = np.sum(pframe ** 2)
            
            if frame_energy < 1e-4:
                pitch_times.append(round(t, 3))
                pitch_f0.append(None)
                continue

            # Autocorrelation
            ac = np.correlate(pframe, pframe, mode='full')
            ac = ac[len(pframe) - 1:]
            ac_norm = ac / (ac[0] + 1e-12)

            search_window = ac_norm[min_lag:min_lag + (max_lag - min_lag)]
            if len(search_window) > 0:
                peak_idx = np.argmax(search_window) + min_lag
                peak_val = ac_norm[peak_idx]

                if peak_val > 0.38: # Voiced threshold
                    f0 = float(sr_active) / float(peak_idx)
                    pitch_times.append(round(t, 3))
                    pitch_f0.append(round(f0, 1))
                    voiced_pitches.append(f0)
                else:
                    pitch_times.append(round(t, 3))
                    pitch_f0.append(None)
            else:
                pitch_times.append(round(t, 3))
                pitch_f0.append(None)

        voiced_ratio = float(len(voiced_pitches)) / max(1, len(pitch_times))
        has_sufficient_voiced = len(voiced_pitches) >= 5 and voiced_ratio >= 0.05

        if has_sufficient_voiced:
            median_pitch = float(np.median(voiced_pitches))
            pitch_mean = float(np.mean(voiced_pitches))
            pitch_std = float(np.std(voiced_pitches))
            pitch_min = float(np.min(voiced_pitches))
            pitch_max = float(np.max(voiced_pitches))
            pitch_range = pitch_max - pitch_min
            pitch_status = "STABLE_VOICED"
        else:
            median_pitch = None
            pitch_mean = None
            pitch_std = None
            pitch_min = None
            pitch_max = None
            pitch_range = None
            pitch_status = "INSUFFICIENT_VOICED_SPEECH"

        # Downsample temporal features for balanced transfer
        feat_stride = max(1, len(frame_times) // 200)
        ds_frame_times = frame_times[::feat_stride]
        ds_rms = rms_values[::feat_stride]
        ds_zcr = zcr_values[::feat_stride]
        ds_centroid = [round(float(c), 1) for c in spectral_centroids[::max(1, len(spectral_centroids) // 200)]]
        ds_rolloff = [round(float(r), 1) for r in spectral_rolloffs[::max(1, len(spectral_rolloffs) // 200)]]

        mean_centroid = _sanitize_float(np.mean(spectral_centroids))
        mean_rolloff = _sanitize_float(np.mean(spectral_rolloffs))
        mean_bandwidth = _sanitize_float(np.mean(spectral_bandwidths))
        mean_flatness = _sanitize_float(np.mean(spectral_flatnesses))

        return {
            "metadata": {
                "duration": round(duration, 3),
                "sample_rate": sr,
                "processed_sample_rate": sr_active,
                "channels": channels,
                "total_samples": total_samples
            },
            "waveform": {
                "times": downsampled_times,
                "amplitudes": downsampled_amplitudes,
                "peaks": downsampled_peaks,
                "resolution": len(downsampled_times)
            },
            "energy_rms": {
                "times": ds_frame_times,
                "values": ds_rms,
                "mean_rms": _sanitize_float(mean_rms),
                "peak_rms": _sanitize_float(peak_rms),
                "silence_ratio": _sanitize_float(silence_ratio),
                "speech_ratio": _sanitize_float(speech_ratio)
            },
            "zero_crossing_rate": {
                "times": ds_frame_times,
                "values": ds_zcr,
                "mean_zcr": _sanitize_float(np.mean(zcr_values)) if zcr_values else 0.0
            },
            "spectral": {
                "centroid_times": ds_frame_times[:len(ds_centroid)],
                "centroid_values": ds_centroid,
                "rolloff_values": ds_rolloff,
                "mean_centroid_hz": mean_centroid,
                "mean_rolloff_hz": mean_rolloff,
                "mean_bandwidth_hz": mean_bandwidth,
                "mean_flatness": mean_flatness
            },
            "frequency_energy": frequency_energy,
            "log_mel_spectrogram": {
                "times": downsampled_mel_times,
                "frequencies": _sanitize_list(mel_frequencies, 1),
                "values": downsampled_mel_values,
                "bands_count": n_mels
            },
            "mfcc": {
                "times": mfcc_times,
                "coefficients": mfcc_matrix,
                "num_coefficients": 13
            },
            "pitch_prosody": {
                "status": pitch_status,
                "times": pitch_times,
                "f0": pitch_f0,
                "has_voiced_speech": has_sufficient_voiced,
                "median_pitch_hz": _sanitize_float(median_pitch) if median_pitch else None,
                "mean_pitch_hz": _sanitize_float(pitch_mean) if pitch_mean else None,
                "std_pitch_hz": _sanitize_float(pitch_std) if pitch_std else None,
                "pitch_range_hz": _sanitize_float(pitch_range) if pitch_range else None,
                "voiced_ratio": _sanitize_float(voiced_ratio)
            },
            "summary": {
                "duration_sec": round(duration, 2),
                "sample_rate_hz": sr,
                "speech_duration_sec": round(duration * speech_ratio, 2),
                "silence_ratio_pct": round(silence_ratio * 100, 1),
                "peak_amplitude": _sanitize_float(np.max(np.abs(samples))),
                "mean_rms_db": round(20.0 * math.log10(max(1e-5, mean_rms)), 1),
                "spectral_centroid_hz": mean_centroid,
                "spectral_rolloff_hz": mean_rolloff,
                "spectral_flatness": mean_flatness,
                "median_f0_hz": _sanitize_float(median_pitch) if median_pitch else None,
                "pitch_stability_pct": round(max(0.0, 100.0 - ((pitch_std or 0.0) / max(1.0, median_pitch or 1.0) * 100.0)), 1) if median_pitch else None
            }
        }

    def _empty_result(self, duration: float, sr: int, channels: int) -> Dict[str, Any]:
        return {
            "metadata": {
                "duration": duration,
                "sample_rate": sr,
                "processed_sample_rate": self.target_sample_rate,
                "channels": channels,
                "total_samples": 0
            },
            "waveform": { "times": [], "amplitudes": [], "peaks": [], "resolution": 0 },
            "energy_rms": { "times": [], "values": [], "mean_rms": 0.0, "peak_rms": 0.0, "silence_ratio": 1.0, "speech_ratio": 0.0 },
            "zero_crossing_rate": { "times": [], "values": [], "mean_zcr": 0.0 },
            "spectral": { "centroid_times": [], "centroid_values": [], "rolloff_values": [], "mean_centroid_hz": 0.0, "mean_rolloff_hz": 0.0, "mean_bandwidth_hz": 0.0, "mean_flatness": 0.0 },
            "frequency_energy": [],
            "log_mel_spectrogram": { "times": [], "frequencies": [], "values": [], "bands_count": 0 },
            "mfcc": { "times": [], "coefficients": [], "num_coefficients": 0 },
            "pitch_prosody": { "status": "INSUFFICIENT_VOICED_SPEECH", "times": [], "f0": [], "has_voiced_speech": False, "median_pitch_hz": None, "mean_pitch_hz": None, "std_pitch_hz": None, "pitch_range_hz": None, "voiced_ratio": 0.0 },
            "summary": { "duration_sec": duration, "sample_rate_hz": sr, "speech_duration_sec": 0.0, "silence_ratio_pct": 100.0, "peak_amplitude": 0.0, "mean_rms_db": -80.0, "spectral_centroid_hz": 0.0, "spectral_rolloff_hz": 0.0, "spectral_flatness": 0.0, "median_f0_hz": None, "pitch_stability_pct": None }
        }
