import React, { useState, useEffect } from 'react';
import GuardianHUD from '../components/GuardianHUD';
import { enrollOfflineContact, listOfflineContacts, deleteOfflineContact } from '../services/offlineBiometricVault';
import { loadAndDecryptIncidents, deleteVaultIncident, purgeAllVaultIncidents } from '../services/encryptedIncidentVault';
import { offlineSyncManager } from '../services/offlineSyncManager';

export default function GuardianOfflinePage() {
  const [incidents, setIncidents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState('');
  const [enrollFile, setEnrollFile] = useState(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

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
      alert(`Enrolled voice profile for ${newContactName.trim()} into offline vault.`);
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
      setSyncStatus('Connecting and synchronizing...');
      const res = await offlineSyncManager.syncPendingIncidents();
      if (res.success) {
        setSyncStatus(`Sync complete: ${res.synced} incident(s) uploaded.`);
        await refreshVault();
      } else {
        setSyncStatus(`Sync issue: ${res.error || 'Check network connection'}`);
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

  return (
    <div className="page-view-wrapper guardian-page-container">
      {/* ─── Breadcrumb & Title ────────────────────────────────────── */}
      <div className="page-header-pro">
        <div className="page-breadcrumb">
          <span>VoiceShield AI</span> / <span>Guardian Offline</span>
        </div>
        <div className="guardian-title-row">
          <h2>VoiceShield Guardian Offline</h2>
          <span className="guardian-sih-tag">SIH26104 DEFENSE PLATFORM</span>
        </div>
        <p className="guardian-description">
          Autonomous, privacy-first edge voice-cloning detection & contextual fraud prevention platform.
          Operates with zero cloud dependency during network failure or intentional airplane mode isolation.
        </p>

        {/* Operating Environment Notice */}
        <div className="guardian-platform-notice">
          <span className="notice-icon">🛡️</span>
          <div>
            <strong>Operational Boundaries & Platform Integrity:</strong> In strict accordance with Android, iOS, and desktop operating system privacy sandboxes, VoiceShield Guardian monitors <em>user-supplied forensic audio</em>, <em>live ambient microphone capture</em>, and <em>permitted in-app VoIP streams</em>. It does not falsely claim silent cellular telephony tapping.
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
            <h4>Trusted Voice Biometric Enrollment</h4>
            <span className="subcard-tag">IndexedDB Encrypted</span>
          </div>
          <p className="subcard-hint">
            Enroll family members or executive authorization voices locally to detect targeted voice clone attacks.
          </p>

          <form onSubmit={handleEnrollSubmit} className="enroll-form">
            <div className="input-group">
              <label>Contact Display Name:</label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="e.g. Chief Financial Officer / Mother"
              />
            </div>
            <div className="input-group">
              <label>Reference Audio Sample (16kHz WAV or MP3):</label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setEnrollFile(e.target.files?.[0] || null)}
              />
            </div>
            <button type="submit" disabled={isEnrolling} className="enroll-submit-btn">
              {isEnrolling ? 'Extracting Acoustic Vectors...' : 'Enroll Trusted Voice Profile'}
            </button>
          </form>

          {/* Enrolled Contacts List */}
          <div className="enrolled-list">
            <h5>Enrolled Profiles ({contacts.length}):</h5>
            {contacts.length === 0 ? (
              <span className="empty-hint">No contacts enrolled yet. Add a profile above to enable clone detection.</span>
            ) : (
              <ul>
                {contacts.map(c => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.displayName}</strong>
                      <small>80-dim embedding • {c.sampleDurationSec}s sample</small>
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
            <h4>Encrypted Offline Incident Vault</h4>
            <span className="subcard-tag">AES-GCM-256</span>
          </div>
          <p className="subcard-hint">
            Tamper-resistant local evidence store. Derived threat telemetry is encrypted with a device-bound key.
          </p>

          <div className="vault-actions-bar">
            <button onClick={handleSyncWithCloud} disabled={isSyncing} className="sync-cloud-btn">
              {isSyncing ? 'Synchronizing...' : '🔄 Sync Incidents to Central Vault'}
            </button>
            {incidents.length > 0 && (
              <button onClick={handlePurgeVault} className="purge-vault-btn">Purge Vault</button>
            )}
          </div>
          {syncStatus && <div className="sync-status-message">{syncStatus}</div>}

          {/* Incident Dossiers Table */}
          <div className="vault-incidents-list">
            {incidents.length === 0 ? (
              <div className="empty-vault-state">
                <span>No high-risk incidents recorded in offline vault.</span>
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
                    {inc.transcript || inc.summary || 'Acoustic deepfake indicators flagged without spoken transcript.'}
                  </p>

                  <div className="incident-card-footer">
                    <button onClick={() => exportDossier(inc)} className="export-dossier-btn">Export JSON Dossier</button>
                    <button onClick={() => handleDeleteIncident(inc.id)} className="delete-inc-btn">Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
