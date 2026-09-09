# VoiceShieldAI (VOXSHIELD)

> **AI-Powered Real-Time Voice Threat Intelligence, Deepfake Audio Detection & Anti-Scam Platform**

VoiceShieldAI is an enterprise-inspired voice security platform engineered to protect individuals, banking institutions, and organizations from next-generation voice-based cyber attacks: synthetic/deepfake voices, cloned audio impersonation, OTP/credential harvesting, and urgency-driven social engineering fraud.

---

## 1. Project Overview

With the rapid emergence of realistic voice cloning and generative AI speech synthesis, traditional voice channels (customer care calls, executive authorization lines, personal phone conversations) are increasingly vulnerable to high-impact fraud. VoiceShieldAI solves this by deploying a multimodal threat intelligence pipeline that evaluates:
1. **Voice Authenticity**: Synthetic speech detection via Reality Defender.
2. **Conversation Intent**: Generative fraud and coercion analysis via Gemini with Groq fallback.
3. **Deterministic Signals**: Local rule-based extraction of high-risk keywords (OTPs, PINs, UPI, CBI/Police impersonation, AnyDesk/TeamViewer remote access).
4. **Speaker Identity Biometrics**: Local acoustic embedding comparison to detect unauthorized speakers and voice clones.
5. **Multi-Signal Risk Fusion**: A unified, explainable 0–100 risk score with defensive protocols.

---

## 2. Target System Architecture

```
                               ┌────────────────────────┐
                               │   Audio Input Source   │
                               │ (File / Mic / Stream)  │
                               └───────────┬────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 VoiceShieldAI Backend                                  │
│                                                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌────────────────────────┐  │
│  │    Deepfake Detection   │  │    Speech-to-Text       │  │  Speaker Verification  │  │
│  │   (Reality Defender)    │  │     (AssemblyAI)        │  │   (Local Biometrics)   │  │
│  └────────────┬────────────┘  └────────────┬────────────┘  └───────────┬────────────┘  │
│               │                            │                           │               │
│               │                            ▼                           ▼               │
│               │               ┌─────────────────────────┐  ┌────────────────────────┐  │
│               │               │   Scam Intelligence     │  │ Voice Clone Suspicion  │  │
│               │               │    (Gemini / Groq)      │  │ (High Sim + High Fake) │  │
│               │               └────────────┬────────────┘  └───────────┬────────────┘  │
│               │                            │                           │               │
│               │                            ▼                           │               │
│               │               ┌─────────────────────────┐              │               │
│               │               │   Threat Rule Engine    │              │               │
│               │               │  (Local Deterministic)  │              │               │
│               │               └────────────┬────────────┘              │               │
│               │                            │                           │               │
│               └────────────────────────────┼───────────────────────────┘               │
│                                            ▼                                           │
│                              ┌───────────────────────────┐                             │
│                              │    Risk Fusion Engine     │                             │
│                              │   (0 - 100 Fused Score)   │                             │
│                              └─────────────┬─────────────┘                             │
│                                            ▼                                           │
│                              ┌───────────────────────────┐                             │
│                              │   Explainable AI Report   │                             │
│                              │    & SQLite Persistence   │                             │
│                              └─────────────┬─────────────┘                             │
└────────────────────────────────────────────┼───────────────────────────────────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │     Frontend Dashboard    │
                               │  (React 19 + 3D Spline)   │
                               └───────────────────────────┘
```

---

## 3. Core Features

- **Audio Threat Scanner**: In-browser drag-and-drop file upload (WAV, MP3, M4A, WEBM, OGG) with format, MIME, and size validation.
- **In-Browser Microphone Recorder**: Built-in audio capture with real-time waveform pulse, recording duration timer, and multi-state feedback (`idle`, `recording`, `processing`, `completed`, `failed`).
- **Near-Real-Time Live Call Shield**: WebSocket-based telemetry (`/ws/live-analysis`) streaming 1-second audio chunks and speech recognition, dynamically updating threat meters as words are spoken.
- **Biometric Speaker Enrollment & Verification**: 80-dimensional acoustic feature extraction and Cosine Similarity comparison.
- **Voice Clone Impersonation Guard**: Flagging attacks when an audio sample matches an enrolled identity's biometrics while exhibiting synthetic voice signatures.
- **Explainable AI Telemetry**: Clear breakdowns of authenticity classification, scam probability, evidence quotes, and actionable recommendations.
- **Segment Timeline Progression**: Temporal breakdown of audio intervals with timestamps and risk progression.
- **Forensic Audit History & Reports**: SQLite-backed historical scans with printable/downloadable JSON security reports.

---

## 4. Technologies

- **Frontend**: React 19, Vite 8, `@splinetool/react-spline`, Vanilla CSS with Google Font `Inter`.
- **Backend**: Node.js (v25+), Express 5, `ws` (WebSockets), `multer` (File Uploads), `sqlite3` (Database).
- **AI Integrations**:
  - `@realitydefender/realitydefender` SDK for synthetic audio detection.
  - `assemblyai` SDK for speech-to-text transcription.
  - `@google/genai` (Gemini 2.5 Flash) for structured fraud intelligence.
  - `groq-sdk` (Qwen 3.6 27B / Llama 3) for high-speed fallback.
  - Custom local acoustic feature extraction engine for free biometric verification.

---

## 5. Setup & Installation

### Prerequisites
- Node.js (v18 or newer; v25 tested)
- npm (v9+)

### Installation
1. Clone the repository:
   ```bash
   git clone <REPO_URL>
   cd VoiceSheildAI
   ```
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd ../frontend
   npm install
   ```

---

## 6. Environment Variables

Create a `.env` file inside the `backend/` folder (or copy `.env.example`):
```bash
cp backend/.env.example backend/.env
```

Set the required credentials:
```env
# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:5173

