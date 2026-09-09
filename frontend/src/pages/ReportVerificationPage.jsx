import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function ReportVerificationPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function verify() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/reports/${id}/verify`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (id) verify();
  }, [id]);

  return (
    <div className="container-pro" style={{ padding: '60px 20px', maxWidth: '780px', margin: '0 auto' }}>
      <div style={{
        background: '#0e1628',
        border: '1px solid rgba(0, 210, 255, 0.3)',
        borderRadius: '16px',
        padding: '36px',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
        color: '#e2e8f0'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '20px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#00d2ff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
            VoxShield AI Voice Fraud Intelligence
          </div>
          <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.6rem', fontWeight: 800 }}>
            DIGITALLY VERIFIED INCIDENT REPORT
          </h2>
          <div style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: '6px' }}>
            Cryptographic Authenticity & Evidence Integrity Verification
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="status-dot-pulse" style={{ margin: '0 auto 16px' }}></div>
            <p style={{ color: '#00d2ff' }}>Checking cryptographic record on VoxShield Registry...</p>
          </div>
        ) : error ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', padding: '16px', color: '#fca5a5', textAlign: 'center' }}>
            Verification query failed: {error}
          </div>
        ) : data ? (
          <div>
            {/* Status Card */}
            <div style={{
              background: data.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${data.valid ? '#10b981' : '#ef4444'}`,
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'center',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '6px' }}>
                {data.valid ? '🛡️' : '⚠️'}
              </div>
              <h3 style={{ margin: 0, color: data.valid ? '#10b981' : '#ef4444', fontWeight: 800 }}>
                INTEGRITY STATUS: {data.integrity_status}
              </h3>
              <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#cbd5e1' }}>
                {data.valid
                  ? 'Cryptographic verification confirms this report was issued by VoxShield and matches the recorded hash.'
                  : 'This report does not match the recorded hash or was not found.'}
              </p>
            </div>

            {/* Details Grid */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '18px 24px',
              marginBottom: '24px',
              fontSize: '0.9rem',
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: '10px'
            }}>
              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Report ID:</div>
              <div><strong style={{ color: '#00d2ff' }}>{data.report_id}</strong></div>

              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Issuer:</div>
              <div>{data.issuer || 'VoxShield'}</div>

              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Generated Timestamp:</div>
              <div>{data.generated_at ? new Date(data.generated_at).toUTCString() : 'N/A'}</div>

              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Target Organization:</div>
              <div><strong>{data.organization || 'Unspecified'}</strong></div>

              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Risk Evaluation:</div>
              <div>
                <span style={{
                  color: data.risk_level === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                  fontWeight: 800
                }}>
                  {data.risk_level} {data.risk_score != null ? `(${data.risk_score}/100)` : ''}
                </span>
              </div>

              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Government Certification:</div>
              <div>
                <span style={{ color: '#94a3b8' }}>None (Independent Technical Analysis)</span>
              </div>
            </div>

            {/* Explanatory Legal Notice */}
            <div style={{
              background: 'rgba(255, 140, 0, 0.08)',
              border: '1px solid #ff8c00',
              borderRadius: '8px',
              padding: '14px 18px',
              color: '#fed7aa',
              fontSize: '0.84rem',
              lineHeight: '1.5',
              marginBottom: '28px'
            }}>
              <strong>LEGAL NOTICE:</strong> {data.explanation}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
              <a
                href={`/api/v1/reports/${data.report_id}/pdf`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'linear-gradient(135deg, #00d2ff, #0072ff)',
                  color: '#ffffff',
                  padding: '10px 22px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontSize: '0.9rem'
                }}
              >
                Download Verified PDF
              </a>
              <Link
                to="/scanner"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontSize: '0.9rem'
                }}
              >
                Return to Threat Scanner
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
