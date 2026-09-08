import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LiveStreamMonitor from '../components/LiveStreamMonitor';

export default function LiveShieldPage() {
  const [enrolledSpeakers, setEnrolledSpeakers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/speaker/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) setEnrolledSpeakers(data.profiles || []);
      })
      .catch(() => {});
  }, []);

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
          onSessionComplete={(session) => {
            // Navigate to Audit Vault after live session concludes
            navigate('/history');
          }}
        />
      </div>
    </div>
  );
}
