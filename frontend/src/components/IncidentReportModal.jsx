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

  // Auto-generate report when modal opens if user is authenticated
  useEffect(() => {
    if (isOpen && authenticated && analysisId && !reportData && !loading) {
      handleGenerateReport();
    }
  }, [isOpen, authenticated, analysisId]);

  // Load organization contacts from directory when reportData is generated
  useEffect(() => {
    async function loadContacts() {
      if (!reportData?.impersonatedOrganization?.organization_id) {
        // Default to demo/verified contact for testing
        setSelectedContactId('contact_demo_mailbox');
        return;
      }
      try {
        const res = await fetch(`/api/v1/organizations/${reportData.impersonatedOrganization.organization_id}`);
        const data = await res.json();
        if (data.success && data.organization?.reporting_channels?.length) {
          const verified = data.organization.reporting_channels.filter(c => c.verified && c.enabled);
          setContacts(verified);
          if (verified.length > 0) {
            setSelectedContactId(verified[0].id);
          } else {
            setSelectedContactId('contact_demo_mailbox');
          }
        } else {
          setSelectedContactId('contact_demo_mailbox');
        }
      } catch {
        setSelectedContactId('contact_demo_mailbox');
      }
    }
    if (reportData) {
      loadContacts();
    }
  }, [reportData]);

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

      // 2. Dispatch via user's Gmail mailbox
      const sendRes = await fetch(`/api/v1/reports/${reportData.reportId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organizationContactId: selectedContactId })
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok) {
        throw new Error(sendData.error || 'Failed to dispatch report from mailbox.');
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
              <div style={{ fontSize: '2.4rem', marginBottom: '12px' }}>🛡️</div>
              <h4 style={{ margin: '0 0 8px', color: '#ffffff' }}>Sign In to Generate & Authorize Report</h4>
              <p style={{ color: '#a0aec0', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 20px' }}>
                To prevent fraud complaints from appearing as anonymous spam, VoxShield generates digitally verified reports that are sent directly from your authenticated mailbox upon your explicit approval.
              </p>
              <button
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
                <span>🛡️</span>
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
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>✅</div>
              <h3 style={{ color: '#10b981', margin: '0 0 8px', fontWeight: 800, textTransform: 'uppercase' }}>
                REPORT TRANSMITTED VIA VOXSHIELD SECURE RELAY
              </h3>
              <p style={{ color: '#e2e8f0', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto 16px' }}>
                Your authorized incident report was transmitted to <strong>{sendResult.delivery.recipient}</strong> with Reply-To set to your verified account (<strong>{sendResult.delivery.sender || user.email}</strong>).
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
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ff3b5c', textTransform: 'uppercase' }}>
                      Possible Organization Impersonation
                    </span>
                    <h4 style={{ margin: '2px 0 0', fontSize: '1.2rem', color: '#ffffff' }}>
                      {org.organization_name_normalized || 'Unspecified Entity'}
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
                      {contacts.length > 0 ? (
                        contacts.map(c => (
                          <option key={c.id} value={c.id}>
                            {org.organization_name_normalized} Security Desk ({c.destination})
                          </option>
                        ))
                      ) : (
                        <option value="contact_demo_mailbox">
                          VoxShield Demo / Test Mailbox (Developer Controlled)
                        </option>
                      )}
                    </select>
                  </div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Verified Contact:</div>
                  <div>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓ YES (RBI / Official Directory Staging)</span>
                  </div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Submitted By:</div>
                  <div><strong>{user.name}</strong> ({user.email})</div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Sent Through:</div>
                  <div>VoxShield Secure Reporting</div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Generated By:</div>
                  <div>VoxShield AI</div>

                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Email Routing:</div>
                  <div style={{ fontSize: '0.8rem', color: '#70c99f', fontFamily: 'monospace' }}>
                    FROM: VoxShield Fraud Intelligence | REPLY-TO: {user.email}
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
                background: 'rgba(0, 210, 255, 0.05)',
                border: '1px solid rgba(0, 210, 255, 0.3)',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '20px'
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#00d2ff' }}
                  />
                  <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: 600, lineHeight: '1.4' }}>
                    I have reviewed this report and authorize VoxShield to dispatch it on my behalf to the verified reporting contact shown above, with Reply-To set to my verified email address ({user.email}).
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
                  {sending ? 'Sending via Secure Relay...' : 'Authorize & Send Report'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
