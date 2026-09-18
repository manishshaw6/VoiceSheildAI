import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LiveStreamMonitor from '../components/LiveStreamMonitor';
import SecurityDashboard from '../components/SecurityDashboard';

export default function LiveShieldPage({ onExportReport }) {
  const [enrolledSpeakers, setEnrolledSpeakers] = useState([]);
  const [postCallAnalysis, setPostCallAnalysis] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/speaker/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) setEnrolledSpeakers(data.profiles || []);
      })
      .catch(() => {});
  }, []);

  const handleSessionComplete = async (sessionData) => {
    if (sessionData?.analysis) {
      setPostCallAnalysis({
        ...sessionData.analysis,
        analysisId: sessionData.sessionId || sessionData.analysis.analysisId,
        final_score: sessionData.finalScore ?? sessionData.analysis.risk?.score,
        risk_level: sessionData.finalLevel ?? sessionData.analysis.risk?.level,
      });
      setTimeout(() => {
        const el = document.getElementById('post-call-dossier-panel');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else if (sessionData?.sessionId) {
      try {
        const res = await fetch(`/api/history/${sessionData.sessionId}`);
        const data = await res.json();
        if (data.success && data.analysis) {
          const raw = data.analysis.raw_result || {};
          setPostCallAnalysis({
            ...raw,
            analysisId: data.analysis.id,
            final_score: data.analysis.final_score,
            risk_level: data.analysis.risk_level,
            transcript: data.analysis.transcript,
            indicators: data.analysis.indicators || []
          });
          setTimeout(() => {
            const el = document.getElementById('post-call-dossier-panel');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        }
      } catch (_) {}
    }
  };

  return (
    <div className="page-view-wrapper">
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Live Call Shield</span>
        </div>
        <h2>Near-Real-Time Live Call Interceptor</h2>
        <p>Continuous WebSocket stream monitoring speech for credential harvesting, pressure tactics, and synthetic acoustic manipulation.</p>
      </div>

      <div className="live-shield-layout">
        <LiveStreamMonitor
          enrolledSpeakers={enrolledSpeakers}
          onSessionComplete={handleSessionComplete}
        />

        {postCallAnalysis && (
          <div id="post-call-dossier-panel" className="post-call-dossier-container" style={{ marginTop: '28px' }}>
            <div className="inspector-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '8px 8px 0 0'
            }}>
              <div>
                <div className="analyzer-badge" style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid #3b82f6',
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '1px'
                }}>
                  POST-CALL FORENSIC INTELLIGENCE DOSSIER
                </div>
                <h3 style={{ margin: '6px 0 0', color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>
                  Live Call Forensic Record: {postCallAnalysis.analysisId || 'Current Session'}
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                  onClick={() => setPostCallAnalysis(null)}
                >
                  ✕ Dismiss Dossier
                </button>
                <button
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 229, 163, 0.4)',
                    background: 'rgba(0, 229, 163, 0.15)',
                    color: '#00e5a3',
                    cursor: 'pointer'
                  }}
                  onClick={() => navigate('/history')}
                >
                  View in Audit Vault
                </button>
              </div>
            </div>

            <SecurityDashboard
              analysis={postCallAnalysis}
              onExportReport={onExportReport}
            />
          </div>
        )}
      </div>
    </div>
  );
}
