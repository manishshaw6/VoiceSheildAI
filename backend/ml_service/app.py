from contextlib import asynccontextmanager
import asyncio
from pathlib import Path
from tempfile import NamedTemporaryFile
from fastapi import FastAPI, File, UploadFile

from services.whisper_service import WhisperService
from services.speaker_service import SpeakerService
from services.forensic_service import ForensicService

whisper = WhisperService()
ecapa = SpeakerService()
forensics = ForensicService()

@asynccontextmanager
async def lifespan(_app):
    whisper.load()
    ecapa.load()
    yield

app = FastAPI(title='VoxShield local ML service', docs_url=None, redoc_url=None, lifespan=lifespan)

async def persist_upload(audio: UploadFile):
    suffix = Path(audio.filename or 'audio.wav').suffix or '.wav'
    payload = await audio.read()
    temp = NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        temp.write(payload); temp.close(); return Path(temp.name)
    except Exception:
        temp.close(); Path(temp.name).unlink(missing_ok=True); raise

@app.get('/internal/health')
def health(): return {'status': 'ok', 'whisper': whisper.health(), 'ecapa': ecapa.health()}

@app.get('/internal/ready')
def ready():
    loaded = whisper.loaded and ecapa.loaded
    return {'status': 'ready' if loaded else 'not_ready', 'ready': loaded, 'whisper': whisper.health(), 'ecapa': ecapa.health()}

@app.post('/internal/transcribe')
async def transcribe(audio: UploadFile = File(...)):
    path = await persist_upload(audio)
    try:
        from config import settings
        try: return await asyncio.wait_for(asyncio.to_thread(whisper.transcribe, path), timeout=settings.inference_timeout_seconds)
        except asyncio.TimeoutError: return {'available': False, 'provider': 'faster_whisper', 'reason': 'provider_timeout'}
    finally: path.unlink(missing_ok=True)

@app.post('/internal/speaker/embedding')
async def speaker_embedding(audio: UploadFile = File(...)):
    path = await persist_upload(audio)
    try:
        from config import settings
        try: return await asyncio.wait_for(asyncio.to_thread(ecapa.embedding, path), timeout=settings.inference_timeout_seconds)
        except asyncio.TimeoutError: return {'available': False, 'provider': 'speechbrain_ecapa_tdnn', 'reason': 'provider_timeout'}
    finally: path.unlink(missing_ok=True)

@app.post('/internal/forensics/extract')
async def extract_forensics(audio: UploadFile = File(...)):
    path = await persist_upload(audio)
    try:
        from config import settings
        try:
            res = await asyncio.wait_for(asyncio.to_thread(forensics.extract, path), timeout=settings.inference_timeout_seconds)
            return {'available': True, 'provider': 'voxshield_forensic_dsp', **res}
        except asyncio.TimeoutError:
            return {'available': False, 'provider': 'voxshield_forensic_dsp', 'reason': 'provider_timeout'}
        except Exception as e:
            return {'available': False, 'provider': 'voxshield_forensic_dsp', 'reason': str(e)}
    finally: path.unlink(missing_ok=True)

