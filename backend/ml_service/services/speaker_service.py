from __future__ import annotations

import time
from config import settings


class SpeakerService:
    """SpeechBrain ECAPA-TDNN encoder. Embeddings never leave the public Express API."""
    model_name = 'speechbrain/spkrec-ecapa-voxceleb'
    def __init__(self):
        self.model = None
        self.device = 'cpu'
        self.error = None
        self.last_inference_ms = None
        self.torch = None
        self.torchaudio = None

    def load(self):
        try:
            import torch
            import torchaudio
            from speechbrain.inference.speaker import EncoderClassifier
            self.torch, self.torchaudio = torch, torchaudio
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
            self.model = EncoderClassifier.from_hparams(source=self.model_name, run_opts={'device': self.device})
            self.error = None
        except Exception as exc:
            self.model = None
            self.error = type(exc).__name__

    @property
    def loaded(self): return self.model is not None

    def health(self):
        return {'loaded': self.loaded, 'provider': 'speechbrain_ecapa_tdnn', 'model': self.model_name,
                'device': self.device, 'last_inference_ms': self.last_inference_ms, 'failure': self.error}

    def embedding(self, audio_path):
        if not self.model:
            return {'available': False, 'provider': 'speechbrain_ecapa_tdnn', 'reason': 'model_not_loaded'}
        start = time.perf_counter()
        try:
            try:
                import soundfile as sf
                data, sample_rate = sf.read(str(audio_path), dtype='float32')
                waveform = self.torch.from_numpy(data)
                if waveform.ndim == 1:
                    waveform = waveform.unsqueeze(0)
                else:
                    waveform = waveform.t()
            except Exception:
                waveform, sample_rate = self.torchaudio.load(str(audio_path))
            waveform = waveform.mean(dim=0, keepdim=True)
            if sample_rate != 16000: waveform = self.torchaudio.functional.resample(waveform, sample_rate, 16000)
            energy = waveform.abs().squeeze(0)
            speech_seconds = float((energy > 0.015).sum().item()) / 16000
            if speech_seconds < settings.min_speech_seconds:
                return {'available': False, 'provider': 'speechbrain_ecapa_tdnn', 'reason': 'insufficient_speech'}
            with self.torch.no_grad(): vector = self.model.encode_batch(waveform.to(self.device)).squeeze().cpu()
            vector = self.torch.nn.functional.normalize(vector, dim=0)
            self.last_inference_ms = round((time.perf_counter() - start) * 1000)
            return {'available': True, 'provider': 'speechbrain_ecapa_tdnn', 'model': self.model_name, 'device': self.device,
                    'speech_duration': round(speech_seconds, 3), 'embedding': vector.tolist()}
        except Exception as exc:
            self.last_inference_ms = round((time.perf_counter() - start) * 1000)
            return {'available': False, 'provider': 'speechbrain_ecapa_tdnn', 'reason': 'inference_failed', 'error': type(exc).__name__}
