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

  // Section 65B Certificate Modal
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
      alert('Please provide contact name and an audio sample.');
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
    if (!window.confirm('Delete this enrolled voice biometric?')) return;
    await deleteOfflineContact(id);
    await refreshContacts();
  };

  const handleDeleteIncident = async (id) => {
    await deleteVaultIncident(id);
    await refreshVault();
  };

  const handlePurgeVault = async () => {
    if (!window.confirm('Permanently purge all offline forensic incident logs?')) return;
    await purgeAllVaultIncidents();
    await refreshVault();
  };

  const handleSyncWithCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncStatus('Establishing secure handshake...');
      const res = await offlineSyncManager.syncPendingIncidents();
      if (res.success) {
        setSyncStatus(`Sync successful: ${res.synced} incident record(s) committed.`);
        await refreshVault();
      } else {
        setSyncStatus(`Sync unready: ${res.error || 'Check network connection'}`);
      }
    } catch (err) {
      setSyncStatus('Sync failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Export forensic dossier JSON
  const exportDossier = (incident) => {
    const jsonStr = JSON.stringify(incident, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident_dossier_${incident.id || 'record'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCertModal = (incident) => {
    setSelectedCertIncident(incident);
    setIsCertModalOpen(true);
  };

  return (
    <div className="guardian-workstation-wrapper">
      {/* ─── High-Tech Command Bar ──────────────────────────────────── */}
      <div className="guardian-command-bar">
        <div className="command-brand">
          <div className="radar-sweep-icon">
            <span className="radar-core" />
            <span className="radar-ring" />
          </div>
          <div>
            <div className="command-title-row">
              <h2 className="command-title">GUARDIAN // AIR-GAPPED WORKSTATION</h2>
              <span className="defense-state-pill">STANDALONE HARDENED</span>
            </div>
            <div className="command-telemetry-strip">
              <span>ENGINE: <strong>EDGE-DSP v2.4</strong></span>
              <span className="telemetry-sep">•</span>
              <span>SAMPLING: <strong>16,000 HZ FLOAT32</strong></span>
              <span className="telemetry-sep">•</span>
              <span>CIPHER: <strong>AES-GCM-256</strong></span>
              <span className="telemetry-sep">•</span>
              <span>INTEGRITY: <strong>SHA-256 SEALED</strong></span>
            </div>
          </div>
        </div>

        <div className="command-meta-right">
          <div className="command-stat-box">
            <span className="stat-label">VAULT DOSSIERS</span>
            <span className="stat-value">{incidents.length}</span>
          </div>
          <div className="command-stat-box">
            <span className="stat-label">ENROLLED VOICES</span>
            <span className="stat-value">{contacts.length}</span>
          </div>
        </div>
      </div>

      {/* ─── Primary Guardian HUD ──────────────────────────────────── */}
      <GuardianHUD onIncidentRecorded={refreshVault} />

      {/* ─── Lower Section: Biometrics & Encrypted Vault ───────────── */}
      <div className="guardian-secondary-grid">
        {/* Trusted Contact Voice Enrollment */}
        <div className="guardian-subcard">
          <div className="subcard-header">
            <div>
              <h4>Trusted Voice Biometric Profiles</h4>
              <p className="subcard-hint">
                Enrolled reference embeddings for real-time impersonation clone detection.
              </p>
            </div>
            <span className="subcard-tag">LOCAL EMBEDDINGS</span>
          </div>

          <form onSubmit={handleEnrollSubmit} className="enroll-form">
            <div className="input-group">
              <label>Profile Identifier / Label</label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="e.g. Executive Officer / Family Member"
              />
            </div>
            <div className="input-group">
              <label>Reference Audio File (16kHz WAV or MP3)</label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setEnrollFile(e.target.files?.[0] || null)}
              />
            </div>
            <button type="submit" disabled={isEnrolling} className="enroll-submit-btn">
              {isEnrolling ? 'EXTRACTING ACOUSTIC VECTORS...' : 'ENROLL VOICE PROFILE'}
            </button>
          </form>

          {/* Enrolled Contacts List */}
          <div className="enrolled-list">
            <div className="list-title-row">
              <h5>Registered Biometric Profiles</h5>
              <span className="count-pill">{contacts.length} ACTIVE</span>
            </div>
            {contacts.length === 0 ? (
              <div className="empty-hint">No voice profiles enrolled. Add reference audio above to activate clone identification.</div>
            ) : (
              <ul>
                {contacts.map(c => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.displayName}</strong>
                      <small>80-band filterbank vector • {c.sampleDurationSec}s baseline</small>
                    </div>
                    <button onClick={() => handleDeleteContact(c.id)} className="delete-contact-btn">Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Encrypted Offline Incident Vault */}
        <div className="guardian-subcard">
          <div className="subcard-header">
            <div>
              <h4>Air-Gapped Incident Vault</h4>
              <p className="subcard-hint">
                AES-GCM-256 encrypted forensic dossiers stored on-device with SHA-256 hashes.
              </p>
            </div>
            <span className="subcard-tag">AES-GCM-256</span>
          </div>

          <div className="vault-actions-bar">
            <button onClick={handleSyncWithCloud} disabled={isSyncing} className="sync-cloud-btn">
              {isSyncing ? 'SYNCHRONIZING...' : 'SYNC WITH CENTRAL DATABASE'}
            </button>
            {incidents.length > 0 && (
              <button onClick={handlePurgeVault} className="purge-vault-btn">PURGE LOGS</button>
            )}
          </div>
          {syncStatus && <div className="sync-status-message">{syncStatus}</div>}

          {/* Incident Dossiers Table */}
          <div className="vault-incidents-list">
            {incidents.length === 0 ? (
              <div className="empty-vault-state">
                <span>Zero elevated threats recorded. System operating securely.</span>
              </div>
            ) : (
              incidents.map(inc => (
                <div key={inc.id} className={`incident-record-card ${inc.riskLevel?.toLowerCase()}`}>
                  <div className="incident-card-top">
                    <div>
                      <strong>{inc.id}</strong>
                      <span className={`risk-badge ${inc.riskLevel?.toLowerCase()}`}>{inc.riskLevel} ({inc.riskScore || inc.finalScore}/100)</span>
                      {inc.synced && <span className="synced-pill">SYNCED</span>}
                      {inc.tampered && <span className="tampered-pill">TAMPERED</span>}
                    </div>
                    <span className="incident-time">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <p className="incident-transcript">
                    {inc.transcript || inc.summary || 'Acoustic vocoder anomalies flagged without spoken transcript.'}
                  </p>

                  <div className="incident-card-footer">
                    <button onClick={() => openCertModal(inc)} className="cert-btn-hud" style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem' }}>
                      EVIDENCE 65B
                    </button>
                    <button onClick={() => exportDossier(inc)} className="export-dossier-btn">
                      EXPORT JSON
                    </button>
                    <button onClick={() => handleDeleteIncident(inc.id)} className="delete-inc-btn">
                      DELETE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Section 65B Electronic Evidence Modal */}
      <Section65BCertificateModal
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        incident={selectedCertIncident}
      />
    </div>
  );
}
