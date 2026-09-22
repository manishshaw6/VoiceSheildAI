import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl, webSocketUrl } from '../config/api';

export default function ApiKeyPortalPage() {
  const { user, authenticated, openAuthModal } = useAuth();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresDays, setExpiresDays] = useState('0'); // 0 = Never
  const [selectedScopes, setSelectedScopes] = useState([
    'forensics:read',
    'forensics:write',
    'live:stream'
  ]);
  const [creating, setCreating] = useState(false);

  // New Key Secret Reveal Modal
  const [createdSecretData, setCreatedSecretData] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Integration Code Snippets Tab
  const [activeCodeTab, setActiveCodeTab] = useState('python');

  const fetchKeys = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(apiUrl('/api/v1/api-keys'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch API keys');
      setKeys(data.keys || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!keyName.trim()) {
      alert('Please provide a descriptive name for your API key.');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(apiUrl('/api/v1/api-keys'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyName: keyName.trim(),
          permissions: selectedScopes,
          rateLimitRpm: Number(rateLimit) || 60,
          expiresDays: Number(expiresDays) > 0 ? Number(expiresDays) : null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate key');

      setShowCreateModal(false);
      setKeyName('');
      setCreatedSecretData(data.key);
      fetchKeys();
    } catch (err) {
      alert('Error creating API key: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId, keyName) => {
    const confirm = window.confirm(`Are you sure you want to revoke API key "${keyName}"? Any external application or service using this key will immediately lose access.`);
    if (!confirm) return;

    try {
      const res = await fetch(apiUrl(`/api/v1/api-keys/${keyId}/revoke`), {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke key');

      setSuccessToast(`API key "${keyName}" was successfully revoked.`);
      setTimeout(() => setSuccessToast(''), 4000);
      fetchKeys();
    } catch (err) {
      alert('Failed to revoke key: ' + err.message);
    }
  };

  const handleDeleteKey = async (keyId, keyName) => {
    const confirm = window.confirm(`Are you sure you want to permanently delete API key "${keyName}"? This record will be completely removed from the system.`);
    if (!confirm) return;

    try {
      const res = await fetch(apiUrl(`/api/v1/api-keys/${keyId}`), {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete key');

      setSuccessToast(`API key "${keyName}" was permanently deleted.`);
      setTimeout(() => setSuccessToast(''), 4000);
      fetchKeys();
    } catch (err) {
      alert('Failed to delete key: ' + err.message);
    }
  };

  const handlePurgeRevoked = async () => {
    const confirm = window.confirm('Permanently purge all revoked API keys from the ledger?');
    if (!confirm) return;

    try {
      const res = await fetch(apiUrl('/api/v1/api-keys/purge-revoked'), {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to purge keys');

      setSuccessToast(data.message || 'Revoked keys purged successfully.');
      setTimeout(() => setSuccessToast(''), 4000);
      fetchKeys();
    } catch (err) {
      alert('Failed to purge keys: ' + err.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    });
  };

  const activeKeyPlaceholder = createdSecretData?.secretKey || 'vx_live_9a4f7e21b8c63d5012e87a4bc3109df4';
  const apiEndpoint = apiUrl('/api/v1/audio/analyze');
  const liveStreamEndpoint = webSocketUrl('/ws/live-analysis');

  const codeSnippets = {
    curl: `# 1. Audio Forensic & Deepfake Threat Analysis via cURL
curl -X POST "${apiEndpoint}" \\
  -H "X-API-Key: ${activeKeyPlaceholder}" \\
  -F "audio=@/path/to/incoming_call_recording.wav"

# Response JSON will return exact risk score (0–100), synthetic probability,
# voice clone suspicion flag, and bank impersonation indicators.`,

    python: `import requests

# VoiceShield AI Python Client Integration Layer
API_KEY = "${activeKeyPlaceholder}"
ENDPOINT = "${apiEndpoint}"

def inspect_voice_call(audio_file_path):
    headers = {
        "X-API-Key": API_KEY
    }
    with open(audio_file_path, "rb") as f:
        files = {"audio": f}
        response = requests.post(ENDPOINT, headers=headers, files=files)
        
    result = response.json()
    risk_score = result.get("risk", {}).get("score", 0)
    risk_level = result.get("risk", {}).get("level", "LOW")
    clone_detected = result.get("risk", {}).get("cloneSuspicion", False)
    
    print(f"[VoxShield] Risk Score: {risk_score:.2f}/100 [{risk_level}]")
    
    if clone_detected or risk_score >= 80:
        print("[CRITICAL] Intercepting call! Voice Clone / Severe Fraud detected.")
        return {"action": "BLOCK_CALL", "risk": risk_score}
        
    return {"action": "ALLOW_CALL", "risk": risk_score}

# Run inspection
# inspect_voice_call("customer_support_call.wav")`,

    nodejs: `// VoiceShield AI Node.js / Express Security Interceptor Layer
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const VOXSHIELD_API_KEY = '${activeKeyPlaceholder}';
const VOXSHIELD_URL = '${apiEndpoint}';

export async function verifyIncomingVoice(audioStreamBuffer, filename = 'voice_stream.wav') {
  const form = new FormData();
  form.append('audio', audioStreamBuffer, { filename });

  const response = await fetch(VOXSHIELD_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': VOXSHIELD_API_KEY,
      ...form.getHeaders()
    },
    body: form
  });

  const analysis = await response.json();
  const { score, level, cloneSuspicion } = analysis.risk || {};

  return {
    verified: score < 60 && !cloneSuspicion,
    riskScore: score,
    riskLevel: level,
    cloneSuspicion,
    threatIndicators: analysis.indicators || []
  };
}`,

    websocket: `// VoiceShield AI Live Stream Real-Time WebSocket Interceptor
const wsUrl = "${liveStreamEndpoint}";
const socket = new WebSocket(wsUrl);

socket.onopen = () => {
  console.log("[VoxShield] Live intercept stream active.");
  socket.send(JSON.stringify({
    type: "start",
    apiKey: "${activeKeyPlaceholder}"
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "risk_update") {
    console.log(\`[LIVE THREAT] Score: \${data.score} | Level: \${data.riskLevel}\`);
    if (data.score >= 80 || data.cloneSuspicion) {
      alert("CRITICAL WARNING: Voice Clone or Active Fraud In Progress!");
    }
  }
};`
  };

  return (
    <div className="api-keys-page-container">
      {/* Top Breadcrumb & Header */}
      <div className="page-header-pro">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#00e5a3', background: 'rgba(0, 229, 163, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0, 229, 163, 0.25)' }}>
            DEVELOPER LAYER // API KEYS & EXTERNAL INTEGRATION
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
              API Keys & Security Gateway
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.92rem', marginTop: '6px', maxWidth: '680px', lineHeight: 1.5 }}>
              Generate cryptographically signed API keys to connect VoiceShield AI as an active acoustic threat defense layer across external applications, PBX/VoIP gateways, CRM systems, and banking apps.
            </p>
          </div>

          <button
            className="btn-create-key"
            onClick={() => setShowCreateModal(true)}
            style={{
              background: 'linear-gradient(135deg, #00e5a3 0%, #00b884 100%)',
              color: '#04120c',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(0, 229, 163, 0.35)',
              transition: 'transform 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>GENERATE NEW API KEY</span>
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div style={{
          background: 'rgba(0, 229, 163, 0.15)',
          border: '1px solid #00e5a3',
          color: '#00e5a3',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontWeight: 700,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>✓</span>
          <span>{successToast}</span>
        </div>
      )}

      {/* Active API Keys Ledger Card */}
      <div className="card-pro" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
              Active Security Keys Ledger
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              SHA-256 hashed at rest · High-entropy CSPRNG tokens
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {keys.some(k => k.status === 'REVOKED') && (
              <button
                onClick={handlePurgeRevoked}
                style={{
                  background: 'rgba(255, 59, 92, 0.12)',
                  border: '1px solid rgba(255, 59, 92, 0.35)',
                  color: '#ff3b5c',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Purge all revoked keys permanently"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Purge Revoked
              </button>
            )}
            <button
              onClick={fetchKeys}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ↺ Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
            Loading API keys ledger...
          </div>
        ) : error ? (
          <div style={{ padding: '20px', background: 'rgba(255, 59, 92, 0.1)', border: '1px solid #ff3b5c', borderRadius: '8px', color: '#ff3b5c', fontSize: '0.85rem' }}>
            Failed to load keys: {error}
          </div>
        ) : keys.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0, 229, 163, 0.1)', color: '#00e5a3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-1-1l-3 3m0 0l-2-2-4 4 2 2-4 4 2 2-3 3M7 17l-4 4"/>
                <circle cx="17" cy="7" r="3"/>
              </svg>
            </div>
            <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '0.95rem' }}>No API Keys Generated Yet</div>
            <p style={{ color: '#64748b', fontSize: '0.82rem', maxWidth: '400px', margin: '6px auto 16px' }}>
              Create your first API key to connect VoiceShield AI into third-party phone systems, backend APIs, or VoIP gateways.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                background: 'rgba(0, 229, 163, 0.15)',
                border: '1px solid #00e5a3',
                color: '#00e5a3',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              + Generate First Key
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 12px' }}>Key Name</th>
                  <th style={{ padding: '10px 12px' }}>Token Identifier</th>
                  <th style={{ padding: '10px 12px' }}>Permissions</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Created / Last Used</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#f8fafc' }}>
                      {k.keyName}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <code style={{ fontFamily: 'monospace', color: '#00e5a3', background: 'rgba(0, 229, 163, 0.08)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.82rem', border: '1px solid rgba(0, 229, 163, 0.2)' }}>
                        {k.keyPrefix}
                      </code>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {k.permissions.map((p, i) => (
                          <span key={i} style={{ fontSize: '0.66rem', fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', padding: '1px 6px', borderRadius: '3px' }}>
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: k.status === 'ACTIVE' ? 'rgba(0, 229, 163, 0.12)' : 'rgba(255, 59, 92, 0.12)',
                        color: k.status === 'ACTIVE' ? '#00e5a3' : '#ff3b5c',
                        border: `1px solid ${k.status === 'ACTIVE' ? '#00e5a340' : '#ff3b5c40'}`
                      }}>
                        {k.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#94a3b8', fontSize: '0.78rem' }}>
                      <div>Created: {new Date(k.createdAt).toLocaleDateString()}</div>
                      <div style={{ color: k.lastUsedAt ? '#00e5a3' : '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>
                        {k.lastUsedAt ? `Last Used: ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never Used'}
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                        {k.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRevokeKey(k.id, k.keyName)}
                            style={{
                              background: 'rgba(255, 140, 0, 0.12)',
                              color: '#ffad42',
                              border: '1px solid rgba(255, 140, 0, 0.35)',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            title="Revoke this API Key immediately"
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteKey(k.id, k.keyName)}
                          style={{
                            background: 'rgba(255, 59, 92, 0.12)',
                            color: '#ff3b5c',
                            border: '1px solid rgba(255, 59, 92, 0.3)',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s'
                          }}
                          title="Permanently delete this API Key"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Integration Code Tabs (cURL, Python SDK, Node.js) */}
      <div className="card-pro" style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
              Quickstart Developer Integration Guide
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Embed VoiceShield as an active security sentinel into your application architecture
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
            {['python', 'nodejs', 'curl', 'websocket'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveCodeTab(tab)}
                style={{
                  background: activeCodeTab === tab ? 'rgba(0, 229, 163, 0.15)' : 'transparent',
                  color: activeCodeTab === tab ? '#00e5a3' : '#94a3b8',
                  border: activeCodeTab === tab ? '1px solid rgba(0, 229, 163, 0.3)' : '1px solid transparent',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace'
                }}
              >
                {tab === 'nodejs' ? 'Node.js' : tab === 'websocket' ? 'WebSocket Live' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Code Snippet Box */}
        <div style={{ position: 'relative' }}>
          <pre style={{
            background: 'linear-gradient(180deg, #060e0a 0%, #030805 100%)',
            border: '1px solid rgba(0, 229, 163, 0.2)',
            borderRadius: '8px',
            padding: '16px',
            color: '#e2e8f0',
            fontFamily: '"Fira Code", monospace, Consolas',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            overflowX: 'auto',
            margin: 0
          }}>
            <code>{codeSnippets[activeCodeTab]}</code>
          </pre>

          <button
            onClick={() => copyToClipboard(codeSnippets[activeCodeTab])}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(0, 229, 163, 0.12)',
              border: '1px solid rgba(0, 229, 163, 0.3)',
              color: '#00e5a3',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {copiedKey ? '✓ Copied' : 'Copy Code'}
          </button>
        </div>
      </div>

      {/* CREATE API KEY MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop-pro" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0b1510 0%, #050a07 100%)',
            border: '1px solid rgba(0, 229, 163, 0.35)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(0, 229, 163, 0.15)',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Generate Security API Key
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateKey}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  KEY NAME / APPLICATION IDENTIFIER *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Asterisk PBX Gateway"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  PERMISSIONS & SCOPES
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { id: 'forensics:write', label: 'Audio Threat Analysis (POST /audio/analyze)' },
                    { id: 'live:stream', label: 'Live Real-Time Call Interceptor (WebSocket Stream)' },
                    { id: 'forensics:read', label: 'Audit Vault & Verification (GET /reports/:id)' }
                  ].map((sc) => (
                    <label key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#e2e8f0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(sc.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedScopes([...selectedScopes, sc.id]);
                          } else {
                            setSelectedScopes(selectedScopes.filter(s => s !== sc.id));
                          }
                        }}
                      />
                      <span>{sc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    RATE LIMIT (REQ/MIN)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#f8fafc',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    KEY EXPIRATION
                  </label>
                  <select
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#f8fafc',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="0">Never Expires</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="365">1 Year</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#cbd5e1',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    background: 'linear-gradient(135deg, #00e5a3 0%, #00b884 100%)',
                    color: '#04120c',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer'
                  }}
                >
                  {creating ? 'Generating...' : 'Create Secret Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECRET REVEAL ONE-TIME MODAL */}
      {createdSecretData && (
        <div className="modal-backdrop-pro" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0b1510 0%, #050a07 100%)',
            border: '2px solid #00e5a3',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(0, 229, 163, 0.25)',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0, 229, 163, 0.2)', color: '#00e5a3', fontWeight: 900 }}>
                ✓
              </span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                API Key Generated Successfully
              </h3>
            </div>

            <div style={{
              background: 'rgba(255, 140, 0, 0.12)',
              border: '1px solid rgba(255, 140, 0, 0.35)',
              padding: '10px 14px',
              borderRadius: '8px',
              color: '#ffad42',
              fontSize: '0.80rem',
              marginBottom: '16px',
              lineHeight: 1.4
            }}>
              <strong>WARNING:</strong> Copy your secret key now. For your security, this key is SHA-256 hashed and will never be displayed again.
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                Your Secret Token:
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid #00e5a3',
                borderRadius: '8px',
                padding: '10px 14px',
                gap: '10px'
              }}>
                <code style={{ flex: 1, fontFamily: 'monospace', color: '#00e5a3', fontSize: '0.88rem', wordBreak: 'break-all' }}>
                  {createdSecretData.secretKey}
                </code>
                <button
                  onClick={() => copyToClipboard(createdSecretData.secretKey)}
                  style={{
                    background: copiedKey ? '#00e5a3' : 'rgba(0, 229, 163, 0.2)',
                    color: copiedKey ? '#04120c' : '#00e5a3',
                    border: '1px solid #00e5a3',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {copiedKey ? '✓ Copied' : 'Copy Key'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setCreatedSecretData(null)}
                style={{
                  background: 'linear-gradient(135deg, #00e5a3 0%, #00b884 100%)',
                  color: '#04120c',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                I Have Safely Saved My Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
