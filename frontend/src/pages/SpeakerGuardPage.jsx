import React, { useState, useEffect } from 'react';
import SpeakerVerifyPanel from '../components/SpeakerVerifyPanel';

export default function SpeakerGuardPage() {
  const [enrolledSpeakers, setEnrolledSpeakers] = useState([]);

  const fetchSpeakers = async () => {
    try {
      const res = await fetch('/api/speaker/profiles');
      const data = await res.json();
      if (data.success) setEnrolledSpeakers(data.profiles || []);
    } catch (_) {}
  };

  useEffect(() => {
    fetchSpeakers();
  }, []);

  return (
    <div className="page-view-wrapper">
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Voice ID & Clone Guard</span>
        </div>
        <h2>Biometric Voice Identity & Clone Detection</h2>
        <p>
          Register authorized voice biometric profiles (80-dimensional acoustic feature embeddings) and cross-verify suspect audio samples to detect impersonation.
        </p>
      </div>

      <div className="speaker-guard-layout">
        <SpeakerVerifyPanel
          enrolledSpeakers={enrolledSpeakers}
          onRefreshProfiles={fetchSpeakers}
        />
      </div>
    </div>
  );
}
