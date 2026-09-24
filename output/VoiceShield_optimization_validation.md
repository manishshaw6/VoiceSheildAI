# VoiceShield AI Optimization and Validation Record

Date: 2026-09-24

## Scope and safeguards

- A source rollback copy, tracked binary patch, and original Git status were preserved at `C:\Users\Ayush Preetham\AppData\Local\Temp\VoiceShieldAI-source-rollback-20260924` before source edits.
- Existing uncommitted frontend, Capacitor, Android, API URL, UI, and CSS work was preserved.
- No backend URL, environment variable, database configuration, authentication flow, API contract, application ID, package name, icon, or version was changed.

## Confirmed root causes

1. Probability values stored as percentages could reach code expecting fractions. A value such as `62` was clamped to `1.0` by the risk engine and multiplied by 100 again in the UI, producing displays such as `6200%` and an invalid composite above 100%.
2. The live EWMA score was overwritten by an upward-only maximum and a confirmed-fraud floor. Corrected interim speech-recognition text could therefore remain at an old high-risk value.
3. Final live-call persistence selected the maximum of historical, rule, and final scores. This retained superseded false positives instead of the latest complete assessment.
4. The acoustic timer concatenated the entire accumulated recording on every interval, even when there was not enough new audio to run analysis.
5. Several telemetry rows converted acoustic measurements into unsupported deception/manipulation scores using fixed heuristic increments. Missing pitch evidence was displayed as 50% concern.
6. Waveform markers were assigned fractional fallback positions when no source timestamp existed. A clean call could also receive an invented "verified authentic" marker.
7. A failed final audio analysis generated a zero-filled pseudo-waveform instead of explicitly reporting unavailable forensic evidence.
8. The client PDF generator supplied default probabilities, durations, identities, allegations, statutory claims, and official-certificate language when those facts were unavailable. The backend PDF also used speculative defaults and its footer created blank pages.

## Targeted changes

- Normalized score, confidence, reliability, quality, speaker similarity, and context probabilities at the risk-fusion boundary for both `0..1` and `0..100` inputs.
- Preserved EWMA as the displayed live score, exposed raw and smoothed scores separately, allowed corrected evidence to reduce risk, and persisted the latest final evidence score rather than the historical maximum.
- Avoided full-buffer concatenation until a new acoustic-analysis window is actually due.
- Replaced unavailable post-call forensic data with an explicit unavailable state and reason.
- Replaced the six heuristic UI risk rows with bounded provider/risk-engine outputs; unavailable values now display `N/A` and are excluded from availability counts.
- Removed fabricated waveform event positions and unsupported acoustic claims. Only source timestamps are rendered.
- Rebuilt both report paths around available metadata, detector evidence, model confidence, evidence coverage, source-timestamped events, redacted excerpts, conditional recommendations, integrity fields, and explicit limitations.
- Distinguished observed/source evidence from AI assessments and removed government-certification or proof-of-guilt wording.
- Fixed backend PDF pagination and visually verified both PDF paths.

## Measured validation results

All measurements below were produced locally after the change. No pre-change timing benchmark was captured, so no timing improvement percentage is claimed.

- Backend suite: 158 passed, 0 failed in 10.10 seconds. This includes 34 calibrated normal, suspicious, fraud, negation, multilingual, provider-unavailable, and session-isolation scenarios.
- Added regression: provider `score: 62` and `confidence: 91` remain 62% and 91%, not 100% or 6200%.
- Added regression: a high-risk interim transcript can be replaced by a safety statement; raw risk changed from 83.95 to 0 and smoothed risk changed from 83.95 to 58.77 after one correction update. The final result no longer retains the historical maximum.
- Controlled transcript sample: 0 of 5 benign examples reached HIGH/CRITICAL; scores were 0, 0, 0, 8.19, and 0. All 3 direct fraud examples reached HIGH; scores were 75.5, 62, and 74.5. This small deterministic set is a regression check, not an accuracy estimate.
- Local rule/fusion processing over 1,000 iterations: median 0.135 ms, p95 0.344 ms.
- Localhost WebSocket transcript-to-risk round trip: 2.621 ms for the high-risk update and 1.372 ms for the corrected update. These figures exclude speech recognition, network transit, and external acoustic-provider latency.
- Frontend production build: passed.
- Capacitor Android sync: passed.
- Android Gradle `assembleDebug`: passed with JDK 21 and the existing Gradle configuration.
- Final APK: 7,341,502 bytes; SHA-256 `E12851E0E854B1CB09F6EC42451349D0D00E0A49927BEFA44EC1B47D1638795A`.
- Client incident-report fixture: 2 pages, rendered and visually inspected.
- Backend signed-report fixture: 2 pages, rendered and visually inspected after pagination correction.

## Modified source files

- `backend/src/services/riskEngine.js`
- `backend/src/websocket/liveAnalysisHandler.js`
- `backend/src/services/incidentReportService.js`
- `backend/src/services/reportPdfService.js`
- `backend/test/riskEngine.test.js`
- `backend/test/websocket.integration.test.js`
- `frontend/src/components/VoiceForensicsWorkstation.jsx`
- `frontend/src/services/pdfReportGenerator.js`

Capacitor synchronization also refreshed generated web assets under `frontend/android/app/src/main/assets/public` and the debug APK build output.

## Preserved and verified behavior

- Existing auth, API-key, ownership, redaction, report approval, email authorization, organization resolution, speaker verification, offline analysis/sync, transcription routing, API aliases, health endpoints, and database tests passed.
- Existing frontend source built with the configured Vite command.
- Existing Android permissions include `INTERNET`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`.
- Existing API configuration, backend URL, database configuration, and environment files were not modified.

## Remaining limitations and manual checks

- No Android device or emulator was connected, so APK installation, runtime permission prompts, microphone capture, interruption handling, and real call audio were not device-tested.
- External acoustic-model and production-network latency were not benchmarked in this environment.
- The controlled samples validate regression behavior but do not establish sensitivity, specificity, or real-world fraud-detection accuracy. A larger labeled, consented human-speech and synthetic-speech corpus is required for those claims.
- Full-project ESLint remains blocked by pre-existing lint errors and by generated Android assets being included in the lint scope. The rewritten PDF generator passes targeted ESLint, and the production frontend build succeeds.
- The Vite build retains existing missing-at-build-time Draco/WASM and large-chunk warnings; these were not changed because they are unrelated to the requested detection fixes.
