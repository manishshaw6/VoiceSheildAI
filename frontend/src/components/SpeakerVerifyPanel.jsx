import React, { useState } from 'react';

export default function SpeakerVerifyPanel({ enrolledSpeakers, onRefreshProfiles }) {
  const [speakerId, setSpeakerId] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [enrollFile, setEnrollFile] = useState(null);
  const [enrollStatus, setEnrollStatus] = useState('');

  const [verifySpeakerId, setVerifySpeakerId] = useState('');
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    if (!speakerId.trim() || !speakerName.trim() || !enrollFile) {
      setEnrollStatus('Please provide Speaker ID, Name, and an audio sample.');
      return;
    }

    const formData = new FormData();
    formData.append('speakerId', speakerId.trim());
    formData.append('name', speakerName.trim());
    formData.append('audio', enrollFile);

    try {
      setEnrollStatus('Generating acoustic embedding & enrolling profile...');
      const res = await fetch('/api/speaker/enroll', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrollment failed');

      setEnrollStatus(`✅ Successfully enrolled ${data.name} (${data.speakerId}) with 80-dim acoustic profile!`);
      setSpeakerId('');
      setSpeakerName('');
      setEnrollFile(null);
      if (onRefreshProfiles) onRefreshProfiles();
    } catch (err) {
      setEnrollStatus(`❌ Enrollment error: ${err.message}`);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!verifyFile) {
      setVerifyError('Please select a suspect audio sample to verify.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', verifyFile);
    if (verifySpeakerId) {
      formData.append('speakerId', verifySpeakerId);
    }

    setIsVerifying(true);
    setVerifyError('');
    setVerifyResult(null);

    try {
      const res = await fetch('/api/speaker/verify', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setVerifyResult(data);
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="speaker-panel-container">
      <div className="speaker-header">
        <div className="analyzer-badge">VOICE IDENTITY & CLONE GUARD</div>
        <h3>Speaker Verification & Impersonation Defense</h3>
        <p>
          Enforce biometric speaker verification to distinguish between authorized speakers and impostors.
          <strong> Note:</strong> Speaker verification validates identity, while deepfake detection validates authenticity.
        </p>
      </div>

      <div className="speaker-split-grid">
        {/* Left: Enrollment Form */}
        <div className="speaker-card">
          <div className="card-header-with-icon">
            <span className="icon-badge">👤+</span>
            <h4>Enroll Authorized Identity</h4>
          </div>
          <p className="card-desc">Record or upload a clean 5-10s reference audio sample to build an acoustic biometric embedding.</p>

          <form onSubmit={handleEnrollSubmit} className="speaker-form">
            <div className="form-group">
              <label>Speaker Unique ID (e.g. alex_ceo):</label>
              <input
                type="text"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
                placeholder="e.g. john_doe"
                className="text-input"
                required
              />
            </div>

            <div className="form-group">
              <label>Full Display Name:</label>
              <input
                type="text"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="e.g. John Doe (Chief Financial Officer)"
                className="text-input"
                required
              />
            </div>

            <div className="form-group">
              <label>Reference Audio Sample:</label>
              <input
                type="file"
                accept=".wav,.mp3,.m4a,.webm,.ogg"
                onChange={(e) => setEnrollFile(e.target.files[0])}
                className="file-input"
                required
              />
            </div>

            <button type="submit" className="action-btn-primary">
              💾 Register Speaker Profile
            </button>

            {enrollStatus && (
              <div className="form-status-msg">{enrollStatus}</div>
            )}
          </form>

          {/* Enrolled Profiles List */}
          <div className="enrolled-list-box">
            <h5>Currently Enrolled Identities ({enrolledSpeakers.length})</h5>
            {enrolledSpeakers.length === 0 ? (
              <div className="empty-subtext">No speakers enrolled yet. Enroll your first reference voice above.</div>
            ) : (
              <ul className="enrolled-chips">
                {enrolledSpeakers.map(spk => (
                  <li key={spk.speaker_id} className="enrolled-chip">
                    <span className="chip-name">{spk.name}</span>
                    <span className="chip-id">@{spk.speaker_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Verification Form */}
        <div className="speaker-card">
          <div className="card-header-with-icon">
            <span className="icon-badge">🔍</span>
            <h4>Verify Suspect Audio</h4>
          </div>
          <p className="card-desc">Compare incoming suspect audio against enrolled identities to detect voice mismatch or impersonation.</p>

          <form onSubmit={handleVerifySubmit} className="speaker-form">
            <div className="form-group">
              <label>Target Identity to Verify Against (Optional):</label>
              <select
                value={verifySpeakerId}
                onChange={(e) => setVerifySpeakerId(e.target.value)}
                className="speaker-dropdown"
              >
                <option value="">-- Match against all enrolled identities --</option>
                {enrolledSpeakers.map(spk => (
                  <option key={spk.speaker_id} value={spk.speaker_id}>
                    {spk.name} ({spk.speaker_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Suspect Audio Recording:</label>
              <input
                type="file"
                accept=".wav,.mp3,.m4a,.webm,.ogg"
                onChange={(e) => setVerifyFile(e.target.files[0])}
                className="file-input"
                required
              />
            </div>

            <button type="submit" className="action-btn-primary" disabled={isVerifying}>
              {isVerifying ? 'Comparing Acoustic Vectors...' : '🔎 Run Biometric Verification'}
            </button>

            {verifyError && <div className="error-banner">⚠️ {verifyError}</div>}
          </form>

          {verifyResult && (
            <div className={`verification-result-box ${verifyResult.match ? 'match-ok' : 'mismatch-alert'}`}>
              <div className="result-status-title">
                {verifyResult.match ? '✅ VERIFIED SPEAKER MATCH' : '❌ SPEAKER IDENTITY MISMATCH'}
              </div>
              <div className="result-metric-grid">
                <div>
                  <span className="label">Identity Target:</span>
                  <strong>{verifyResult.speakerName || 'Best Match Candidate'}</strong>
                </div>
                <div>
                  <span className="label">Acoustic Similarity:</span>
                  <strong className="score-val">{Math.round((verifyResult.similarity || 0) * 100)}%</strong>
                </div>
                <div>
                  <span className="label">Verification Threshold:</span>
                  <strong>{Math.round((verifyResult.threshold || 0.7) * 100)}%</strong>
                </div>
                <div>
                  <span className="label">Confidence:</span>
                  <strong>{Math.round((verifyResult.confidence || 0.8) * 100)}%</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
