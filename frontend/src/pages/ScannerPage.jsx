import React, { useState, useEffect } from 'react';
import AudioAnalyzer from '../components/AudioAnalyzer';
import SecurityDashboard from '../components/SecurityDashboard';

export default function ScannerPage({ onExportReport }) {
  const [analysis, setAnalysis] = useState(null);
  const [enrolledSpeakers, setEnrolledSpeakers] = useState([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState('');

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

  const handleExport = (id) => {
    if (onExportReport) {
      onExportReport(id);
    }
  };

  return (
    <div className="page-view-wrapper">
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Forensic Threat Scanner</span>
        </div>
        <h2>Forensic Voice Threat & Deepfake Scanner</h2>
        <p>Analyze uploaded audio files or microphone captures through the multi-engine intelligence pipeline.</p>
      </div>

      <div className="scanner-layout">
        {/* Upload & Mic Controller */}
        <AudioAnalyzer
          onAnalysisComplete={(res) => setAnalysis(res)}
          onAnalysisReset={() => setAnalysis(null)}
          enrolledSpeakers={enrolledSpeakers}
          selectedSpeakerId={activeSpeakerId}
        />

        {/* Forensic Security Dashboard */}
        <div className="dashboard-results-container">
          <SecurityDashboard
            analysis={analysis}
            onExportReport={handleExport}
          />
        </div>
      </div>
    </div>
  );
}
