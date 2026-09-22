import React, { useState, useEffect } from 'react';
import GuardianHUD from '../components/GuardianHUD';
import { enrollOfflineContact, listOfflineContacts, deleteOfflineContact } from '../services/offlineBiometricVault';
import { loadAndDecryptIncidents, deleteVaultIncident, purgeAllVaultIncidents } from '../services/encryptedIncidentVault';
import { offlineSyncManager } from '../services/offlineSyncManager';
import Section65BCertificateModal from '../components/Section65BCertificateModal';

export default function GuardianOfflinePage() {
  const [incidents, setIncidents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState('');
  const [enrollFile, setEnrollFile] = useState(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Evidence Dossier Modal
  const [selectedCertIncident, setSelectedCertIncident] = useState(null);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);

  const refreshVault = async () => {
    try {
      const data = await loadAndDecryptIncidents();
      setIncidents(data);
    } catch (_) {}
  };

  const refreshContacts = async () => {
    try {
      const list = await listOfflineContacts();
      setContacts(list);
    } catch (_) {}
  };

  useEffect(() => {
    refreshVault();
    refreshContacts();
  }, []);

  // Handle enrollment of a new trusted voice
  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !enrollFile) {
      alert('Please provide a contact name and an audio file.');
      return;
    }
    try {
      setIsEnrolling(true);
      await enrollOfflineContact(newContactName.trim(), enrollFile);
      setNewContactName('');
      setEnrollFile(null);
      await refreshContacts();
    } catch (err) {
      alert('Enrollment failed: ' + err.message);
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleDeleteContact = async (id) => {
    if (!window.confirm('Delete this enrolled voice profile?')) return;
    await deleteOfflineContact(id);
    await refreshContacts();
  };

  const handleDeleteIncident = async (id) => {
    await deleteVaultIncident(id);
    await refreshVault();
  };

  const handlePurgeVault = async () => {
    if (!window.confirm('Permanently purge all offline incident records?')) return;
    await purgeAllVaultIncidents();
    await refreshVault();
  };

  const handleSyncWithCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncStatus('Connecting to server...');
      const res = await offlineSyncManager.syncPendingIncidents();
      if (res.success) {
        setSyncStatus(`Sync complete: ${res.synced} incident(s) uploaded.`);
        await refreshVault();
      } else {
        setSyncStatus(`Sync unavailable: ${res.error || 'Check internet connection'}`);
      }
    } catch (err) {
      setSyncStatus('Sync failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const exportDossier = (incident) => {
    const jsonStr = JSON.stringify(incident, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident_report_${incident.id || 'record'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCertModal = (incident) => {
    setSelectedCertIncident(incident);
    setIsCertModalOpen(true);
  };

  return (
    <div className="page-view-wrapper">
      {/* ─── Standard Clean Page Header ───────────────────────────── */}
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Offline Protection</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>Offline Voice Threat Protection</h2>
            <p>
              Autonomous on-device voice cloning detection, acoustic forensics, and conversational fraud analysis running entirely in local memory.
            </p>
          </div>
          <div className="offline-status-indicator">
            <span className="status-dot online"></span>
            <span>Local Engine Active</span>
          </div>
        </div>
      </div>

      {/* ─── Primary Guardian HUD ──────────────────────────────────── */}
      <GuardianHUD onIncidentRecorded={refreshVault} />

      {/* ─── Secondary Workspace Grid ──────────────────────────────── */}
      <div className="offline-sections-grid">
        {/* Trusted Contact Voice Enrollment */}
        <div className="offline-card">
          <div className="offline-card-header">
            <div>
              <h3>Trusted Voice Profiles</h3>
              <p>Enroll known family or team members to detect targeted impersonation clones.</p>
            </div>
            <span className="card-badge">{contacts.length} Enrolled</span>
          </div>

          <form onSubmit={handleEnrollSubmit} className="offline-form">
            <div className="form-field">
              <label>Contact Name & Relationship</label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="e.g. Chief Financial Officer, Mother, Branch Manager"
                className="offline-text-input"
              />
            </div>
            <div className="form-field">
              <label>Reference Audio Sample (10-30s clean speech)</label>
              <div className="custom-file-upload-box">
                <input
                  type="file"
                  id="trusted-voice-file"
                  accept="audio/*"
                  onChange={(e) => setEnrollFile(e.target.files?.[0] || null)}
                  className="file-hidden-input"
                />
                <label htmlFor="trusted-voice-file" className="custom-file-label">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>{enrollFile ? enrollFile.name : 'Select reference audio file (WAV, MP3)'}</span>
                  {enrollFile && <span className="file-size-tag">{(enrollFile.size / (1024 * 1024)).toFixed(2)} MB</span>}
                </label>
              </div>
            </div>
            <button type="submit" disabled={isEnrolling} className="primary-action-btn">
              {isEnrolling ? 'Extracting 80-Band Biomarkers...' : 'Register Trusted Voice Profile'}
            </button>
          </form>

          {/* Enrolled Contacts List */}
          <div className="enrolled-profiles-list">
            <div className="enrolled-header-row">
              <h4>Registered Profiles</h4>
              <span className="profile-count-pill">{contacts.length} Active</span>
            </div>
            {contacts.length === 0 ? (
              <div className="empty-state-card">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: '0.5rem' }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                <span>No voice profiles registered yet. Register trusted contacts above to verify incoming calls against known vocal biometrics.</span>
              </div>
            ) : (
              <div className="profiles-grid">
                {contacts.map(c => (
                  <div key={c.id} className="profile-card">
                    <div className="profile-avatar">
                      {c.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="profile-info">
                      <strong>{c.displayName}</strong>
                      <div className="profile-meta">
                        <span className="meta-tag">80-Band Vector</span>
                        <span className="meta-tag">{c.sampleDurationSec}s Sample</span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteContact(c.id)} className="profile-delete-btn" title="Remove Profile">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Local Encrypted Incident Vault */}
        <div className="offline-card">
          <div className="offline-card-header">
            <div>
              <h3>Encrypted Evidence Vault</h3>
              <p>Tamper-proof local ledger with SHA-256 cryptographic verification and exportable forensic records.</p>
            </div>
            <div className="vault-header-actions">
              <button onClick={handleSyncWithCloud} disabled={isSyncing} className="secondary-action-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {isSyncing ? 'Syncing...' : 'Sync with Server'}
              </button>
              {incidents.length > 0 && (
                <button onClick={handlePurgeVault} className="danger-link-btn">Clear Vault</button>
              )}
            </div>
          </div>

          {syncStatus && <div className="sync-banner">{syncStatus}</div>}

          {/* Incident Dossiers Table */}
          <div className="incidents-container">
            {incidents.length === 0 ? (
              <div className="empty-state-card">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: '0.5rem' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>No threats recorded in this session. The offline engine will automatically secure incidents when suspicious speech or cloning anomalies are detected.</span>
              </div>
            ) : (
              <div className="incidents-list">
                {incidents.map(inc => (
                  <div key={inc.id} className="incident-card">
                    <div className="incident-card-top">
                      <div className="incident-id-group">
                        <span className="incident-hash">{inc.id}</span>
                        <span className={`risk-tag ${inc.riskLevel?.toLowerCase()}`}>
                          {inc.riskLevel} ({inc.riskScore || inc.finalScore}/100)
                        </span>
                        {inc.synced && <span className="sync-tag">Synced</span>}
                      </div>
                      <span className="timestamp-text">{new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>

                    <p className="incident-quote">
                      "{inc.transcript || inc.summary || 'Acoustic anomalies detected without spoken transcript.'}"
                    </p>

                    <div className="incident-actions-row">
                      <button onClick={() => openCertModal(inc)} className="btn-small primary">
                        Forensic Report
                      </button>
                      <button onClick={() => exportDossier(inc)} className="btn-small secondary">
                        Export JSON
                      </button>
                      <button onClick={() => handleDeleteIncident(inc.id)} className="btn-small danger">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Forensic Report Modal */}
      <Section65BCertificateModal
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        incident={selectedCertIncident}
      />
    </div>
  );
}
