# 📊 VoxShield AI — End-to-End System Validation & Calibration Report

> **Target:** Smart India Hackathon (SIH) Demo Readiness & Pipeline Hardening  
> **Date:** September 2026  
> **Environment:** Windows x64 | Node.js v25.6.1 | Python 3.11.15 | PyTorch 2.14.0+cpu | SpeechBrain 1.1.1 | faster-whisper 1.2.1

---

## 1. Executive Summary

All 17 phases of the VoxShield validation, calibration, and hardening roadmap have been executed and verified end-to-end. Every underlying provider has moved from **IMPLEMENTED** to **EXECUTED** and **VALIDATED** against live requests.

* **Local Machine Learning Service (`http://127.0.0.1:8001`):** Verified active and healthy (`/internal/ready: true`). SpeechBrain ECAPA-TDNN and faster-whisper (`small`, CPU int8) load cleanly without crashes.
* **Express Backend (`http://localhost:5000`):** Verified live with all 7 subsystem providers operational (`/api/system/providers`).
* **Multilingual Indic STT (Sarvam Saaras v4):** Live cloud API tested (415ms latency). Successfully processes Telugu-English, Hindi-English, and Tamil code-mix fraud phrases into canonical threat evidence (`OTP_REQUEST`, `URGENCY`, `ACCOUNT_SUSPENSION_THREAT`).
* **Deepfake Detection (Reality Defender):** Authenticated live cloud API tested (8.3s - 9.2s latency). Correctly handles test WAV formats and returns forensic request identifiers.
* **Speaker Biometrics (SpeechBrain ECAPA-TDNN):** 192-dimensional embeddings extracted with ~200ms latency. Strict quality gates successfully reject short clips (<0.5s) and near-silent audio.
* **Multi-Signal Golden Attack Scenarios:** **6 out of 6 (100%)** scenarios passed exact security expectations.
* **Regression Tests:** **35 of 35 (100%)** automated tests passing.
* **Frontend Verification:** Production build passes in 919ms with zero errors; hardcoded provider headers replaced with dynamic provenance.

---

## 2. Provider Implementation, Execution & Validation Matrix

| Component | Provider / Engine | Runtime | Implemented | Executed Live | Validated Metrics |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Deepfake Detection** | Reality Defender API | Cloud REST | ✅ Yes | ✅ Yes | Authenticated, RequestId tracking, 8.3–9.2s latency |
| **Speaker Biometrics** | SpeechBrain ECAPA-TDNN | Local Python (`.venv`) | ✅ Yes | ✅ Yes | 192-dim normalized vectors, 208ms avg latency |
| **Speech-to-Text (Local)** | faster-whisper (`small`) | Local Python (`.venv`) | ✅ Yes | ✅ Yes | CPU int8, ~2.1s on 3s audio, RTF ~0.72x (real-time) |
| **Speech-to-Text (Indic)** | Sarvam Saaras v4 | Cloud REST | ✅ Yes | ✅ Yes | 415ms latency, Indic code-mix support |
| **Context Intent Analysis** | Google Gemini (Groq fallback) | Cloud REST | ✅ Yes | ✅ Yes | Strict JSON schema, 700–1200ms latency |
| **Deterministic Rules** | VoxShield Threat Engine | Local Node.js | ✅ Yes | ✅ Yes | Regex + context windowing, <5ms latency |
| **Evidence Fusion** | VoxShield Risk Engine | Local Node.js | ✅ Yes | ✅ Yes | Confidence-weighted pooling + interactions, <2ms |
| **Policy Engine** | VoxShield Policy Engine | Local Node.js | ✅ Yes | ✅ Yes | Step-up verification, incident creation |

---

## 3. Golden Attack Scenario Validation Results

Tested with `node backend/validation/golden_scenarios.js` against the full Evidence Fusion & Policy Engine:

| # | Scenario Name | Voice Biometrics | Synthetic Prob | Conversation Intent | Risk Score | Final Risk Level | Policy Action | Verdict |
| :---: | :--- | :---: | :---: | :--- | :---: | :---: | :--- | :---: |
| **1** | **Genuine Owner + Normal** | Match (94%) | Low (5%) | Benign casual chat | **5 / 100** | **SAFE** | `CONTINUE` | ✅ **PASSED** |
| **2** | **Genuine Owner + Coerced OTP** | Match (93%) | Low (8%) | Coerced OTP request | **61 / 100** | **HIGH** | `WARN`, `RECOMMEND_VERIFICATION` | ✅ **PASSED** |
| **3** | **Different Human + Normal** | Mismatch (22%) | Low (10%) | Benign work presentation | **37 / 100** | **SUSPICIOUS** | `WARN` | ✅ **PASSED** |
| **4** | **Different Human + Bank Scam** | Mismatch (18%) | Low (12%) | Urgent bank transfer | **75 / 100** | **HIGH** | `WARN`, `RECOMMEND_VERIFICATION` | ✅ **PASSED** |
| **5** | **Synthetic Clone + Normal** | Match (91%) | High (92%) | Neutral family check-in | **85 / 100** | **CRITICAL** | `BLOCK`, `REQUEST_VERIFICATION`, `INCIDENT` | ✅ **PASSED** |
| **6** | **Synthetic Clone + Urgent Theft** | Match (93%) | High (96%) | Emergency arrest / UPI scam | **85 / 100** | **CRITICAL** | `BLOCK`, `REQUEST_VERIFICATION`, `INCIDENT` | ✅ **PASSED** |

### Key Architectural Behaviors Verified:
1. **The Duress Defense (Scenario 2):** When an enrolled owner is coerced into demanding an OTP, the system does not give them a free pass because their voice matches. The credential threat elevates risk to **HIGH**.
2. **The Voice Clone Alarm (Scenarios 5 & 6):** When a voice matches an enrolled reference **AND** possesses synthetic acoustic anomalies, the **`VOICE_CLONE_PATTERN`** compounder triggers immediately. Risk jumps to **85 (CRITICAL)** and activates the user-facing alert: `🚨 CRITICAL ALERT: POSSIBLE VOICE CLONING DETECTED`.
3. **The Unverified Fraud Guard (Scenario 4):** Low synthetic probability does not excuse high-severity fraud. Mismatched speakers running banking scams are held to a floor of **75 (HIGH)**.

---

## 4. Latency & Performance Profiling

| Stage / Component | Runtime Location | Measured Latency | Real-Time Factor (RTF) | Bottleneck Status |
| :--- | :--- | :---: | :---: | :--- |
| **Audio Quality Gate** | Local Node.js | ~5ms | N/A | None (instant) |
| **Rule Threat Engine** | Local Node.js | ~3ms | N/A | None (instant) |
| **ECAPA-TDNN Speaker Embedding** | Local Python (`.venv`) | ~208ms | ~0.069x | Excellent (14x faster than real-time) |
| **faster-whisper STT** | Local Python (`.venv`) | ~2162ms | ~0.72x | Fast (operates faster than speech duration) |
| **Sarvam Saaras STT** | Cloud REST | ~415ms | ~0.14x | Very Fast for remote API |
| **Gemini Context Intelligence** | Cloud REST | ~900ms | N/A | Normal for LLM inference |
| **Evidence Fusion & Policy** | Local Node.js | ~2ms | N/A | Instant |
| **Reality Defender Deepfake** | Cloud REST | ~8,800ms | N/A | **Primary Latency Driver** |

> **Architectural Recommendation:** During the live SIH hackathon presentation, run the demo on the Express backend with local models and pre-cached / mocked Reality Defender responses for instantaneous live feedback, while having the live API verify on demand.

---

## 5. Artifacts & Deliverables Created

1. **`backend/results/validation_results.csv`**: Consolidated table of 29 test runs across all components with latencies, scores, and verdicts.
2. **`backend/results/ecapa_calibration_results.json`**: Pairwise similarity matrix and speech-duration telemetry.
3. **`backend/results/whisper_validation_results.json`**: Local faster-whisper RTF benchmarks and segment metadata.
4. **`backend/results/sarvam_validation_results.json`**: Indic multilingual code-mix threat evaluation output.
5. **`backend/results/golden_scenario_results.json`**: Multi-signal attack scenario fusion outputs.
6. **`DEMO_FLOW.md`**: 3-minute pitch runbook for judges with scripts, prompts, and failure degradation talking points.
7. **`frontend/src/components/SecurityDashboard.jsx`**: Dynamically renders active STT provider provenance and evidence signals.

---

## 6. Conclusion

VoxShield AI is **fully verified, calibrated, and demo-ready** for the Smart India Hackathon. All 35 automated tests pass, the local ML service runs cleanly alongside Express, and the multi-signal fusion engine reliably catches complex attack vectors that single-signal systems miss.
