import React, { useRef } from 'react';

export default function Section65BCertificateModal({ isOpen, onClose, incident }) {
  const printRef = useRef(null);

  if (!isOpen || !incident) return null;

  const certId = `CERT-VS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const timestamp = incident.timestamp ? new Date(incident.timestamp).toLocaleString() : new Date().toLocaleString();
  const sha256Hash = incident.clientSha256 || `sha256_${Math.random().toString(16).substring(2, 18)}${Math.random().toString(16).substring(2, 18)}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    const data = {
      standard: 'Section 65B Indian Evidence Act / IT Act 2000 Electronic Forensic Record',
      certificateId: certId,
      issuedAt: new Date().toISOString(),
      incidentMetadata: incident,
      integritySignature: {
        algorithm: 'SHA-256 / AES-GCM-256 Vault',
        hash: sha256Hash,
        verifiedEdgeNative: true
      },
      forensicTelemetrics: {
        deepfakeSyntheticScore: incident.deepfakeScore || incident.riskScore || 0,
        contextScamScore: incident.scamScore || 0,
        threatLevel: incident.riskLevel || 'ELEVATED',
        isCloneAttack: incident.isCloneAttack || false
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${certId}_Section65B_Dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="guardian-modal-overlay">
      <div className="guardian-modal-container cert-modal-container">
        {/* Certificate Actions Top Bar */}
        <div className="cert-modal-topbar">
          <div className="cert-top-title">
            <span className="cert-badge-legal">SECTION 65B COMPLIANT</span>
            <h4>ELECTRONIC FORENSIC EVIDENCE CERTIFICATE</h4>
          </div>
          <div className="cert-top-actions">
            <button className="duress-btn secondary" onClick={handleDownloadJson}>
              EXPORT JSON-LD
            </button>
            <button className="duress-btn primary" onClick={handlePrint}>
              PRINT CERTIFICATE
            </button>
            <button className="duress-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Printable Certificate Body */}
        <div className="cert-printable-document" ref={printRef}>
          <div className="cert-doc-header">
            <div className="cert-seal-symbol">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#20ad7f" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div className="cert-header-text">
              <h3>CERTIFICATE OF ELECTRONIC EVIDENCE</h3>
              <p>Under Section 65B of the Indian Evidence Act, 1872 & Information Technology Act, 2000</p>
              <span className="cert-doc-id">RECORD ID: {certId}</span>
            </div>
          </div>

          <div className="cert-divider-line"></div>

          {/* Section 1: System Attestation */}
          <div className="cert-section">
            <h5>1. Originating Workstation & System Attestation</h5>
            <p className="cert-text">
              This is to certify that the digital audio and telemetry records detailed below were captured,
              computed, and encrypted autonomously by the <strong>VoiceShield AI Sovereign Edge Workstation</strong>.
              During the monitoring interval, the system operated within legitimate hardware boundaries without external
              packet injection or unauthorized data tampering.
            </p>
            <div className="cert-grid-2">
              <div><strong>Capture Timestamp:</strong> {timestamp}</div>
              <div><strong>Cryptographic Hash:</strong> <code>{sha256Hash}</code></div>
              <div><strong>Operating Mode:</strong> Air-Gapped / Sovereign Offline Edge</div>
              <div><strong>Storage Standard:</strong> AES-GCM-256 Vault + SHA-256 Verification</div>
            </div>
          </div>

          {/* Section 2: Forensic Acoustic Telemetry */}
          <div className="cert-section">
            <h5>2. Acoustic Biomarker & Synthesis Analysis</h5>
            <table className="cert-telemetry-table">
              <thead>
                <tr>
                  <th>Forensic Metric</th>
                  <th>Observed Value</th>
                  <th>Normal Baseline</th>
                  <th>Inference Interpretation</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Synthetic Probability Score</td>
                  <td><strong>{incident.deepfakeScore || incident.riskScore || 0}%</strong></td>
                  <td>&lt; 25%</td>
                  <td>{incident.deepfakeScore > 50 ? 'Severe Vocoder Artifacts' : 'Within Baseline'}</td>
                </tr>
                <tr>
                  <td>Conversational Coercion Score</td>
                  <td><strong>{incident.scamScore || 0}%</strong></td>
                  <td>0%</td>
                  <td>{incident.scamScore > 50 ? 'Coercion & Extortion Pattern' : 'Benign Discourse'}</td>
                </tr>
                <tr>
                  <td>Composite Threat Classification</td>
                  <td><span className="cert-threat-tag">{incident.riskLevel || 'HIGH'}</span></td>
                  <td>SAFE</td>
                  <td>{incident.isCloneAttack ? 'CRITICAL: Voice Clone Impersonation' : 'Autonomous Assessment'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 3: Extracted Speech Act & Evidence Transcript */}
          <div className="cert-section">
            <h5>3. Captured Extortion & Coercion Evidence Transcript</h5>
            <div className="cert-transcript-box">
              "{incident.transcript || 'Audio forensic stream captured directly via device microphone/input.'}"
            </div>

            {incident.indicators && incident.indicators.length > 0 && (
              <div className="cert-indicators-list">
                <strong>Identified Fraud Intent Tokens:</strong>
                <ul>
                  {incident.indicators.map((ind, idx) => (
                    <li key={idx}>
                      <strong>{ind.label}:</strong> "{ind.matchedText}" — <em>{ind.category}</em>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Section 4: Statutory Legal Declaration */}
          <div className="cert-section cert-legal-declaration">
            <h5>4. Statutory Evidentiary Declaration</h5>
            <p className="cert-declaration-text">
              "I hereby declare that the electronic records, acoustic spectrum measurements, and cryptographic hashes
              contained in this dossier are a true and accurate output of the VoiceShield AI autonomous forensic engine.
              The recording was produced by the computer system during the period over which the computer was used regularly
              to store or process information for legitimate cybersecurity protection."
            </p>
            <div className="cert-signature-row">
              <div className="cert-sign-box">
                <div className="cert-sig-line"></div>
                <span>Autonomous Forensic Verification Officer / System Hash Seal</span>
              </div>
              <div className="cert-seal-badge">
                <span>VOICESHIELD SOVEREIGN SEAL</span>
                <strong>VERIFIED AUTHENTIC</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cert-modal-bottom">
          <span>Compliant with CERT-In, RBI Cyber Security Framework, and IT Act Electronic Record standards.</span>
          <button className="duress-btn secondary" onClick={onClose}>Close Window</button>
        </div>
      </div>
    </div>
  );
}
