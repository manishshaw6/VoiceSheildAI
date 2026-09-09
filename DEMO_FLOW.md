# 🛡️ VoxShield AI — Smart India Hackathon (SIH) Demo Flow & Presentation Runbook

> **Autonomous Multimodal Voice Fraud Defense System**  
> *Real-time Deepfake Detection, Biometric Speaker Verification, Indic Multilingual STT & Multi-Signal Fusion*

---

## 🚀 30-Second Elevator Pitch for Judges

> *"Traditional anti-fraud systems look at either audio deepfakes OR financial keywords. Attackers bypass both by using real human voices for scams, or using AI voice clones with innocent scripts. **VoxShield AI** is the first comprehensive multi-signal voice defense engine that unifies **SpeechBrain ECAPA-TDNN** biometric speaker embeddings, **Reality Defender** synthetic manipulation detection, **Sarvam Saaras** Indic code-mix speech intelligence, and a **confidence-weighted evidence fusion policy engine**. When an AI clone impersonates an enrolled family member, VoxShield immediately triggers a **Voice Clone Suspicion Alert**, blocking sensitive transactions in under 500ms."*

---

## 🏗️ System Architecture at a Glance

```
                         [ INCOMING AUDIO STREAM / FILE ]
                                       │
                              [ Quality Gate ] ── (Reject silence / clipped audio)
                                       │
             ┌─────────────────────────┼─────────────────────────┐
             ▼                         ▼                         ▼
   [ Reality Defender ]       [ Speaker Engine ]      [ Language Router ]
   (Acoustic deepfake &       (SpeechBrain ECAPA      (Indic detection:
    synthetic probability)     192-dim embeddings)     Sarvam Saaras v4
                                       │               faster-whisper)
                                       ▼                         │
                             [ SQLite Profiles ]                 ▼
                                                      [ Deterministic Rules ]
                                                      [ Gemini Context LLM ]
             └─────────────────────────┬─────────────────────────┘
                                       ▼
                       [ Evidence Fusion & Risk Engine ]
                        - Confidence-weighted pooling
                        - Interaction compounders
                        - Voice Clone Alert (Deepfake + Speaker Match)
                                       │
                                       ▼
                         [ Policy Enforcement Engine ]
                        - SAFE: Continue
                        - SUSPICIOUS: Warn
                        - HIGH: Step-up verification
                        - CRITICAL: Block sensitive action + Create incident
```

---

## ⏱️ 3-Minute Live Demo Walkthrough (Judge Presentation)

### 🎬 ACT 1: Baseline Trust — Enrolled Owner Normal Call
* **Scenario:** Enrolled user calls bank/friend for a casual chat.
* **Input:** `sample_A_genuine_enrolled.wav` ("Hello, how are you doing today? Just wanted to catch up...")
* **Observed Metrics:**
  * Speaker Similarity: **94%** (`MATCH VERIFIED`)
  * Synthetic Probability: **5%** (`AUTHENTIC`)
  * Threat Signals: **0**
* **System Verdict:** **SAFE (Risk Score: 5/100)**
* **Policy Action:** `CONTINUE`
* **Judge Takeaway:** Legitimate callers experience zero friction.

---

### 🎬 ACT 2: Coerced Identity — Owner Under Duress (The "Safe Voice, Dangerous Words" Trap)
* **Scenario:** The genuine owner is being blackmailed or coerced to demand an OTP from a family member.
* **Input:** Enrolled voice + transcript: *"Please tell me the one-time password code immediately, I need it right now."*
* **Observed Metrics:**
  * Speaker Similarity: **93%** (`MATCH VERIFIED`)
  * Synthetic Probability: **8%** (`AUTHENTIC`)
  * Rule Signals: `OTP_REQUEST` + `URGENCY_COERCION`
  * LLM Fraud Classification: `OTP Fraud (Risk: 0.99)`
