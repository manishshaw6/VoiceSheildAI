# 🛡️ VoiceShield Guardian Offline — Hackathon Demonstration Guide
**Smart India Hackathon 2026 | Problem Statement SIH26104**  
*AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks*

---

## 🌟 Executive Summary
**VoiceShield Guardian Offline** is an edge-native, privacy-first cybersecurity subsystem designed to safeguard citizens against high-pressure AI voice cloning and social engineering fraud even when cellular data or Wi-Fi is severed (e.g., remote areas, transit, network throttling, or deliberate jamming).

When disconnected, VoiceShield Guardian does not fail or present an empty state. It transitions autonomously into local defense mode:
- **Local Acoustic Deepfake Biomarkers**: In-browser 16kHz resampler and FFT extractor analyzing spectral rolloff, spectral flux, high-frequency vocoder cutoff, and zero-crossing jitter without external APIs.
- **Multilingual Edge Fraud Intent Engine**: Offline regex & semantic parsing supporting English, Hindi, and Telugu (OTP, UPI, CBI/Police digital arrest, AnyDesk screen-share).
- **Defensive Negation Guard**: Prevents false alarms on educational safety statements (*"Never share your OTP with anyone"*).
- **Client-Side Biometric Cosine Match**: 80-band filterbank matching against pre-enrolled trusted contacts.
- **Biometric Clone Impersonation Trigger**: Detects when speech matches a family contact acoustically ($\ge 70\%$) but exhibits synthetic vocoder artifacts ($\ge 65\%$), triggering an immediate `CRITICAL` clone attack alert.
- **Hardware-Backed Encrypted Vault**: Stores forensic incident dossiers locally in IndexedDB protected by **AES-GCM-256** and **SHA-256** integrity tags.
- **Idempotent Cloud Sync**: Once network connectivity recovers, dossiers are synced to the backend database with zero duplicates.

---

## 📱 Hardware & Platform Operational Boundaries
> [!IMPORTANT]
> **Mobile & Web Sandbox Boundary Disclosure**:
> Modern mobile operating systems (iOS and Android) strictly isolate the baseband cellular telephony stack from web browsers and PWAs for privacy and security reasons. Web applications cannot silently intercept cellular phone calls in the background.
>
> **VoiceShield Guardian supports 3 legitimate capture channels**:
> 1. **Forensic Audio File Upload**: Uploading recorded voice notes, call recordings, or suspicious voicemails (`.wav`, `.mp3`, `.m4a`, `.ogg`, `.webm`).
> 2. **Ambient Room Mic Capture (Speakerphone)**: Placing a live cellular call on speakerphone while VoiceShield Guardian listens via the device microphone.
> 3. **In-App VoIP Streams**: Direct monitoring of WebRTC or VoIP calls running inside supported web sessions.

---

## 🚀 5-Step Hackathon Airplane Mode Demonstration

### Step 1: Disconnect Network (Airplane Mode)
1. Open the browser to the application: `http://localhost:5173`
2. Navigate to **"Guardian Offline"** in the sidebar (or go directly to `/guardian-offline`).
3. Disconnect your machine/device from Wi-Fi, or open Chrome DevTools (`F12`), switch to the **Network** tab, and toggle the throttling dropdown to **"Offline"**.
4. Observe the HUD: The top status badge will immediately transition to **`OFFLINE ACTIVE`** in neon cyan, and a service worker keeps the entire UI functional.

---

### Step 2: Trigger Attack Vector Simulation
Use the built-in SIH 2026 attack vectors provided on the HUD:

1. **Digital Arrest Coercion (Hindi / English)**:
   - Click **`Simulate Police Arrest`**
   - *Transcript injected*: `"This is Officer Sharma from Delhi Police Cyber Crime Branch. An FIR has been registered against you for illegal money laundering. You are placed under digital arrest. Transfer 50,000 rupees immediately to verify your account."`
2. **Bank OTP Extortion (Telugu / English)**:
   - Click **`Simulate Bank OTP Scam`**
   - *Transcript injected*: `"State Bank of India fraud control alert: Your debit card is temporarily blocked. Please share the 6-digit OTP received on your mobile immediately to restore access."`
3. **Emergency Voice Clone (Family Impersonation)**:
   - Click **`Simulate Clone Impersonation`**
   - Select or toggle the enrolled trusted contact ("Papa / Dad").
   - *Transcript injected*: `"Papa here, my phone broke down and I had an accident. Please send 25,000 rupees to this UPI number immediately, don't tell mom yet!"`

---

### Step 3: Observe Real-Time Edge Inference
Without sending any data across the internet:
- **Audio Waveform Canvas**: Displays real-time audio visualization rendered directly via HTML5 `<canvas>`.
- **Acoustic Deepfake Score**: Evaluates synthetic vocoder smoothing, spectral rolloff, and zero-crossing irregularity.
- **Contextual Scam Score**: Identifies urgency pressure, impersonation tokens, and financial solicitation.
- **Combined Threat Level**: Escalates from `SAFE` to `HIGH` or `CRITICAL`.
- **Compound Attack Banner**: If high biometric similarity co-occurs with high synthetic probability, the HUD displays:  
  **`CRITICAL THREAT: Impersonation Clone Attack Detected`**

---

### Step 4: Validate Haptic Feedback & Defensive Guidance
1. **Device Vibration**: On mobile devices supporting the Web Haptic API (`navigator.vibrate`), the phone pulses with a distinct defensive vibration pattern `[300ms, 150ms, 300ms]`.
2. **Defensive Guidance Action Items**:
   - 🔴 *Hang up immediately and call back on the contact's verified personal number.*
   - 🔴 *Never transfer funds or share OTPs over incoming calls.*
   - 🔴 *Police and CBI never conduct "digital arrests" via video or audio calls.*

---

### Step 5: Encrypted Incident Vault & Cloud Recovery
1. The incident is immediately serialized, hashed with **SHA-256**, encrypted using **AES-GCM-256**, and committed to the browser's IndexedDB vault.
2. In the **"Encrypted Incident Vault"** section at the bottom of the page, view the recorded incident with its integrity hash (`sha256:...`) and lock icon.
3. **Restore Internet Connection**:
   - Turn Wi-Fi back on or set DevTools Network back to **"No Throttling"**.
   - Notice the status badge switches to **`CONNECTED (ONLINE)`**.
   - Click **`Sync Vault to Cloud`** (or wait for auto-sync).
4. The system sends an idempotent batch payload to `POST /api/v1/offline/sync`.
5. The records are safely written to the central SQLite database with audit trail entries, and marked `SYNCED`.
6. Clicking sync again demonstrates **idempotent deduplication** (0 duplicate records created).

---

## 🧪 Automated Verification
To verify the entire backend offline subsystem and test suite:
```bash
cd backend
npm test
```
**Results**:
- 151/151 tests passing
- Coverage includes `offlineGuardian.test.js`:
  - Standalone acoustic artifact extraction
  - Vocoder biomarker scoring
  - Offline deepfake provider health & inference
  - Multilingual fraud extraction (English, Hindi, Telugu)
  - Defensive negation suppression
  - Status endpoint capabilities & OS boundary transparency
  - Local `/analyze` endpoint execution
  - Idempotent `/sync` deduplication
