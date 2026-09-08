# VoxShield backend audit

Audit date: 2026-09-08

## Baseline discovered

The repository uses Node.js, Express 5, SQLite, and `ws`; it is not a FastAPI project. Existing frontend contracts were already built around `/api/*` and `/ws/live-analysis`, so the upgrade retains those routes and adds `/api/v1/*` aliases.

The backend is organized into `audio`, `config`, `controllers`, `core`, `database`, `events`, `integrations`, `middleware`, `policy`, `routes`, `schemas`, `services`, `sessions`, `websocket`, and `test`. No frontend files were changed as part of this backend completion.

## Endpoint inventory

- `GET /health`, `GET /ready`
- `GET /api/health`, `GET /api/ready`, `GET /api/system/providers`
- Every `/api/*` REST route is also available under `/api/v1/*`
- `POST /api/audio/analyze`
- `POST /api/speaker/enroll`, `POST /api/speaker/verify`, `GET /api/speaker/profiles`
- `GET /api/history`, `GET /api/history/:id`, `DELETE /api/history/:id`
- `GET /api/analysis/:id/report`
- `GET /api/incidents/:id`, `GET /api/audit`
- `WS /ws/live-analysis`

## Integration inventory

- Reality Defender: voice-authenticity evidence only, normalized by an adapter with timeout and circuit breaker.
- AssemblyAI: timestamped speech recognition behind the orchestration boundary.
- Gemini with Groq fallback: optional context enhancement. Deterministic local context rules remain operational without either service.
- SQLite: analyses, speaker profiles, immutable incident snapshots, and audit events.
- Local PCM processing: WAV quality metrics, mono/resampling/normalization, energy VAD, hashing, cache, and acoustic speaker fingerprints.

## Findings in the prior implementation

1. Quality, preprocessing, evidence, event, and cache modules existed but the upload/live controllers bypassed most of them.
2. Controllers directly imported providers and mixed transport, orchestration, scoring, storage, and cleanup.
3. Reality Defender labels were converted into invented probabilities when no provider score existed, and its raw response was exposed.
4. Missing LLM output was represented with numeric zero, which could be mistaken for safe evidence.
5. Risk fusion used raw weighted averages, inconsistent level names, hard-coded interactions, and no confidence/reliability/quality factors.
6. Speaker enrollment skipped quality checks; some error paths could leave temporary files behind.
7. WebSocket events had no sequence contract, temporal smoothing, size bound, or analysis-in-progress guard.
8. Policy, state machine, live-session abstraction, incidents, and persistent audit records were absent.
9. Readiness and truthful provider status were missing.
10. The test command intentionally failed and no backend tests existed.

## Completed upgrade work

- Central upload orchestrator with quality gate, SHA-256 integrity, bounded cache, concurrent analysis, normalized evidence, confidence-aware fusion, policy, explanations, telemetry, incidents, and audit events.
- Missing evidence is omitted from fusion. Unusable audio halts before providers.
- Reality Defender no longer fabricates scores or exposes raw payloads; unscored output is `UNABLE_TO_EVALUATE`.
- Risk interactions cover voice cloning, OTP plus financial requests, and impersonation plus urgency.
- Explicit `SAFE`, `SUSPICIOUS`, `HIGH`, and `CRITICAL` boundaries.
- Per-call manager, validated state transitions, EWMA history, monotonic WebSocket sequences, and backward-compatible top-level fields.
- Temp-file cleanup, bounded live audio, upload validation, configurable request limiting, IDs, security headers, sanitized audits, and centralized errors.
- SQLite incident/audit schemas and read endpoints.
- Automated unit and HTTP integration coverage for boundaries, fusion, policy, state, temporal risk, context, speaker math, quality, probes, errors, and unusable uploads.

## Intentional truthful limitations

- The local speaker engine is an acoustic fingerprint comparator, not SpeechBrain ECAPA-TDNN. Provider health reports its actual engine name.
- Speech recognition is AssemblyAI rather than faster-whisper. Without configuration, transcription and dependent context evidence are unavailable; none is fabricated.
- VAD is a lightweight energy detector for PCM WAV. Compressed formats report VAD unavailable unless decoded to PCM.
- The API publishes an OpenAPI 3.1 document at `/openapi.json` and a lightweight endpoint guide at `/docs`; it intentionally avoids adding a large documentation UI dependency.

These limitations are surfaced so the backend never claims capabilities it does not possess.
