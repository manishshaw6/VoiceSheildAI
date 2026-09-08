from __future__ import annotations

import time
from pathlib import Path

from config import settings


class WhisperService:
    """One process-wide faster-whisper model with truthful unavailable state."""
    def __init__(self):
        self.model = None
        self.device = 'cpu'
        self.compute_type = 'int8'
        self.error = None
        self.last_inference_ms = None

    def load(self):
        try:
            import torch
            from faster_whisper import WhisperModel
            cuda = torch.cuda.is_available()
            if settings.whisper_device == 'auto':
                self.device = 'cuda' if cuda else 'cpu'
            else:
                self.device = settings.whisper_device
            requested = settings.whisper_compute_type
            self.compute_type = ('float16' if self.device == 'cuda' else 'int8') if requested == 'auto' else requested
            self.model = WhisperModel(settings.whisper_model, device=self.device, compute_type=self.compute_type)
            self.error = None
        except Exception as exc:  # service remains alive so Express can isolate the outage
            self.model = None
            self.error = type(exc).__name__

    @property
    def loaded(self): return self.model is not None

    def health(self):
        return {'loaded': self.loaded, 'provider': 'faster_whisper', 'model': settings.whisper_model,
                'device': self.device, 'last_inference_ms': self.last_inference_ms, 'failure': self.error}

    def transcribe(self, audio_path: Path):
        if not self.model:
            return {'available': False, 'provider': 'faster_whisper', 'reason': 'model_not_loaded'}
        start = time.perf_counter()
        try:
            segments, info = self.model.transcribe(str(audio_path), vad_filter=True)
            normalized = [{'id': index, 'start': round(segment.start, 3), 'end': round(segment.end, 3), 'text': segment.text.strip()}
                          for index, segment in enumerate(segments)]
            self.last_inference_ms = round((time.perf_counter() - start) * 1000)
            return {'available': True, 'provider': 'faster_whisper', 'model': settings.whisper_model, 'device': self.device,
                    'language': getattr(info, 'language', None), 'language_probability': getattr(info, 'language_probability', None),
                    'duration': round(getattr(info, 'duration', 0) or 0, 3), 'text': ' '.join(item['text'] for item in normalized).strip(),
                    'segments': normalized}
        except Exception as exc:
            self.last_inference_ms = round((time.perf_counter() - start) * 1000)
            return {'available': False, 'provider': 'faster_whisper', 'reason': 'inference_failed', 'error': type(exc).__name__}