* **System Verdict:** **HIGH (Risk Score: 61/100)**
* **Policy Action:** `WARN`, `RECOMMEND_VERIFICATION`
* **Judge Takeaway:** Unlike legacy voice biometrics that blindly trust a verified speaker, VoxShield's multi-signal fusion intercepts credential theft even from enrolled identities.

---

### 🎬 ACT 3: Multilingual Threat — Indic Code-Mix Banking Scam (Sarvam Saaras)
* **Scenario:** Fraudster speaks mixed Telugu-English or Hindi-English claiming bank account suspension.
* **Input:** *"Mee account block aipothundi immediately OTP cheppandi urgently debit card verify cheyali"*
* **Observed Metrics:**
  * Language Routing: Automatically routed to **Sarvam Saaras v4** (`te-IN` / `hi-IN` code-mix)
  * Latency: **415ms**
  * Extracted Canonical Evidence:
    * `OTP_REQUEST: DETECTED`
    * `ACCOUNT_SUSPENSION_THREAT: DETECTED`
    * `URGENCY_COERCION: DETECTED`
* **System Verdict:** **HIGH / CRITICAL (Risk Score: 75/100)**
* **Policy Action:** `BLOCK_SENSITIVE_ACTION`, `REQUEST_STEP_UP_VERIFICATION`
* **Judge Takeaway:** Regional Indian language support is native, not an afterthought. English-only LLMs fail on Hinglish/Telugish, but VoxShield canonicalizes dialectical fraud phrases into uniform security indicators.

---

### 🎬 ACT 4: The Apex Threat — AI Synthetic Voice Clone Attack
* **Scenario:** Scammer clones the child's voice using generative AI and calls the parent with a fake emergency.
* **Input:** Synthetic voice audio + transcript: *"Dad, I had an accident and police arrested me! Transfer funds to UPI immediately and share the verification code!"*
* **Observed Metrics:**
  * Speaker Similarity: **93%** (Matches enrolled child profile!)
  * Synthetic Probability: **96%** (`MANIPULATED / FAKE` from Reality Defender)
  * Multi-Signal Compounder: **`VOICE_CLONE_PATTERN` TRIGGERED**
* **System Verdict:** **CRITICAL (Risk Score: 85/100)**
* **UI Highlight:** **🚨 RED BANNER: "CRITICAL ALERT: POSSIBLE VOICE CLONING DETECTED"**
* **Policy Action:** `BLOCK_SENSITIVE_ACTION`, `CREATE_INCIDENT`
* **Judge Takeaway:** This is VoxShield's signature novelty. A naive biometrics system says *"It's your child!"* while a naive deepfake detector has no identity context. VoxShield connects the dots and detects the impersonation attack.

---

### 🎬 ACT 5: Resilient Graceful Degradation
* **Scenario:** Cloud network drops or provider API rate limits.
* **Observed Behavior:**
  * Circuit breaker opens after 3 failed requests.
  * System smoothly falls back from cloud APIs to local **faster-whisper** (`RTF: 0.72x`) and local **SpeechBrain ECAPA-TDNN** (`200ms`).
  * Truthful transparency: Provider provenance in the UI explicitly reflects fallback without crashing or freezing.

---

## 🛠️ Verification & Demo Commands Cheat-Sheet

```bash
# 1. Check ML Service Readiness
curl http://127.0.0.1:8001/internal/ready

# 2. Check Express System Providers
curl http://localhost:5000/api/system/providers

# 3. Run Golden Attack Scenario Matrix (Outputs 6/6 validation)
node backend/validation/golden_scenarios.js

# 4. Run ECAPA Speaker Calibration (Outputs pairwise similarity matrix)
node backend/validation/ecapa_calibration.js

# 5. Run Live Sarvam Multilingual & Indic Fraud Evaluation
node backend/validation/sarvam_validation.js

# 6. Run Full Regression Suite (35/35 passing)
npm --prefix backend test
```
