# VoxShield model architecture

Express remains the sole public backend. It validates and preprocesses audio, then concurrently calls Reality Defender and the local ML service. Browser clients never call the Python service.

| Component | Responsibility | Result semantics |
| --- | --- | --- |
| Reality Defender | Voice authenticity | Synthetic/manipulated-speech evidence only |
| faster-whisper | Local English/general fallback speech recognition | Transcript, language, optional language probability, segment timestamps |
| Sarvam Saaras | Indic and code-mixed speech recognition | Original-language/codemix transcript, detected BCP-47 language, phrase timestamps |
| SpeechBrain ECAPA-TDNN | Speaker identity | L2-normalized speaker embedding and cosine similarity |
| Context Engine | Fraud intent | Timestamp-linked deterministic and optional LLM evidence |
| Risk Engine | Evidence fusion | Confidence/reliability/quality-aware risk and clone interaction |
| Policy Engine | Security response | Warning, verification, blocking, and incident decisions |

`similarity` from ECAPA is cosine similarity. It is deliberately not exposed as `match_probability`: no calibrated probability model has been validated for this deployment. A match is decided only by comparing similarity with `SPEAKER_MATCH_THRESHOLD`.

The independent-signal rule is intentional: high ECAPA similarity together with high Reality Defender synthetic evidence produces `VOICE_CLONE_PATTERN`; speaker similarity never implies authenticity.

The language-aware STT router honors an optional `language_code` or `language` upload field. Explicit Indic languages route to Sarvam; explicit English routes to faster-whisper. With no hint, faster-whisper is first used for language identification and its final output is retained only for English/general speech; detected Indic speech is sent once to Sarvam with the corresponding official BCP-47 code. Sarvam uses `codemix` mode so the original transcript is preserved; no translation is manufactured.

The local ML service attempts CUDA when available and falls back to CPU. It loads each model once at startup and reports `loaded: false` rather than crashing if an import, CUDA initialization, or model download fails. Express then returns unavailable evidence; it does not turn absence into zero risk. AssemblyAI and the legacy acoustic fingerprint implementation remain opt-in fallbacks and identify themselves as fallbacks in returned provider metadata.