# Deepfake & Synthetic Audio Detection
REALITY_DEFENDER_API_KEY=your_reality_defender_api_key_here

# Speech-to-Text Transcription
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

# Scam & Conversation Intelligence
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here # optional fallback

# VoxCall LiveKit voice rooms
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
# Optional; defaults to 3600 seconds
LIVEKIT_TOKEN_TTL_SECONDS=3600
```

---

## 7. How to Run Frontend

From the `frontend` folder:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 8. How to Run Backend

From the `backend` folder:
```bash
npm start
# Or for live auto-reloading development:
npm run dev
```
The server will bind to `http://localhost:5000` with WebSocket stream at `ws://localhost:5000/ws/live-analysis`.

---

## 9. API Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health`, `/ready` | Process liveness and analysis readiness |
| `GET` | `/api/system/providers` | Provider configuration and availability without secrets |
| `POST` | `/api/audio/analyze` | Full audio upload analysis pipeline (`multipart/form-data`) |
| `POST` | `/api/speaker/enroll` | Enroll speaker reference voice (`speakerId`, `name`, `audio`) |
| `POST` | `/api/speaker/verify` | Verify suspect audio against enrolled identity |
| `GET` | `/api/speaker/profiles` | List all enrolled speaker profiles |
| `GET` | `/api/history` | Retrieve past analysis audit logs |
| `GET` | `/api/history/:id` | Fetch detailed forensic record for a single scan |
| `DELETE`| `/api/history/:id` | Delete an analysis record from SQLite database |
| `GET` | `/api/analysis/:id/report` | Download structured forensic intelligence report |
| `GET` | `/api/incidents/:id` | Retrieve an immutable incident snapshot |
| `GET` | `/api/audit` | Retrieve sanitized security audit events |
| `WS` | `/ws/live-analysis` | WebSocket live call streaming telemetry connection |

All `/api/*` REST endpoints also have stable `/api/v1/*` aliases.

---

## 10. Deepfake Detection Workflow

1. User submits audio through upload or microphone.
2. File is validated (format, MIME, size up to 25MB) and saved to secure temporary directory.
3. Backend dispatches the file to Reality Defender via the official SDK (`detect()`).
4. Output is normalized into:
   - `classification`: `REAL` | `SUSPICIOUS` | `FAKE` | `UNKNOWN`
   - `fakeProbability`: Float `0.00` to `1.00`
   - `confidence`: Confidence rating

---

## 11. Scam Analysis Workflow

1. Speech is transcribed with timestamps and word confidence via AssemblyAI.
2. The transcript is analyzed simultaneously through:
   - **Gemini Generative Fraud Model**: Evaluates intent, authority impersonation, coercion, urgency, and extracts direct quote evidence.
   - **Deterministic Threat Rule Engine**: Regex keyword scanner checking for OTP requests (+25), PIN/CVV theft (+30), AnyDesk/TeamViewer remote access (+25), UPI/payment demands (+20), and legal threats (+15).
3. If Gemini is unavailable, the pipeline falls back to Groq, and retains full deterministic protection even if all external LLMs are unreachable.

---

## 12. Speaker Verification Workflow

1. **Enrollment**: A user registers a reference voice sample. The system computes an 80-dimensional acoustic fingerprint (energy distribution, zero-crossing rate, spectral bands) and stores it in SQLite.
2. **Verification**: When suspect audio is submitted, the system computes its acoustic fingerprint and calculates Cosine Similarity against the reference embedding.
3. **Identity vs Authenticity**:
   - `Similarity >= 0.70`: Speaker Identity matches enrolled profile.
   - `Similarity >= 0.70` + `Deepfake Score >= 0.65`: **Possible Cloned Voice Impersonation Alert**.

---

## 13. Real-Time Workflow

1. Client opens WebSocket connection to `/ws/live-analysis`.
2. Browser `MediaRecorder` streams 1-second audio chunks to the backend.
3. Browser Web Speech API simultaneously streams real-time speech transcript pieces.
4. Backend buffers audio into rolling evaluation windows and tests against threat rules.
5. Live risk telemetry (`score`, `riskLevel`, `indicators`, `recommendedAction`) is broadcast to the client every 1–2 seconds.
6. Upon termination, the entire session is permanently saved to SQLite audit history.

---

## 14. Risk Score Methodology

The fused VoiceShield Risk Score (0–100) is calculated via dynamic evidence weighting:
- **Deepfake Detection**: 35%
- **Scam Intelligence**: 30%
- **Threat Rules Engine**: 20%
- **Speaker Identity / Clone**: 15%

If a signal is unavailable (e.g., unenrolled speaker), the weights are dynamically redistributed so missing signals never skew the score. If a **Voice Clone** or **Critical OTP Request** is verified, an automatic risk floor is enforced (70–85 minimum score).

### Threat Levels:
- **0 – 29**: `SAFE` (Clean / Normal)
- **30 – 59**: `SUSPICIOUS` (Caution Advised)
- **60 – 79**: `HIGH` (Suspicious Tactics)
- **80 – 100**: `CRITICAL` (Immediate Scam / Attack Detected)

---

## 15. Known Prototype Limitations

- **Browser Audio Formats**: Live microphone recording relies on browser-supported codecs (standard WebM/Opus or WAV).
- **Background Noise**: Extreme background acoustic noise may affect acoustic biometric similarity precision.
- **Provider Rate Limits**: Reality Defender and Gemini free-tier requests should be spaced according to provider quota policies.
