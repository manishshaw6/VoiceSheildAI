import os


class Settings:
    whisper_model = os.getenv('WHISPER_MODEL', 'small')
    whisper_device = os.getenv('WHISPER_DEVICE', 'auto').lower()
    whisper_compute_type = os.getenv('WHISPER_COMPUTE_TYPE', 'auto').lower()
    min_speech_seconds = float(os.getenv('ECAPA_MIN_SPEECH_SECONDS', '0.5'))
    inference_timeout_seconds = float(os.getenv('ML_INFERENCE_TIMEOUT_SECONDS', '120'))


settings = Settings()
