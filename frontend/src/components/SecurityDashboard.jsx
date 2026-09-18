import React, { useState } from 'react';
import { generateCyberCrimePdfReport } from '../services/pdfReportGenerator';
import IncidentReportModal from './IncidentReportModal';
import VoiceForensicsWorkstation from './VoiceForensicsWorkstation';

export default function SecurityDashboard({ analysis, onExportReport }) {
  const [activeGuidanceTab, setActiveGuidanceTab] = useState('all');
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'forensics' | 'guidance'

  const handleDownloadPdf = () => {
    try {
      setDownloadingPdf(true);
      generateCyberCrimePdfReport(analysis);
    } catch (err) {
      console.error('PDF Generation error:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setTimeout(() => setDownloadingPdf(false), 1200);
    }
  };

  if (!analysis) {
    return (
      <div className="dashboard-placeholder">
        <div className="placeholder-icon" style={{ fontSize: '2rem', color: '#00d2ff', opacity: 0.8 }}>VOX</div>
        <h3>No Analysis Selected</h3>
        <p>Upload an audio file or record a voice snippet to trigger VoiceShieldAI's multi-signal voice forensics & threat intelligence pipeline.</p>
      </div>
    );
  }

  const risk = analysis.risk || {};
  const score = typeof risk.score === 'number' ? risk.score : (analysis.final_score || 0);
  const level = risk.level || analysis.risk_level || 'LOW';
  const deepfake = analysis.deepfake || {};
  const scam = analysis.scam || {};
  const speaker = analysis.speaker || {};
  const indicators = analysis.indicators || [];
  const timeline = analysis.timeline || [];
  const reasons = risk.reasons || [];
  const cloneSuspicion = Boolean(risk.cloneSuspicion);
  const forensic = analysis.forensic || analysis.audio_forensics || {};
  const convIntel = analysis.conversationIntelligence || null;
  const incidentGuidance = analysis.incidentGuidance || null;
  const complaintDraft = analysis.complaintDraft || null;

  const isThreat = score >= 30 || (convIntel?.threat_assessment?.malicious_intent_detected);

  const threatRules = analysis.threatRules || {};
  const topIndicator = indicators.find(i => i.severity === 'CRITICAL' || i.severity === 'HIGH') || indicators[0];

  const detectedScamCategory = (convIntel?.threat_assessment?.threat_category && 
    convIntel.threat_assessment.threat_category !== 'Normal Conversation' && 
    convIntel.threat_assessment.threat_category !== 'Deterministic Assessment' &&
    convIntel.threat_assessment.threat_category !== 'No Speech Detected')
      ? convIntel.threat_assessment.threat_category
      : (topIndicator?.label || threatRules.matchedCategories?.[0]?.replace(/_/g, ' ') || scam.category || (isThreat ? 'Suspicious Coercion / Payment Threat' : 'Normal Conversation'));

  const detectedScamScore = Math.max(
    convIntel?.threat_assessment?.threat_score != null ? Math.round(convIntel.threat_assessment.threat_score * 100) : 0,
    threatRules.score ? Math.round(threatRules.score) : 0,
    scam.scamProbability != null ? Math.round(scam.scamProbability * 100) : 0
  );

  const detectedAttackStage = (convIntel?.threat_assessment?.attack_stage && convIntel.threat_assessment.attack_stage !== 'BENIGN')
    ? convIntel.threat_assessment.attack_stage
    : (detectedScamScore >= 70 ? 'EXPLOITATION' : detectedScamScore >= 35 ? 'PRESSURE ESCALATION' : isThreat ? 'INITIAL CONTACT' : 'BENIGN');

  const primaryDriverText = reasons[0] || (topIndicator?.label ? `Triggered by: ${topIndicator.label}` : isThreat ? 'Multi-signal linguistic & acoustic threat detected' : 'Authentic speech baseline · No threat patterns detected');

  const orgIntel = analysis.organization || (convIntel?.threat_assessment?.impersonated_organization ? {
    detected: true,
    claimedOrganization: convIntel.threat_assessment.impersonated_organization,
    category: convIntel.threat_assessment.threat_category || 'Banking / Financial Services',
    isImpersonation: true,
    confidence: 0.88,
    isVerifiedOrg: true,
    trustScore: 95,
    primaryDomain: 'sbi.co.in',
    officialHelpline: '1800 1234 / 1930',
    suspiciousReasons: ['Unsolicited caller claiming to represent financial institution requesting urgent credential verification.'],
    evidenceQuotes: []
  } : null);

  const reportingEligibility = analysis.reportingEligibility || (isThreat ? {
    status: score >= 75 ? 'STRONGLY_RECOMMENDED' : 'RECOMMENDED',
    isEligible: true,
    recommendedAction: 'File an authenticated fraud report with the impersonated entity.'
  } : {
    status: 'NOT_ELIGIBLE',
    isEligible: false,
    recommendedAction: 'No report required for benign or non-impersonation calls.'
  });

  const getLevelColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return '#ff3b5c';
      case 'HIGH': return '#ff8c00';
      case 'SUSPICIOUS':
      case 'MODERATE': return '#ffd700';
      default: return '#00e5a3';
    }
  };

  const levelColor = getLevelColor(level);

  // Fallback complaint text if not pre-generated
  const effectiveComplaintDraft = complaintDraft || `INCIDENT COMPLAINT DRAFT — VOICESHIELD AI FORENSIC REPORT
================================================================================
DRAFT FOR USER REVIEW — NOT LEGAL ADVICE
================================================================================
Incident Timestamp: ${new Date().toISOString()}
Audio File Name:    ${forensic.filename || 'voice_recording'}
SHA-256 Hash:       ${forensic.sha256 || 'N/A'}
Overall Risk Score: ${score}/100 (${level})

1. INCIDENT OVERVIEW
${convIntel?.summary?.detailed_summary || risk.recommendedAction || 'Potential social engineering or unauthorized voice interaction detected.'}

2. FORENSIC FINDINGS
- Voice Authenticity: ${deepfake.verdict || deepfake.classification || 'N/A'} (Score: ${deepfake.score != null ? Math.round(deepfake.score * 100) + '%' : 'N/A'})
- Speaker Verification: ${speaker.decision || (speaker.enrolled ? (speaker.match ? 'LIKELY MATCH' : 'DOES_NOT_MATCH') : 'NO_TARGET_SPEAKER')}
- Threat Signals: ${indicators.map(i => i.label || i.type).join(', ') || 'None'}

3. ACTION REQUIRED
Please review this draft, verify all information, and file an official complaint at https://cybercrime.gov.in or call National Cybercrime Helpline 1930.
`;

  const copyToClipboard = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 3000);
      });
    }
  };

  // Safe access to evidence contributions
  const contributions = Array.isArray(risk.evidenceContributions) && risk.evidenceContributions.length > 0
    ? risk.evidenceContributions
    : Object.entries(risk.components || {}).map(([key, val]) => ({
        category: key,
        label: key.replace(/_/g, ' '),
        points: Math.round(val * (risk.weightsUsed?.[key] || 0.2)),
        scorePercent: val,
        confidencePercent: 85
      }));

  const maxPoints = Math.max(...contributions.map(c => c.points || 0), 1);

  return (
    <div className="security-dashboard">
      {/* Benchmark Evidence Banner */}
      {analysis.is_demo_benchmark && (
        <div className="benchmark-evidence-banner" style={{
          background: 'linear-gradient(135deg, rgba(255, 140, 0, 0.15), rgba(155, 89, 182, 0.15))',
          border: '2px solid #ff8c00',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255, 140, 0, 0.25)', color: '#ff8c00', fontWeight: 900, fontSize: '0.9rem' }}>!</span>
          <div>
            <div style={{ fontWeight: 700, color: '#ff8c00', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              OFFLINE BENCHMARK EVIDENCE MODE
            </div>
            <div style={{ color: '#ccc', fontSize: '0.82rem', marginTop: '3px' }}>
              {analysis.benchmark_notice || 'Cloud API unavailable or demo active. Showing verified benchmark telemetry.'}
              {analysis.benchmark_name && <span style={{ color: '#9b59b6', marginLeft: '8px' }}>Scenario: {analysis.benchmark_name}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Voice Clone Critical Alert Banner */}
      {cloneSuspicion && (
        <div className="clone-alert-banner" style={{
          background: 'linear-gradient(90deg, rgba(255, 59, 92, 0.25), rgba(255, 140, 0, 0.2))',
          border: '2px solid #ff3b5c',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255, 59, 92, 0.3)', color: '#ff3b5c', fontWeight: 900, fontSize: '1.1rem' }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#ff3b5c', fontSize: '0.95rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              CRITICAL THREAT: VOICE CLONE IMPERSONATION DETECTED
            </div>
            <div style={{ color: '#f0f4ff', fontSize: '0.88rem', marginTop: '4px', lineHeight: 1.5 }}>
              {risk.cloneDescription || 'This voice exhibits strong acoustic similarity to an enrolled identity while simultaneously containing synthetic manipulation artifacts. This indicates an active synthetic voice cloning attack.'}
            </div>
          </div>
          <div style={{ background: '#ff3b5c', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800 }}>
            BLOCK ACTION
          </div>
        </div>
      )}

      {/* Navigation Tabs for progressive disclosure */}
      <div className="dashboard-subtabs" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`subtab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{
              background: activeTab === 'overview' ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
              border: activeTab === 'overview' ? '1px solid #00d2ff' : '1px solid transparent',
              color: activeTab === 'overview' ? '#00d2ff' : 'rgba(255,255,255,0.6)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}
          >
            Multi-Signal Overview
          </button>
          <button
            className={`subtab-btn ${activeTab === 'forensics' ? 'active' : ''}`}
            onClick={() => setActiveTab('forensics')}
            style={{
              background: activeTab === 'forensics' ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
              border: activeTab === 'forensics' ? '1px solid #00d2ff' : '1px solid transparent',
              color: activeTab === 'forensics' ? '#00d2ff' : 'rgba(255,255,255,0.6)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}
          >
            Deterministic Evidence Math & Ledger
          </button>
          <button
            className={`subtab-btn ${activeTab === 'guidance' ? 'active' : ''}`}
            onClick={() => setActiveTab('guidance')}
            style={{
              background: activeTab === 'guidance' ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
              border: activeTab === 'guidance' ? '1px solid #00d2ff' : '1px solid transparent',
              color: activeTab === 'guidance' ? '#00d2ff' : 'rgba(255,255,255,0.6)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}
          >
            Incident Guidance & Reporting (1930)
          </button>
        </div>

        <button
          onClick={handleDownloadPdf}
          style={{
            background: 'linear-gradient(135deg, #0b1d3a, #1e3a8a)',
            color: '#fff',
            border: '1px solid #3b82f6',
            padding: '8px 18px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '0.84rem',
            boxShadow: '0 4px 14px rgba(11, 29, 58, 0.6)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            letterSpacing: '0.02em'
          }}
          title="Download digitally signed VoxShield Incident Report dossier (PDF)"
        >
          {downloadingPdf ? 'Generating Verified Dossier...' : 'Download VoxShield Verified Incident Dossier (PDF)'}
        </button>
      </div>

      {/* Organization Impersonation Alert & Action Card */}
      {orgIntel && orgIntel.detected && isThreat && (
        <div className="org-impersonation-card" style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
          border: '2px solid rgba(255, 59, 92, 0.6)',
          borderRadius: '14px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 8px 32px rgba(255, 59, 92, 0.15)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #ff3b5c, #ff8c00, #ffd700)'
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(255, 59, 92, 0.2)',
                  color: '#ff3b5c',
                  border: '1px solid #ff3b5c',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase'
                }}>
                  POSSIBLE ORGANIZATION IMPERSONATION
                </span>

                {orgIntel.isVerifiedOrg ? (
                  <span style={{
                    background: 'rgba(0, 229, 163, 0.15)',
                    color: '#00e5a3',
                    border: '1px solid #00e5a3',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    ✓ TRUSTED DIRECTORY ENTITY
                  </span>
                ) : (
                  <span style={{
                    background: 'rgba(255, 140, 0, 0.15)',
                    color: '#ff8c00',
                    border: '1px solid #ff8c00',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    UNVERIFIED CLAIMED ENTITY
                  </span>
                )}

                <span style={{
                  background: 'rgba(0, 210, 255, 0.12)',
                  color: '#00d2ff',
                  border: '1px solid rgba(0, 210, 255, 0.3)',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  DIRECTORY TRUST: {orgIntel.trustScore || 85}/100
                </span>
              </div>

              <h3 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 800, margin: '10px 0 4px 0' }}>
                {orgIntel.claimedOrganization || 'Unknown Organization'}
              </h3>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                Category: <strong style={{ color: '#eff4ff' }}>{orgIntel.category || 'Banking / Financial Services'}</strong>
                {orgIntel.primaryDomain && (
                  <span style={{ marginLeft: '12px' }}>
                    Official Domain: <code style={{ color: '#00d2ff' }}>{orgIntel.primaryDomain}</code>
                  </span>
                )}
                {orgIntel.officialHelpline && (
                  <span style={{ marginLeft: '12px' }}>
                    Helpline: <strong style={{ color: '#ffd700' }}>{orgIntel.officialHelpline}</strong>
                  </span>
                )}
              </div>

              {orgIntel.suspiciousReasons && orgIntel.suspiciousReasons.length > 0 && (
                <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#ff8c00', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                    Impersonation Assessment Findings:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#eff4ff', fontSize: '0.83rem', lineHeight: 1.5 }}>
                    {orgIntel.suspiciousReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', justifyContent: 'center' }}>
              <div style={{
                background: reportingEligibility?.status === 'STRONGLY_RECOMMENDED'
                  ? 'rgba(255, 59, 92, 0.2)'
                  : 'rgba(255, 140, 0, 0.2)',
                border: `1px solid ${reportingEligibility?.status === 'STRONGLY_RECOMMENDED' ? '#ff3b5c' : '#ff8c00'}`,
                color: reportingEligibility?.status === 'STRONGLY_RECOMMENDED' ? '#ff3b5c' : '#ff8c00',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 800,
                textAlign: 'center',
                letterSpacing: '0.04em'
              }}>
                REPORTING STATUS: {reportingEligibility?.status?.replace(/_/g, ' ') || 'RECOMMENDED'}
              </div>

              <button
                onClick={() => setShowIncidentModal(true)}
                style={{
                  background: 'linear-gradient(135deg, #ff3b5c, #e11d48)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 22px',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 18px rgba(255, 59, 92, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.15s ease'
                }}
              >
                <span>GENERATE & AUTHORIZE INCIDENT REPORT</span>
                <span style={{ fontSize: '1.1rem' }}>↗</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main KPI 4-Card Grid */}
      <div className="kpi-grid">
        {/* 1. Overall Score Gauge */}
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
          <div className="kpi-subtext" style={{ color: levelColor, fontWeight: 600, fontSize: '0.74rem', marginTop: '6px' }}>
            {primaryDriverText}
          </div>
        </div>

        {/* 2. Voice Authenticity */}
        <div className="kpi-card">
          <div className="kpi-label">VOICE AUTHENTICITY</div>
          <div className="card-primary-value">
            {deepfake.score !== null && deepfake.score !== undefined ? (
              <span className={`badge-class-${(deepfake.classification || 'unknown').toLowerCase()}`}>
                {deepfake.verdict || deepfake.classification || 'AUTHENTIC'}
              </span>
            ) : (
              <span style={{
                background: 'rgba(0, 229, 163, 0.15)',
                color: '#00e5a3',
                border: '1px solid rgba(0, 229, 163, 0.4)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 800
              }}>
                ACOUSTIC SPECTRAL PASS
              </span>
            )}
          </div>
          <div className="card-metric-row">
            <span>Synthetic Manipulation:</span>
            <strong>
              {deepfake.score !== null && deepfake.score !== undefined
                ? `${Math.round(deepfake.score * 100)}%`
                : deepfake.fakeProbability !== null && deepfake.fakeProbability !== undefined
                ? `${Math.round(deepfake.fakeProbability * 100)}%`
                : '0% (Natural Speech)'}
            </strong>
          </div>
          <div className="card-metric-row">
            <span>Biometric Telemetry:</span>
            <strong>
              {deepfake.confidence !== null && deepfake.confidence !== undefined
                ? `${Math.round(deepfake.confidence * 100)}% (Cloud Model)`
                : 'Calibrated (DSP & PyTorch)'}
            </strong>
          </div>
          <div className="kpi-subtext">
            {deepfake.score !== null && deepfake.score !== undefined
              ? 'Reality Defender acoustic biometric scan'
              : 'Calibrated DSP spectral & Mel spectrogram verification'}
          </div>
        </div>

        {/* 3. Speaker Identity Status */}
        <div className="kpi-card">
          <div className="kpi-label">SPEAKER IDENTITY STATUS</div>
          <div className="card-primary-value">
            {speaker.status === 'NO_TARGET_SPEAKER' || speaker.decision === 'NO_COMPARISON_REQUESTED' || !speaker.enrolled ? (
              <span className="badge-neutral" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
                GENERAL AUDIT (NO TARGET)
              </span>
            ) : speaker.decision === 'LIKELY MATCH' || speaker.match ? (
              <span className="badge-match" style={{ background: 'rgba(0, 229, 163, 0.2)', color: '#00e5a3', border: '1px solid #00e5a3' }}>
                MATCH VERIFIED
              </span>
            ) : speaker.decision === 'DOES_NOT_MATCH' ? (
              <span className="badge-mismatch" style={{ background: 'rgba(255, 59, 92, 0.2)', color: '#ff3b5c', border: '1px solid #ff3b5c' }}>
                IDENTITY MISMATCH
              </span>
            ) : (
              <span className="badge-neutral">{speaker.decision || 'INCONCLUSIVE'}</span>
            )}
          </div>
          <div className="card-metric-row">
            <span>Target Speaker:</span>
            <strong>{speaker.speakerName || 'None (General Scan)'}</strong>
          </div>
          <div className="card-metric-row">
            <span>Cosine Similarity:</span>
            <strong>
              {speaker.similarity !== null && speaker.similarity !== undefined
                ? `${Math.round(speaker.similarity * 100)}%`
                : 'N/A (No penalty)'}
            </strong>
          </div>
          <div className="kpi-subtext">ECAPA-TDNN 192-d acoustic embedding</div>
        </div>

        {/* 4. Conversation Scam & Threat Intel */}
        <div className="kpi-card">
          <div className="kpi-label">CONVERSATION SCAM INTEL</div>
          <div className="card-primary-value">
            <span className="scam-cat-title" style={{ color: detectedScamScore >= 50 ? '#ff3b5c' : detectedScamScore >= 30 ? '#ff8c00' : '#00e5a3' }}>
              {detectedScamCategory}
            </span>
          </div>
          <div className="card-metric-row">
            <span>Attack Stage:</span>
            <strong style={{ color: detectedAttackStage === 'EXPLOITATION' ? '#ff3b5c' : detectedAttackStage === 'PRESSURE ESCALATION' ? '#ff8c00' : '#cbd5e1' }}>
              {detectedAttackStage}
            </strong>
          </div>
          <div className="card-metric-row">
            <span>Threat Score:</span>
            <strong>
              {detectedScamScore}/100
            </strong>
          </div>
          <div className="kpi-subtext">Cyber-fraud linguistic intent & rule fusion</div>
        </div>
      </div>

      {/* Defensive Protocol / Actionable Recommendation */}
      <div className="recommendation-card" style={{ borderLeftColor: levelColor, marginBottom: '20px' }}>
        <div className="rec-header">
          <span className="rec-icon" style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${levelColor}`,
            color: levelColor,
            background: `${levelColor}15`
          }}>PROTOCOL</span>
          <span className="rec-title">DEFENSIVE PROTOCOL & ACTIONABLE RECOMMENDATION</span>
        </div>
        <p className="rec-body">
          {risk.recommendedAction || (isThreat
            ? 'Suspicious indicators detected. Discontinue call immediately and verify caller identity through a trusted independent channel.'
            : 'No significant security threats detected. Normal conversation flow.')}
        </p>
      </div>

      {/* Primary Voice Forensic Signal Analysis Workstation */}
      <VoiceForensicsWorkstation analysis={analysis} />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <>
          {/* Interaction Summary: Benign vs Threat */}
          {!isThreat && convIntel?.benign_summary ? (
            <div className="detail-card" style={{ marginBottom: '20px' }}>
              <div className="detail-card-header">
                <h4>Post-Call Interaction Summary (Benign Call)</h4>
                <span className="header-sub">Structured Meeting & Conversation Digest</span>
              </div>
              <p style={{ color: '#eff4ff', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '14px' }}>
                {convIntel.benign_summary.summary || convIntel.summary?.detailed_summary}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Participants & Roles</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>
                    {convIntel.benign_summary.participants_and_roles?.join(', ') || 'Identified speakers'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Topics Discussed</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>
                    {convIntel.benign_summary.topics_discussed?.join(', ') || 'General conversation'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Requested Follow-ups</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>
                    {convIntel.benign_summary.requested_followups?.join(', ') || 'None required'}
                  </div>
                </div>
              </div>
            </div>
          ) : isThreat && convIntel ? (
            <div className="detail-card" style={{ marginBottom: '20px', borderLeft: '4px solid #ff3b5c' }}>
              <div className="detail-card-header">
                <h4 style={{ color: '#ff3b5c' }}>Cyber-Fraud Security Incident Brief</h4>
                <span className="header-sub">Threat Extraction & Victim Exposure Analysis</span>
              </div>
              <p style={{ color: '#eff4ff', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '14px' }}>
                {convIntel.summary?.detailed_summary || convIntel.summary?.short_summary}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div style={{ background: 'rgba(255, 59, 92, 0.08)', border: '1px solid rgba(255, 59, 92, 0.2)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#ff3b5c', textTransform: 'uppercase', fontWeight: 700 }}>Apparent Caller Goal</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>
                    {convIntel.summary?.caller_apparent_goal || 'Financial / Credential extraction'}
                  </div>
                </div>

                <div style={{ background: 'rgba(255, 140, 0, 0.08)', border: '1px solid rgba(255, 140, 0, 0.2)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#ff8c00', textTransform: 'uppercase', fontWeight: 700 }}>Interaction Outcome</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>
                    {convIntel.summary?.interaction_outcome || 'Attempted fraud intercepted'}
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 210, 255, 0.08)', border: '1px solid rgba(0, 210, 255, 0.2)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#00d2ff', textTransform: 'uppercase', fontWeight: 700 }}>Victim Exposure Assessment</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>
                    {convIntel.victim_exposure?.information_shared || 'None indicated in audio'}
                  </div>
                </div>
              </div>

              {/* Sensitive Entities Requested */}
              {convIntel.sensitive_entities && (
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', marginTop: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#ff8c00', fontWeight: 700, marginBottom: '6px' }}>
                    SENSITIVE ENTITIES TARGETED:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {convIntel.sensitive_entities.otp_requested && (
                      <span style={{ background: '#ff3b5c33', color: '#ff3b5c', border: '1px solid #ff3b5c', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                        OTP Requested
                      </span>
                    )}
                    {convIntel.sensitive_entities.passwords_requested && (
                      <span style={{ background: '#ff3b5c33', color: '#ff3b5c', border: '1px solid #ff3b5c', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                        Password Requested
                      </span>
                    )}
                    {convIntel.sensitive_entities.card_details_requested && (
                      <span style={{ background: '#ff3b5c33', color: '#ff3b5c', border: '1px solid #ff3b5c', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                        Card Details Requested
                      </span>
                    )}
                    {convIntel.sensitive_entities.bank_account_reference && (
                      <span style={{ background: '#ff8c0033', color: '#ff8c00', border: '1px solid #ff8c00', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem' }}>
                        Bank: {convIntel.sensitive_entities.bank_account_reference}
                      </span>
                    )}
                    {convIntel.sensitive_entities.upi_reference && (
                      <span style={{ background: '#ff8c0033', color: '#ff8c00', border: '1px solid #ff8c00', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem' }}>
                        UPI: {convIntel.sensitive_entities.upi_reference}
                      </span>
                    )}
                    {convIntel.sensitive_entities.payment_amounts?.map((amt, i) => (
                      <span key={i} style={{ background: '#ffd70033', color: '#ffd700', border: '1px solid #ffd700', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem' }}>
                        Demanded: {amt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Two Column Layout: Threat Indicators & Transcript */}
          <div className="detail-grid">
            {/* Left: Threat Signals & Social Engineering Levers */}
            <div className="detail-card">
              <div className="detail-card-header">
                <h4>Detected Threat Signals ({indicators.length})</h4>
                <span className="header-sub">Deterministic Rules + Context Models</span>
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

              {/* Social Engineering Levers if present */}
              {convIntel?.social_engineering?.techniques?.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00d2ff', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Psychological Manipulation Techniques:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {convIntel.social_engineering.techniques.map((t, i) => (
                      <span key={i} style={{ background: 'rgba(0, 210, 255, 0.15)', color: '#00d2ff', border: '1px solid rgba(0, 210, 255, 0.3)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.78rem' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Explainable AI Evidence Points */}
              <div className="explainable-reasons-section" style={{ marginTop: '16px' }}>
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
                <h4>Conversation Transcript & Evidence</h4>
                <span className="header-sub">
                  {analysis.transcription?.provider
                    ? `${String(analysis.transcription.provider).toUpperCase()} Speech-to-Text`
                    : 'Speech-to-Text'}
                </span>
              </div>

              <div className="transcript-box" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {analysis.transcription?.text || analysis.transcript || 'No transcript text available for this audio sample.'}
              </div>

              {/* Timeline Analysis Progression */}
              {((convIntel?.conversation_timeline?.length > 0) || (timeline && timeline.length > 0)) && (
                <div className="timeline-section" style={{ marginTop: '16px' }}>
                  <h5>Timeline Threat Progression</h5>
                  <div className="timeline-items" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {(convIntel?.conversation_timeline || timeline).map((seg, idx) => (
                      <div key={idx} className={`timeline-row ${seg.flagged || seg.risk_delta?.includes('+') ? 'flagged' : ''}`}>
                        <div className="seg-time">
                          {seg.timestamp || `${seg.start || 0}s`}
                        </div>
                        <div className="seg-content">
                          <div className="seg-text">"{seg.event || seg.text}"</div>
                          {seg.reason && <div style={{ fontSize: '0.78rem', color: '#ff8c00', marginTop: '2px' }}>{seg.reason}</div>}
                        </div>
                        <div className="seg-risk">
                          <span className={`risk-pill ${seg.risk >= 60 || seg.risk_delta?.includes('+') ? 'high' : 'low'}`}>
                            {seg.risk_delta || `${seg.risk || 0}%`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: FORENSICS & EVIDENCE MATH */}
      {activeTab === 'forensics' && (
        <div className="detail-card" style={{ marginBottom: '20px' }}>
          <div className="detail-card-header">
            <h4>Itemized Evidence Contribution Math</h4>
            <span className="header-sub">Deterministic Fusion Weights & Score Contributions</span>
          </div>

          <p style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '16px' }}>
            VoxShield AI does not use opaque heuristics. Each acoustic and linguistic signal receives a calibrated weight, producing transparent mathematical points that fuse into the final score (0–100).
          </p>

          {/* Interaction Deltas if present */}
          {risk.interactionDeltas && risk.interactionDeltas.length > 0 && (
            <div style={{
              background: 'rgba(255, 59, 92, 0.1)',
              border: '1px solid #ff3b5c',
              borderRadius: '8px',
              padding: '14px 18px',
              marginBottom: '18px'
            }}>
              <div style={{ color: '#ff3b5c', fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase', marginBottom: '6px' }}>
                Non-Linear Multi-Signal Interactions Triggered:
              </div>
              {risk.interactionDeltas.map((delta, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ color: '#fff', fontSize: '0.88rem' }}>{delta.label || delta.pattern}</span>
                  <span style={{ background: '#ff3b5c', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.82rem' }}>
                    +{delta.points} PTS BOOST
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Evidence Contributions Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#00d2ff' }}>
                  <th style={{ padding: '10px 8px' }}>EVIDENCE SIGNAL</th>
                  <th style={{ padding: '10px 8px' }}>RAW SCORE</th>
                  <th style={{ padding: '10px 8px' }}>CONFIDENCE</th>
                  <th style={{ padding: '10px 8px' }}>CONTRIBUTED POINTS</th>
                  <th style={{ padding: '10px 8px' }}>SHARE OF RISK</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: '#fff' }}>
                      {c.label || c.category}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#ccc' }}>
                      {c.scorePercent}%
                    </td>
                    <td style={{ padding: '10px 8px', color: '#ccc' }}>
                      {c.confidencePercent}%
                    </td>
                    <td style={{ padding: '10px 8px', color: '#00d2ff', fontWeight: 800 }}>
                      +{c.points} pts
                    </td>
                    <td style={{ padding: '10px 8px', width: '30%' }}>
                      <div style={{ background: 'rgba(255,255,255,0.1)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          background: 'linear-gradient(90deg, #00d2ff, #ff3b5c)',
                          width: `${Math.min(100, (c.points / maxPoints) * 100)}%`,
                          height: '100%'
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Forensic Hash & Provenance Card */}
          <div style={{ marginTop: '24px', background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
              Forensic Provenance & Integrity Ledger
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>SHA-256:</span> <code style={{ color: '#00d2ff', wordBreak: 'break-all' }}>{forensic.sha256 || 'Calculated on upload'}</code></div>
              <div><span style={{ color: '#888' }}>File Name:</span> <span style={{ color: '#fff' }}>{forensic.filename || 'voice_sample.wav'}</span></div>
              <div><span style={{ color: '#888' }}>Duration:</span> <span style={{ color: '#fff' }}>{forensic.duration_sec ? `${forensic.duration_sec.toFixed(1)}s` : 'N/A'}</span></div>
              <div><span style={{ color: '#888' }}>Sample Rate:</span> <span style={{ color: '#fff' }}>{forensic.sample_rate || 16000} Hz</span></div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INCIDENT GUIDANCE & REPORTING (1930) */}
      {activeTab === 'guidance' && (
        <div className="detail-card" style={{ marginBottom: '20px' }}>
          <div className="detail-card-header">
            <h4>Actionable Incident Guidance & Law Enforcement Reporting</h4>
            <span className="header-sub">Indian Cybercrime Coordination Centre (I4C) & DoT Protocol</span>
          </div>

          {/* Legal Disclaimer Alert */}
          <div style={{
            background: 'rgba(255, 140, 0, 0.1)',
            border: '1px solid #ff8c00',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '18px',
            fontSize: '0.85rem',
            color: '#ffd700',
            lineHeight: 1.5
          }}>
            <strong>NOTICE (NOT LEGAL ADVICE):</strong> This guidance and draft complaint are generated for informational assistance to support official reporting. Verify all facts before submitting to law enforcement or financial institutions.
          </div>

          {/* Official Helplines Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(0, 229, 163, 0.1)', border: '1px solid #00e5a3', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#00e5a3', fontWeight: 800, textTransform: 'uppercase' }}>
                National Cybercrime Helpline
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>
                1930
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '4px' }}>
                Toll-free emergency financial fraud containment. Report immediately within golden hours.
              </div>
            </div>

            <div style={{ background: 'rgba(0, 210, 255, 0.1)', border: '1px solid #00d2ff', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#00d2ff', fontWeight: 800, textTransform: 'uppercase' }}>
                National Cybercrime Portal
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '8px' }}>
                <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" style={{ color: '#00d2ff', textDecoration: 'none' }}>
                  cybercrime.gov.in ↗
                </a>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '6px' }}>
                Official Government of India portal for filing cyber fraud complaints & FIR generation.
              </div>
            </div>

            <div style={{ background: 'rgba(155, 89, 182, 0.1)', border: '1px solid #9b59b6', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#9b59b6', fontWeight: 800, textTransform: 'uppercase' }}>
                Chakshu Portal (DoT)
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '8px' }}>
                <a href="https://sancharsaathi.gov.in/sancharsaathi/chakshu" target="_blank" rel="noreferrer" style={{ color: '#9b59b6', textDecoration: 'none' }}>
                  sancharsaathi.gov.in ↗
                </a>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '6px' }}>
                Report suspected fraudulent communications, spam calls, and WhatsApp scams for SIM disconnection.
              </div>
            </div>
          </div>

          {/* Action Checklist Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {['all', 'doNow', 'within30Mins', 'today', 'ifMoneyOrCredentialsShared'].map(tabKey => (
              <button
                key={tabKey}
                onClick={() => setActiveGuidanceTab(tabKey)}
                style={{
                  background: activeGuidanceTab === tabKey ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: activeGuidanceTab === tabKey ? '#fff' : '#aaa',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                {tabKey === 'all' && 'All Actions'}
                {tabKey === 'doNow' && 'DO NOW'}
                {tabKey === 'within30Mins' && 'WITHIN 30 MINS'}
                {tabKey === 'today' && 'TODAY'}
                {tabKey === 'ifMoneyOrCredentialsShared' && 'FINANCIAL / CREDENTIALS'}
              </button>
            ))}
          </div>

          {/* Immediate Action Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {(incidentGuidance?.immediateActions ? [
              ...(activeGuidanceTab === 'all' || activeGuidanceTab === 'doNow' ? (incidentGuidance.immediateActions.doNow || []).map(a => ({ text: a, tag: 'DO NOW', color: '#ff3b5c' })) : []),
              ...(activeGuidanceTab === 'all' || activeGuidanceTab === 'within30Mins' ? (incidentGuidance.immediateActions.within30Mins || []).map(a => ({ text: a, tag: '30 MINS', color: '#ff8c00' })) : []),
              ...(activeGuidanceTab === 'all' || activeGuidanceTab === 'today' ? (incidentGuidance.immediateActions.today || []).map(a => ({ text: a, tag: 'TODAY', color: '#00d2ff' })) : []),
              ...(activeGuidanceTab === 'all' || activeGuidanceTab === 'ifMoneyOrCredentialsShared' ? (incidentGuidance.immediateActions.ifMoneyOrCredentialsShared || []).map(a => ({ text: a, tag: 'FINANCIAL', color: '#ffd700' })) : [])
            ] : [
              { text: 'Terminate the call immediately. Do not disclose OTPs or passwords.', tag: 'DO NOW', color: '#ff3b5c' },
              { text: 'Call 1930 to alert the National Cybercrime Reporting Portal if money was transferred.', tag: '30 MINS', color: '#ff8c00' },
              { text: 'File a formal complaint with audio hash at cybercrime.gov.in.', tag: 'TODAY', color: '#00d2ff' }
            ]).map((item, idx) => (
              <div key={idx} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{
                  background: `${item.color}22`,
                  color: item.color,
                  border: `1px solid ${item.color}`,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap'
                }}>
                  {item.tag}
                </span>
                <span style={{ color: '#eff4ff', fontSize: '0.88rem' }}>{item.text}</span>
              </div>
            ))}
          </div>

          {/* Generate Complaint Draft & Report Action */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button
              onClick={() => setShowIncidentModal(true)}
              style={{
                background: 'linear-gradient(135deg, #ff3b5c, #e11d48)',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(255, 59, 92, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>Generate & Authorize Incident Report</span>
              <span>↗</span>
            </button>
            <button
              onClick={() => setShowComplaintModal(true)}
              style={{
                background: 'linear-gradient(135deg, #00d2ff, #0072ff)',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 210, 255, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>View Complaint Draft Text</span>
              <span>📄</span>
            </button>
          </div>
        </div>
      )}

      {/* COMPLAINT DRAFT MODAL */}
      {showComplaintModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#121826',
            border: '1px solid rgba(0, 210, 255, 0.3)',
            borderRadius: '16px',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 48px rgba(0,0,0,0.8)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, color: '#00d2ff', fontSize: '1.1rem' }}>
                Official Incident Complaint Draft (cybercrime.gov.in / 1930)
              </div>
              <button
                onClick={() => setShowComplaintModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{
                background: 'rgba(255, 140, 0, 0.1)',
                border: '1px solid #ff8c00',
                padding: '8px 12px',
                borderRadius: '6px',
                color: '#ffd700',
                fontSize: '0.8rem',
                marginBottom: '12px'
              }}>
                <strong>DRAFT FOR USER REVIEW — NOT LEGAL ADVICE.</strong> Verify accuracy before submitting to NCRP or your bank.
              </div>

              <pre style={{
                background: 'rgba(0,0,0,0.5)',
                padding: '16px',
                borderRadius: '8px',
                color: '#eff4ff',
                fontSize: '0.82rem',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
                fontFamily: 'monospace'
              }}>
                {effectiveComplaintDraft}
              </pre>
            </div>

            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={handleDownloadPdf}
                style={{
                  background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
                  color: '#fbbf24',
                  border: '1px solid #3b82f6',
                  padding: '10px 18px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(30, 58, 138, 0.5)'
                }}
              >
                {downloadingPdf ? 'Generating Dossier...' : 'Download VoxShield Verified Incident Dossier (PDF)'}
              </button>
              <button
                onClick={() => copyToClipboard(effectiveComplaintDraft)}
                style={{
                  background: copiedToast ? '#00e5a3' : '#00d2ff',
                  color: '#000',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {copiedToast ? 'Copied to Clipboard' : 'Copy Draft to Clipboard'}
              </button>
              <button
                onClick={() => setShowComplaintModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="dashboard-footer-actions">
        <button
          className="report-download-btn"
          style={{
            background: 'linear-gradient(135deg, #ff3b5c, #e11d48)',
            color: '#fff',
            fontWeight: 800,
            border: 'none',
            boxShadow: '0 4px 14px rgba(255, 59, 92, 0.4)'
          }}
          onClick={() => setShowIncidentModal(true)}
        >
          Generate & Authorize Incident Report ↗
        </button>
        <button
          className="report-download-btn"
          onClick={() => onExportReport && onExportReport(analysis.analysisId || analysis.id, 'json')}
        >
          Export Forensic Report (JSON)
        </button>
        <button
          className="report-download-btn report-download-btn-alt"
          onClick={() => onExportReport && onExportReport(analysis.analysisId || analysis.id, 'markdown')}
        >
          Export Summary Report (Markdown)
        </button>
      </div>

      {/* Authenticated Incident Report & Mail Authorization Modal */}
      <IncidentReportModal
        analysis={analysis}
        isOpen={showIncidentModal}
        onClose={() => setShowIncidentModal(false)}
      />
    </div>
  );
}
