import React from 'react';

export default function SecurityDashboard({ analysis, onExportReport }) {
  if (!analysis) {
    return (
      <div className="dashboard-placeholder">
        <div className="placeholder-icon">🛡️</div>
        <h3>No Analysis Selected</h3>
        <p>Upload an audio file or record a voice snippet above to trigger VoiceShieldAI's multi-signal threat intelligence pipeline.</p>
      </div>
    );
  }

  const risk = analysis.risk || {};
  const score = risk.score !== undefined ? risk.score : (analysis.final_score || 0);
  const level = risk.level || analysis.risk_level || 'LOW';
  const deepfake = analysis.deepfake || {};
  const scam = analysis.scam || {};
  const speaker = analysis.speaker || {};
  const indicators = analysis.indicators || [];
  const timeline = analysis.timeline || [];
  const reasons = risk.reasons || [];
  const cloneSuspicion = risk.cloneSuspicion || false;

  const getLevelColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return '#ff3b5c';
      case 'HIGH': return '#ff8c00';
      case 'MODERATE': return '#ffd700';
      default: return '#00e5a3';
    }
  };

  const levelColor = getLevelColor(level);

  return (
    <div className="security-dashboard">
      {/* Top Banner Alert if Voice Clone Suspicion */}
      {cloneSuspicion && (
        <div className="clone-alert-banner">
          <div className="clone-alert-icon">⚠️</div>
          <div className="clone-alert-content">
            <div className="clone-alert-title">CRITICAL ALERT: POSSIBLE VOICE CLONING DETECTED</div>
            <div className="clone-alert-desc">
              {risk.cloneDescription || 'This voice exhibits high similarity to an enrolled identity while possessing strong synthetic speech characteristics, indicating an active voice cloning impersonation attack.'}
            </div>
          </div>
        </div>
      )}

      {/* Main KPI Row */}
      <div className="kpi-grid">
        {/* Overall Score Gauge */}
        <div className="kpi-card risk-score-card">
          <div className="kpi-label">OVERALL VOICESHIELD RISK SCORE</div>
          <div className="gauge-wrapper">
            <div className="gauge-number" style={{ color: levelColor }}>
              {score}
            </div>
            <div className="gauge-max">/ 100</div>
          </div>
          <div className="level-badge" style={{ backgroundColor: `${levelColor}22`, color: levelColor, borderColor: levelColor }}>
            {level} RISK
          </div>
          <div className="kpi-subtext">Multi-signal fused threat evaluation</div>
        </div>

        {/* Voice Authenticity */}
        <div className="kpi-card">
          <div className="kpi-label">VOICE AUTHENTICITY</div>
          <div className="card-primary-value">
            {deepfake.classification ? (
              <span className={`badge-class-${deepfake.classification.toLowerCase()}`}>
                {deepfake.classification}
              </span>
            ) : 'UNKNOWN'}
          </div>
          <div className="card-metric-row">
            <span>Synthetic Probability:</span>
            <strong>
              {deepfake.fakeProbability !== null && deepfake.fakeProbability !== undefined
                ? `${Math.round(deepfake.fakeProbability * 100)}%`
                : 'N/A'}
            </strong>
          </div>
          <div className="card-metric-row">
            <span>Provider:</span>
            <span className="provider-tag">{deepfake.provider || 'Reality Defender'}</span>
          </div>
          <div className="kpi-subtext">Acoustic manipulation & deepfake scan</div>
        </div>

        {/* Speaker Identity */}
        <div className="kpi-card">
          <div className="kpi-label">SPEAKER IDENTITY STATUS</div>
          <div className="card-primary-value">
            {speaker.enrolled ? (
              speaker.match ? (
                <span className="badge-match">MATCH VERIFIED</span>
              ) : (
                <span className="badge-mismatch">IDENTITY MISMATCH</span>
              )
            ) : (
              <span className="badge-neutral">UNENROLLED IDENTITY</span>
            )}
          </div>
          <div className="card-metric-row">
            <span>Target Speaker:</span>
            <strong>{speaker.speakerName || 'None'}</strong>
          </div>
          <div className="card-metric-row">
            <span>Acoustic Similarity:</span>
            <strong>
              {speaker.similarity !== null && speaker.similarity !== undefined
                ? `${Math.round(speaker.similarity * 100)}%`
                : 'N/A'}
            </strong>
          </div>
          <div className="kpi-subtext">Reference voice embedding comparison</div>
        </div>

        {/* Scam Intelligence */}
        <div className="kpi-card">
          <div className="kpi-label">CONVERSATION SCAM INTEL</div>
          <div className="card-primary-value">
            <span className="scam-cat-title">{scam.category || 'Benign / Clean'}</span>
          </div>
          <div className="card-metric-row">
            <span>Scam Likelihood:</span>
            <strong>
              {scam.scamProbability !== undefined
                ? `${Math.round(scam.scamProbability * 100)}%`
                : '0%'}
            </strong>
          </div>
          <div className="card-metric-row">
            <span>Severity:</span>
            <span className={`severity-tag ${(scam.severity || 'LOW').toLowerCase()}`}>
              {scam.severity || 'LOW'}
            </span>
          </div>
          <div className="kpi-subtext">Gemini conversation intent model</div>
        </div>
      </div>

      {/* Actionable Defense Recommendation */}
      <div className="recommendation-card" style={{ borderLeftColor: levelColor }}>
        <div className="rec-header">
          <span className="rec-icon">🛡️</span>
          <span className="rec-title">DEFENSIVE PROTOCOL & ACTIONABLE RECOMMENDATION</span>
        </div>
        <p className="rec-body">
          {risk.recommendedAction || 'No suspicious actions detected. Continue normal conversation.'}
        </p>
      </div>

      {/* Two Column Layout: Threat Indicators & Transcript */}
      <div className="detail-grid">
        {/* Left: Detected Signals / Indicators */}
        <div className="detail-card">
          <div className="detail-card-header">
            <h4>Detected Threat Signals ({indicators.length})</h4>
            <span className="header-sub">Deterministic Rules + LLM Extractions</span>
          </div>

          {indicators.length === 0 ? (
            <div className="empty-signals">No malicious threat signals detected in this sample.</div>
          ) : (
            <div className="indicators-list">
              {indicators.map((ind, idx) => (
                <div key={idx} className={`indicator-item severity-${(ind.severity || 'MEDIUM').toLowerCase()}`}>
                  <div className="ind-top">
                    <span className="ind-label">{ind.label || ind.type}</span>
                    <span className="ind-badge">{ind.severity || 'ALERT'}</span>
                  </div>
                  {ind.evidence && (
                    <div className="ind-evidence">
                      <em>"{ind.evidence}"</em>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Explainable AI Evidence Points */}
          <div className="explainable-reasons-section">
            <h5>Explainable Risk Factors:</h5>
            <ul className="reasons-list">
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: Transcript & Timeline Progression */}
        <div className="detail-card">
          <div className="detail-card-header">
            <h4>Conversation Transcript</h4>
            <span className="header-sub">AssemblyAI Speech-to-Text</span>
          </div>

          <div className="transcript-box">
            {analysis.transcription?.text || analysis.transcript || 'No transcript text available for this audio sample.'}
          </div>

          {/* Timeline Analysis Progression */}
          {timeline && timeline.length > 0 && (
            <div className="timeline-section">
              <h5>Timeline / Segment Threat Progression</h5>
              <div className="timeline-items">
                {timeline.map((seg, idx) => (
                  <div key={idx} className={`timeline-row ${seg.flagged ? 'flagged' : ''}`}>
                    <div className="seg-time">
                      {seg.start}s - {seg.end}s
                    </div>
                    <div className="seg-content">
                      <div className="seg-text">"{seg.text}"</div>
                      {seg.indicators && seg.indicators.length > 0 && (
                        <div className="seg-tags">
                          {seg.indicators.map((tg, i) => (
                            <span key={i} className="seg-tag">{tg}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="seg-risk">
                      <span className={`risk-pill ${seg.risk >= 60 ? 'high' : seg.risk >= 30 ? 'medium' : 'low'}`}>
                        {seg.risk}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="dashboard-footer-actions">
        <button
          className="report-download-btn"
          onClick={() => onExportReport && onExportReport(analysis.analysisId || analysis.id)}
        >
          Export Security Intelligence Report (JSON)
        </button>
      </div>
    </div>
  );
}
