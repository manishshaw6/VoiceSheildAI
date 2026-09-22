/**
 * VoiceShield Guardian Offline — Connectivity-Aware Sync Manager
 * Autonomous Sovereign Edge Sync Engine
 *
 * Monitors real-time network reachability and safely synchronizes local
 * encrypted forensic incident dossiers to the central database with
 * idempotency checks and cryptographic validation.
 */

import { loadAndDecryptIncidents, markIncidentsSynced } from './encryptedIncidentVault.js';

class OfflineSyncManager {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.listeners = new Set();
    this.isSyncing = false;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }
  }

  handleNetworkChange(online) {
    this.isOnline = online;
    for (const listener of this.listeners) {
      try {
        listener(this.isOnline);
      } catch (err) {
        console.error('[SyncManager] Listener callback error:', err);
      }
    }
  }

  /**
   * Subscribe to network connectivity changes.
   * @param {Function} callback (isOnline: boolean) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.isOnline);
    return () => this.listeners.delete(callback);
  }

  /**
   * Returns count of unsynchronized offline incidents.
   * @returns {Promise<number>}
   */
  async getUnsyncedCount() {
    try {
      const incidents = await loadAndDecryptIncidents();
      return incidents.filter(i => !i.synced && !i.tampered).length;
    } catch {
      return 0;
    }
  }

  /**
   * Performs an idempotent batch upload of all pending offline records to the backend.
   * @returns {Promise<{ success: boolean, synced: number, skipped: number, error?: string }>}
   */
  async syncPendingIncidents() {
    if (!this.isOnline) {
      return { success: false, synced: 0, skipped: 0, error: 'Device is currently offline.' };
    }

    if (this.isSyncing) {
      return { success: false, synced: 0, skipped: 0, error: 'Synchronization is already in progress.' };
    }

    this.isSyncing = true;
    try {
      const allIncidents = await loadAndDecryptIncidents();
      const pending = allIncidents.filter(i => !i.synced && !i.tampered);

      if (pending.length === 0) {
        return { success: true, synced: 0, skipped: 0, message: 'All offline incidents are already synchronized.' };
      }

      // Format payload for /api/v1/offline/sync
      const payload = {
        incidents: pending.map(item => ({
          id: item.id,
          timestamp: item.timestamp,
          riskScore: item.finalScore || item.riskScore || 0,
          riskLevel: item.riskLevel || 'ELEVATED',
          transcript: item.transcript || item.summary || '',
          indicators: item.indicators || [],
          clientSha256: item.sha256Hex,
          notes: item.recommendedAction || 'Recorded via VoiceShield Guardian Offline.'
        }))
      };

      const res = await fetch('/api/v1/offline/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('voxshield_auth_token') || ''}`
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Sync endpoint returned an error.');
      }

      const syncedIds = (data.syncedRecords || []).map(r => r.id);
      const skippedIds = (data.skippedRecords || []).map(r => r.id);

      // Mark all confirmed IDs as synced in IndexedDB
      await markIncidentsSynced([...syncedIds, ...skippedIds]);

      return {
        success: true,
        synced: syncedIds.length,
        skipped: skippedIds.length,
        message: `Synced ${syncedIds.length} incident(s) with central vault.`
      };
    } catch (err) {
      return {
        success: false,
        synced: 0,
        skipped: 0,
        error: err.message || 'Failed to complete cloud synchronization.'
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const offlineSyncManager = new OfflineSyncManager();
