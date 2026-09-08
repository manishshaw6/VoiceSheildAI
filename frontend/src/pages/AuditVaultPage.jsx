import React, { useState } from 'react';
import HistoryReports from '../components/HistoryReports';
import SecurityDashboard from '../components/SecurityDashboard';

export default function AuditVaultPage({ onExportReport }) {
  const [inspectedAnalysis, setInspectedAnalysis] = useState(null);

  const handleSelect = (analysis) => {
    setInspectedAnalysis(analysis);
    const dashElem = document.getElementById('vault-inspector-panel');
    if (dashElem) dashElem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page-view-wrapper">
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Audit Vault & Forensics</span>
        </div>
        <h2>Forensic Audit Vault & Incident Compliance</h2>
        <p>Immutable forensic ledger of all scanned audio and live streaming sessions with downloadable intelligence reports.</p>
      </div>

      <div className="audit-vault-layout">
        <HistoryReports
          onSelectAnalysis={handleSelect}
          onExportReport={onExportReport}
        />

        {inspectedAnalysis && (
          <div id="vault-inspector-panel" className="inspector-panel-container">
            <div className="inspector-header">
              <div className="analyzer-badge">INSPECTED FORENSIC RECORD</div>
              <div className="inspector-title-row">
                <h3>Incident Telemetry: {inspectedAnalysis.analysisId || inspectedAnalysis.id}</h3>
                <button className="close-inspector-btn" onClick={() => setInspectedAnalysis(null)}>
                  ✕ Close Inspector
                </button>
              </div>
            </div>

            <SecurityDashboard
              analysis={inspectedAnalysis}
              onExportReport={onExportReport}
            />
          </div>
        )}
      </div>
    </div>
  );
}
