import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function IncidentReportModal({ analysis, isOpen, onClose }) {
  const { user, authenticated, mailStatus, openAuthModal, saveMailPassword } = useAuth();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [appPasswordInput, setAppPasswordInput] = useState('');
  const [savingAppPass, setSavingAppPass] = useState(false);

  const analysisId = analysis?.analysisId || analysis?.id;

  // Detect which supported banks (SBI / HDFC / Kotak) were identified in the analysis / transcript
  const orgDetectedId = reportData?.impersonatedOrganization?.organization_id || analysis?.organization?.organization_id;
  const transcriptText = `${reportData?.transcriptExcerpt || ''} ${analysis?.transcript || ''} ${analysis?.transcription?.text || ''} ${analysis?.conversationIntelligence?.summary?.detailed_summary || ''}`;

  const isSbiDetected = orgDetectedId === 'org_sbi' || /\b(sbi|state bank of india|state bank|yono)\b/i.test(transcriptText);
  const isHdfcDetected = orgDetectedId === 'org_hdfc' || /\b(hdfc|hdfc bank)\b/i.test(transcriptText);
  const isKotakDetected = orgDetectedId === 'org_kotak' || /\b(kotak|kotak mahindra|kotak bank|kotak 811)\b/i.test(transcriptText);
  const isBankDetected = isSbiDetected || isHdfcDetected || isKotakDetected;

  const detectedBankNamesList = [
    isSbiDetected && 'State Bank of India (SBI)',
    isHdfcDetected && 'HDFC Bank',
    isKotakDetected && 'Kotak Mahindra Bank'
  ].filter(Boolean);

  const detectedBankName = detectedBankNamesList.join(' & ') || null;

  // Auto-generate report when modal opens if user is authenticated
  useEffect(() => {
    if (isOpen && authenticated && analysisId && !reportData && !loading) {
      handleGenerateReport();
    }
  }, [isOpen, authenticated, analysisId]);

  // Load organization contacts from directory when reportData is generated
  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await fetch('/api/v1/organizations');
        const data = await res.json();
        const allContacts = [];
        if (data.organizations?.length) {
          for (const o of data.organizations) {
            if (o.reporting_channels?.length) {
              for (const c of o.reporting_channels) {
                if (c.verified && c.enabled) {
                  allContacts.push({
                    ...c,
                    orgName: o.display_name,
                    orgId: o.id
                  });
                }
              }
            }
          }
        }

        // STRICT FILTER: Only include contacts for detected banks (SBI, HDFC, and/or Kotak)
        const filteredContacts = allContacts.filter(c => {
          if (isSbiDetected && c.orgId === 'org_sbi') return true;
          if (isHdfcDetected && c.orgId === 'org_hdfc') return true;
          if (isKotakDetected && c.orgId === 'org_kotak') return true;
          return false;
        });

        setContacts(filteredContacts);

        if (filteredContacts.length > 0) {
          if (isKotakDetected && !isSbiDetected && !isHdfcDetected) {
            const kotakMatch = filteredContacts.find(c => c.orgId === 'org_kotak');
            setSelectedContactId(kotakMatch ? kotakMatch.id : filteredContacts[0].id);
          } else if (isSbiDetected && !isHdfcDetected && !isKotakDetected) {
            const sbiMatch = filteredContacts.find(c => c.orgId === 'org_sbi');
            setSelectedContactId(sbiMatch ? sbiMatch.id : filteredContacts[0].id);
          } else if (isHdfcDetected && !isSbiDetected && !isKotakDetected) {
            const hdfcMatch = filteredContacts.find(c => c.orgId === 'org_hdfc');
            setSelectedContactId(hdfcMatch ? hdfcMatch.id : filteredContacts[0].id);
          } else {
            setSelectedContactId(filteredContacts[0].id);
          }
        } else {
          setSelectedContactId('');
        }
      } catch (err) {
        console.error('[IncidentReportModal] Failed to load directory contacts:', err);
      }
    }
    if (reportData) {
      loadContacts();
    }
  }, [reportData, isSbiDetected, isHdfcDetected, isKotakDetected]);

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ analysisId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate incident report.');
      }
      setReportData(data.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReport = async () => {
    if (!consentChecked) {
      alert('Please check the authorization box to confirm your explicit consent.');
      return;
    }
    if (!selectedContactId) {
      alert('Please select a verified reporting contact destination.');
      return;
    }

    try {
      setSending(true);
      setError(null);

      // 1. Approve report with explicit consent
      const apprRes = await fetch(`/api/v1/reports/${reportData.reportId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ consentGiven: true })
      });
      if (!apprRes.ok) {
        const apprErr = await apprRes.json();
        throw new Error(apprErr.error || 'Failed to record user approval.');
      }

      // 2. Dispatch through the VoxShield SendGrid relay
      const sendRes = await fetch(`/api/v1/reports/${reportData.reportId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organizationContactId: selectedContactId })
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok) {
        throw new Error(sendData.error || 'Report created successfully, but email delivery could not be completed.');
      }

      setSendResult(sendData);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!reportData?.reportId) return;
    window.open(`/api/v1/reports/${reportData.reportId}/pdf`, '_blank');
  };

  if (!isOpen) return null;

  const org = reportData?.impersonatedOrganization || analysis?.organization || {};
  const risk = reportData?.riskAssessment || analysis?.risk || {};
  const eligibility = reportData?.eligibility || analysis?.reportingEligibility || {};

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 10, 20, 0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: '#0d1527',
        border: '1px solid rgba(0, 210, 255, 0.3)',
        borderRadius: '16px',
        maxWidth: '820px',
        width: '100%',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        color: '#e2e8f0',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0b1d3a, #162a4d)',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(0, 210, 255, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#00d2ff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              VoxShield Voice Fraud Intelligence
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', color: '#ffffff', fontWeight: 800 }}>
              Digitally Verified Incident Reporting Service
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a0aec0',
              fontSize: '1.4rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#fca5a5',
              marginBottom: '16px',
              fontSize: '0.88rem'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* STEP 1: AUTHENTICATION GATE */}
          {!authenticated ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 20px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '12px',
              border: '1px dashed rgba(0, 210, 255, 0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h4 style={{ margin: '0 0 8px', color: '#ffffff' }}>Sign In to Generate & Authorize Report</h4>
              <p style={{ color: '#a0aec0', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 20px' }}>
                To prevent fraud complaints from appearing as anonymous spam, VoxShield sends digitally verified reports through its secure relay only after your explicit approval.
              </p>
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                style={{
                  background: 'linear-gradient(135deg, #00d2ff, #0072ff)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 26px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 18px rgba(0, 210, 255, 0.35)'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Sign In / Register Account
              </button>
            </div>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '50px 20px' }}>
              <div className="status-dot-pulse" style={{ margin: '0 auto 16px', width: '18px', height: '18px' }}></div>
              <p style={{ color: '#00d2ff', fontWeight: 600 }}>Synthesizing multi-signal evidence and redacting sensitive entities...</p>
            </div>
          ) : sendResult ? (
            /* DISPATCH SUCCESS STATE */
            <div style={{
              textAlign: 'center',
              padding: '30px 20px',
              background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: '12px',
              border: '1px solid #10b981'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h3 style={{ color: '#10b981', margin: '0 0 8px', fontWeight: 800, textTransform: 'uppercase' }}>
                REPORT TRANSMITTED VIA VOXSHIELD SECURE RELAY
              </h3>
              <p style={{ color: '#e2e8f0', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto 16px' }}>
                Your authorized incident report was transmitted to <strong>{sendResult.delivery.recipient}</strong> through VoxShield Secure Email Relay. Reply-To is set to your verified account (<strong>{sendResult.delivery.replyTo || user.email}</strong>).
              </p>
              <div style={{
                background: 'rgba(0,0,0,0.4)',
                padding: '14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                maxWidth: '520px',
                margin: '0 auto 20px',
                textAlign: 'left'
              }}>
                <div><strong>Message Reference:</strong> {sendResult.delivery.messageId}</div>
                <div><strong>Report ID:</strong> {sendResult.reportId}</div>
                <div><strong>Timestamp:</strong> {sendResult.delivery.sentAt}</div>
                <div><strong>Channel:</strong> VoxShield Secure Relay (Verified Dispatch)</div>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', maxWidth: '520px', margin: '0 auto 24px' }}>
                This confirms delivery dispatch from VoxShield Secure Relay; it does not constitute bank acknowledgment, police FIR, or legal advice.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={handleDownloadPdf}
                  style={{
                    background: '#1e293b',
                    color: '#fbbf24',
                    border: '1px solid #fbbf24',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Download Attached PDF
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: '#10b981',
                    color: '#000000',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : reportData ? (
            /* REPORT PREVIEW & CONSENT */
            <div>
              {/* Threat Overview Banner */}
              <div style={{
                background: 'rgba(255, 59, 92, 0.1)',
                border: '1px solid #ff3b5c',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ff3b5c', textTransform: 'uppercase' }}>
                      Possible Organization Impersonation
                    </span>
                    <h4 style={{ margin: '2px 0 0', fontSize: '1.2rem', color: '#ffffff' }}>
                      {org.organization_name_normalized || (isBankDetected ? detectedBankName : 'Unspecified Entity')}
                    </h4>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      background: risk.level === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                      color: '#000',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontWeight: 900,
                      fontSize: '0.8rem'
                    }}>
                      {risk.level} RISK ({risk.score}/100)
                    </span>
                  </div>
                </div>

                {eligibility.reasons?.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 59, 92, 0.2)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffd700', marginBottom: '4px' }}>
                      WHY THIS IS REPORTABLE:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#f1f5f9' }}>
                      {eligibility.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Bank Detection Enforcement Status Box */}
              {isBankDetected ? (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  borderRadius: '8px',
                  padding: '14px 18px',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                  <div>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.92rem', marginBottom: '2px' }}>
                      VERIFIED BANK DETECTED: {detectedBankName}
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: '1.4' }}>
                      VoiceShieldAI detected specific evidence for <strong>{detectedBankName}</strong>. Verified reporting channel unlocked for official incident dispatch.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  borderRadius: '8px',
                  padding: '14px 18px',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <div>
                    <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.92rem', marginBottom: '2px' }}>
                      NO SUPPORTED BANK (SBI / HDFC / KOTAK) DETECTED IN AUDIO
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: '1.4' }}>
                      Official bank dispatch is locked. Sending reports to banks is strictly permitted <strong>only when SBI, HDFC, or Kotak Bank</strong> is detected in the call interaction evidence.
                    </div>
                  </div>
                </div>
              )}

              {/* Delivery Metadata Grid */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                fontSize: '0.88rem'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px', alignItems: 'center' }}>
                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Reporting To:</div>
                  <div>
                    {isBankDetected && contacts.length > 0 ? (
                      <select
                        value={selectedContactId}
                        onChange={(e) => setSelectedContactId(e.target.value)}
                        style={{
                          background: '#1e293b',
                          color: '#ffffff',
                          border: '1px solid rgba(0, 210, 255, 0.4)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          width: '100%',
                          maxWidth: '420px'
                        }}
                      >
                        {contacts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.orgName} Security Desk ({c.destination})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px dashed rgba(239, 68, 68, 0.4)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        color: '#f87171'
                      }}>
                        [LOCKED] No Supported Bank (SBI/HDFC/Kotak) Detected — Destination Gated
                      </div>
                    )}
                  </div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Verified Contact:</div>
                  <div>
                    {isBankDetected ? (
                      <span style={{ color: '#10b981', fontWeight: 800 }}>VERIFIED (Official Banking Intelligence Directory)</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>N/A (No bank detected)</span>
                    )}
                  </div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Submitted By:</div>
                  <div><strong>{user.name}</strong> ({user.email})</div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Sent Through:</div>
                  <div>VoxShield Secure Email Relay</div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Generated By:</div>
                  <div>VoxShield AI</div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Email Routing:</div>
                  <div style={{ fontSize: '0.8rem', color: '#70c99f', fontFamily: 'monospace' }}>
                    FROM: VoxShield Fraud Intelligence | REPLY-TO: authenticated reporter ({user.email})
                  </div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Report ID:</div>
                  <div><code style={{ color: '#00d2ff' }}>{reportData.reportId}</code></div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Cryptographic Hash:</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', wordBreak: 'break-all' }}>
                    {reportData.integrityInformation?.reportHash}
                  </div>
                </div>
              </div>

              {/* Redacted Evidence Preview */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#00d2ff', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Redacted Evidence Preview (PII, OTPs & Credentials Sanitized):
                </div>
                <div style={{
                  background: '#070d19',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '0.82rem',
                  color: '#cbd5e1',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  fontStyle: 'italic',
                  lineHeight: '1.5'
                }}>
                  "{reportData.transcriptExcerpt || 'No transcript text.'}"
                </div>
              </div>

              {/* Transparency Notice */}
              <div style={{
                background: 'rgba(255, 140, 0, 0.08)',
                border: '1px solid #ff8c00',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#fed7aa',
                fontSize: '0.8rem',
                marginBottom: '20px',
                lineHeight: '1.4'
              }}>
                <strong>VOXSHIELD DIGITALLY VERIFIED INCIDENT REPORT:</strong> This report confirms that VoxShield conducted a multi-signal forensic analysis and that the payload matches our recorded cryptographic integrity hash. It does not represent a law-enforcement certification, police FIR, or legal opinion.
              </div>

              {/* Explicit User Consent Checkbox */}
              <div style={{
                background: isBankDetected ? 'rgba(0, 210, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                border: isBankDetected ? '1px solid rgba(0, 210, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '20px',
                opacity: isBankDetected ? 1 : 0.55
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: isBankDetected ? 'pointer' : 'not-allowed' }}>
                  <input
                    type="checkbox"
                    disabled={!isBankDetected}
                    checked={consentChecked}
                    onChange={(e) => isBankDetected && setConsentChecked(e.target.checked)}
                    style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#00d2ff', cursor: isBankDetected ? 'pointer' : 'not-allowed' }}
                  />
                  <span style={{ fontSize: '0.88rem', color: isBankDetected ? '#ffffff' : '#94a3b8', fontWeight: 600, lineHeight: '1.4' }}>
                    {isBankDetected
                      ? `I have reviewed this report and authorize VoxShield to dispatch it through the secure email relay to the verified ${detectedBankName} Security Desk, with Reply-To set to my verified email address (${user.email}).`
                      : `Dispatch authorization locked: SBI, HDFC, or Kotak Bank must be detected in the call audio/transcript before sending to bank is enabled.`}
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleDownloadPdf}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#fbbf24',
                      border: '1px solid #fbbf24',
                      padding: '10px 18px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    Download PDF Report
                  </button>
                  <a
                    href={`/reports/${reportData.reportId}/verify`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'transparent',
                      color: '#00d2ff',
                      border: '1px solid #00d2ff',
                      padding: '10px 16px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                  >
                    Verify Certificate ↗
                  </a>
                </div>

                {isBankDetected ? (
                  <button
                    onClick={handleSendReport}
                    disabled={!consentChecked || sending}
                    style={{
                      background: consentChecked && !sending ? 'linear-gradient(135deg, #00d2ff, #0072ff)' : '#334155',
                      color: consentChecked && !sending ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      padding: '12px 28px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      cursor: consentChecked && !sending ? 'pointer' : 'not-allowed',
                      boxShadow: consentChecked && !sending ? '0 4px 16px rgba(0, 210, 255, 0.4)' : 'none'
                    }}
                  >
                    {sending ? 'Sending via Secure Relay...' : `Authorize & Send Report to ${detectedBankName}`}
                  </button>
                ) : (
                  <button
                    disabled
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#64748b',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'not-allowed'
                    }}
                  >
                    [LOCKED] Send Option Locked (No SBI/HDFC/Kotak Detected)
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
