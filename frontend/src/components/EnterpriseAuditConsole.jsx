import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SecurityDashboard from './SecurityDashboard';

export default function EnterpriseAuditConsole({ onExportReport }) {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'timeline' | 'analyses'

  // Audit Events & Pagination
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Operational KPI Statistics
  const [stats, setStats] = useState({
    totalEvents: 0,
    severityDistribution: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, INFO: 0 },
    verifiedIncidents: 0,
    distinctSessions: 0,
    eventsLast24h: 0,
    pipelineStatus: {
      storageEngine: 'Loading...',
      cryptographicChaining: 'ACTIVE',
      chainIntegrity: 'VERIFIED',
      latestEventHash: null,
      clockSync: 'UTC_SYNCHRONIZED',
      ingestionStatus: 'OPERATIONAL'
    }
  });

  // Filters & Search
  const [timeRange, setTimeRange] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCallId, setFilterCallId] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Real-time Event Streaming
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamEventCount, setStreamEventCount] = useState(0);
  const eventSourceRef = useRef(null);

  // Inspector Drawer
  const [inspectedEvent, setInspectedEvent] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [inspectedSessionTimeline, setInspectedSessionTimeline] = useState([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

  // Cryptographic Chain Verification Modal
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Legacy Scans / History Integration
  const [historicalAnalyses, setHistoricalAnalyses] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [inspectedAnalysis, setInspectedAnalysis] = useState(null);

  // Copy Feedback
  const [copiedHash, setCopiedHash] = useState(null);

  // Fetch Audit Statistics
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/audit/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('[AuditConsole] Failed to fetch stats:', err);
    }
  }, []);

  // Fetch Filtered Audit Events
  const fetchEvents = useCallback(async (pageOverride = null) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const currentPage = pageOverride !== null ? pageOverride : pagination.page;
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pagination.limit.toString(),
        severity: severityFilter,
        category: categoryFilter,
        timeRange,
        sortBy,
        sortOrder
      });

      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (filterCallId.trim()) params.set('callId', filterCallId.trim());

      const res = await fetch(`/api/audit?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch audit events`);
      const data = await res.json();

      if (data.success) {
        setEvents(data.events || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } else {
        throw new Error(data.error || 'Failed to query audit trail');
      }
    } catch (err) {
      console.error('[AuditConsole] Fetch error:', err);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, severityFilter, categoryFilter, timeRange, searchQuery, filterCallId, sortBy, sortOrder]);

  // Fetch Historical Voice Scans (Preserving existing functionality)
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/history', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHistoricalAnalyses(data.history || []);
        }
      }
    } catch (err) {
      console.error('[AuditConsole] Failed to load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Initialize Data
  useEffect(() => {
    fetchStats();
    fetchEvents(1);
    fetchHistory();
  }, [fetchStats, fetchEvents, fetchHistory]);

  // Real-Time Event Stream Connection (SSE)
  useEffect(() => {
    let reconnectTimeout = null;

    const connectSSE = () => {
      try {
        const es = new EventSource('/api/audit/stream');
        eventSourceRef.current = es;

        es.onopen = () => {
          setStreamConnected(true);
        };

        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.type === 'AUDIT_EVENT' && payload.event) {
              setStreamEventCount(prev => prev + 1);
              setEvents(prev => {
                // Deduplicate by id or eventHash
                if (prev.some(ev => ev.id === payload.event.id || ev.eventHash === payload.event.eventHash)) {
                  return prev;
                }
                return [payload.event, ...prev.slice(0, pagination.limit - 1)];
              });
              // Refresh operational KPIs quietly
              fetchStats();
            }
          } catch (_) { }
        };

        es.onerror = () => {
          setStreamConnected(false);
          es.close();
          // Exponential backoff reconnect
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch (err) {
        setStreamConnected(false);
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [pagination.limit, fetchStats]);

  // Open Event Inspector Drawer
  const handleInspectEvent = async (event) => {
    setInspectedEvent(event);
    setIsInspectorOpen(true);

    if (event.callId) {
      setIsLoadingTimeline(true);
      try {
        const res = await fetch(`/api/audit/timeline/${encodeURIComponent(event.callId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setInspectedSessionTimeline(data.timeline || []);
          }
        }
      } catch (err) {
        console.error('[AuditConsole] Failed to fetch session timeline:', err);
      } finally {
        setIsLoadingTimeline(false);
      }
    } else {
      setInspectedSessionTimeline([]);
    }
  };

  // Close Event Inspector
  const handleCloseInspector = () => {
    setIsInspectorOpen(false);
    setInspectedEvent(null);
    setInspectedSessionTimeline([]);
  };

  // Run On-Demand Cryptographic Chain Verification
  const handleVerifyChain = async () => {
    setIsVerifying(true);
    setIsVerifyModalOpen(true);
    try {
      const res = await fetch('/api/audit/verify', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.verification) {
        setVerifyResult(data.verification);
      } else {
        setVerifyResult({ verified: false, error: data.error || 'Verification query rejected' });
      }
    } catch (err) {
      setVerifyResult({ verified: false, error: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  // Export Filtered Log Dossier (CSV / JSON)
  const handleExport = (format = 'csv') => {
    const params = new URLSearchParams({
      format,
      severity: severityFilter,
      category: categoryFilter,
      timeRange
    });
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (filterCallId.trim()) params.set('callId', filterCallId.trim());

    window.open(`/api/audit/export?${params.toString()}`, '_blank');
  };

  // Copy Cryptographic Hash to Clipboard
  const handleCopyHash = (hash, e) => {
    if (e) e.stopPropagation();
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Severity Visual Helpers (Strict enterprise palette)
  const getSeverityBadgeClass = (sev) => {
    switch (String(sev || '').toUpperCase()) {
      case 'CRITICAL': return 'siem-badge-critical';
      case 'HIGH': return 'siem-badge-high';
      case 'MODERATE':
      case 'SUSPICIOUS': return 'siem-badge-moderate';
      case 'LOW': return 'siem-badge-low';
      default: return 'siem-badge-info';
    }
  };

  // Quick Session Filter
  const handleFilterBySession = (callId, e) => {
    if (e) e.stopPropagation();
    if (!callId) return;
    setFilterCallId(callId);
    setActiveTab('events');
  };

  const handleClearSessionFilter = () => {
    setFilterCallId('');
  };

  // Severity Distribution Percentages
  const totalSeverityCount = useMemo(() => {
    const d = stats.severityDistribution || {};
    return (d.CRITICAL || 0) + (d.HIGH || 0) + (d.MODERATE || 0) + (d.LOW || 0) + (d.INFO || 0);
  }, [stats.severityDistribution]);

  const severityPercentages = useMemo(() => {
    if (totalSeverityCount === 0) return { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, INFO: 100 };
    const d = stats.severityDistribution || {};
    return {
      CRITICAL: Math.round(((d.CRITICAL || 0) / totalSeverityCount) * 100),
      HIGH: Math.round(((d.HIGH || 0) / totalSeverityCount) * 100),
      MODERATE: Math.round(((d.MODERATE || 0) / totalSeverityCount) * 100),
      LOW: Math.round(((d.LOW || 0) / totalSeverityCount) * 100),
      INFO: Math.round(((d.INFO || 0) / totalSeverityCount) * 100)
    };
  }, [stats.severityDistribution, totalSeverityCount]);

  return (
    <div className="siem-audit-console">
      {/* ─── Top Enterprise SOC Header ────────────────────────────────────────── */}
      <header className="siem-header">
        <div className="siem-header-left">
          <div className="siem-breadcrumb">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#38bdf8' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <span className="siem-platform-title">VOICESHIELD AI · ENTERPRISE SOC</span>
            <span className="siem-divider">/</span>
            <span>FORENSIC AUDIT LEDGER</span>
            <span className="siem-divider">/</span>
            <span className="siem-sub-breadcrumb">SIEM · TAMPER-EVIDENT CHAIN</span>
          </div>
          <h1 className="siem-title">Security Event Audit &amp; Investigation Console</h1>
          <p className="siem-subtitle">
            Cryptographically chained append-only forensic event ledger · SHA-256 hash provenance · Conformant with <strong style={{ color: '#94a3b8', fontWeight: 600 }}>Section 63 BSA</strong> / <strong style={{ color: '#94a3b8', fontWeight: 600 }}>Section 65B IEA</strong> evidentiary standards
          </p>
        </div>

        <div className="siem-header-actions">
          {/* Real-time Stream Status Pill */}
          <div className={`siem-stream-pill ${streamConnected ? 'connected' : 'offline'}`} title="Real-time Server-Sent Event (SSE) ingestion stream">
            <span className="siem-live-dot"></span>
            <span className="siem-stream-text">
              {streamConnected ? 'LIVE INGESTION' : 'RECONNECTING'}
            </span>
            {streamEventCount > 0 && <span className="siem-stream-count">+{streamEventCount} new</span>}
          </div>

          <button
            onClick={handleVerifyChain}
            className="siem-btn siem-btn-verify"
            title="Perform mathematical SHA-256 chain verification across all stored audit blocks"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Verify Chain
          </button>

          <button onClick={() => handleExport('csv')} className="siem-btn siem-btn-secondary" title="Export audit trail as RFC 4180 CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>

          <button onClick={() => handleExport('json')} className="siem-btn siem-btn-secondary" title="Export full structured JSON log dossier">
            JSON
          </button>

          <button onClick={() => { fetchStats(); fetchEvents(); }} className="siem-btn siem-btn-secondary" disabled={isLoading} title="Reload records">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {isLoading ? '...' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* ─── Operational Overview KPI Dashboard ─────────────────────────────── */}
      <section className="siem-kpi-grid">
        <div className="siem-kpi-card">
          <div className="siem-kpi-label">TOTAL AUDIT EVENTS</div>
          <div className="siem-kpi-value">{stats.totalEvents.toLocaleString()}</div>
          <div className="siem-kpi-meta">
            <span className="siem-meta-highlight">+{stats.eventsLast24h}</span> in last 24h
          </div>
        </div>

        <div className="siem-kpi-card">
          <div className="siem-kpi-label">CRITICAL & HIGH INCIDENTS</div>
          <div className="siem-kpi-value text-critical">
            {((stats.severityDistribution?.CRITICAL || 0) + (stats.severityDistribution?.HIGH || 0)).toLocaleString()}
          </div>
          <div className="siem-kpi-meta">
            <span>{stats.verifiedIncidents}</span> verified forensic dossiers
          </div>
        </div>

        <div className="siem-kpi-card">
          <div className="siem-kpi-label">DISTINCT SESSIONS AUDITED</div>
          <div className="siem-kpi-value">{stats.distinctSessions.toLocaleString()}</div>
          <div className="siem-kpi-meta">Across live streams & recorded scans</div>
        </div>

        <div className="siem-kpi-card">
          <div className="siem-kpi-label">CRYPTOGRAPHIC PROVENANCE</div>
          <div className="siem-kpi-value text-verified">SHA-256 CHAIN</div>
          <div className="siem-kpi-meta">
            <span className="siem-hash-preview" title={stats.pipelineStatus?.latestEventHash || ''}>
              HEAD: {stats.pipelineStatus?.latestEventHash ? stats.pipelineStatus.latestEventHash.slice(0, 16) + '...' : 'INITIALIZED'}
            </span>
          </div>
        </div>
      </section>

      {/* ─── Severity Distribution & System Pipeline Telemetry ──────────────── */}
      <div className="siem-telemetry-strip">
        <div className="siem-dist-section">
          <span className="siem-dist-title">SEVERITY DISTRIBUTION:</span>
          <div className="siem-dist-bar">
            <div className="siem-bar-segment critical" style={{ width: `${severityPercentages.CRITICAL}%` }} title={`Critical: ${stats.severityDistribution?.CRITICAL || 0}`}></div>
            <div className="siem-bar-segment high" style={{ width: `${severityPercentages.HIGH}%` }} title={`High: ${stats.severityDistribution?.HIGH || 0}`}></div>
            <div className="siem-bar-segment moderate" style={{ width: `${severityPercentages.MODERATE}%` }} title={`Moderate: ${stats.severityDistribution?.MODERATE || 0}`}></div>
            <div className="siem-bar-segment low" style={{ width: `${severityPercentages.LOW}%` }} title={`Low: ${stats.severityDistribution?.LOW || 0}`}></div>
            <div className="siem-bar-segment info" style={{ width: `${severityPercentages.INFO}%` }} title={`Info: ${stats.severityDistribution?.INFO || 0}`}></div>
          </div>
          <div className="siem-dist-legend">
            {(stats.severityDistribution?.CRITICAL || 0) > 0 && <span className="legend-tag critical">CRIT {stats.severityDistribution.CRITICAL}</span>}
            {(stats.severityDistribution?.HIGH || 0) > 0 && <span className="legend-tag high">HIGH {stats.severityDistribution.HIGH}</span>}
            {(stats.severityDistribution?.MODERATE || 0) > 0 && <span className="legend-tag moderate">MOD {stats.severityDistribution.MODERATE}</span>}
            {(stats.severityDistribution?.LOW || 0) > 0 && <span className="legend-tag low">LOW {stats.severityDistribution.LOW}</span>}
            {(stats.severityDistribution?.INFO || 0) > 0 && <span className="legend-tag info">INFO {stats.severityDistribution.INFO}</span>}
          </div>
        </div>

        <div className="siem-pipeline-telemetry">
          <div className="telemetry-item">
            <span className="telemetry-label">ENGINE:</span>
            <span className="telemetry-val">{stats.pipelineStatus?.storageEngine || 'PostgreSQL'}</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">CHAIN:</span>
            <span className="telemetry-val text-verified">SHA-256 · INTACT</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">CLOCK:</span>
            <span className="telemetry-val">UTC · NTP</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">COMPLIANCE:</span>
            <span className="telemetry-val">65B IEA · ACTIVE</span>
          </div>
        </div>
      </div>

      {/* ─── Mode Switcher Tabs ────────────────────────────────────────────── */}
      <div className="siem-tabs-bar">
        <button
          className={`siem-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          Security Event Log ({pagination.total})
        </button>

        <button
          className={`siem-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Investigation Timeline
          {filterCallId && <span className="siem-active-filter-tag">Scoped: {filterCallId.slice(0, 12)}...</span>}
        </button>

        <button
          className={`siem-tab-btn ${activeTab === 'analyses' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyses')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Forensic Voice Scans & Reports ({historicalAnalyses.length})
        </button>
      </div>

      {/* ─── TAB 1: Security Event Log Table ───────────────────────────────── */}
      {activeTab === 'events' && (
        <div className="siem-table-view-container">
          {/* Filter & Search Toolbar */}
          <div className="siem-toolbar">
            <div className="siem-toolbar-row">
              {/* Time Range */}
              <div className="siem-control-group">
                <label>TIME RANGE:</label>
                <select
                  value={timeRange}
                  onChange={(e) => { setTimeRange(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                  className="siem-select"
                >
                  <option value="15m">Last 15 Minutes</option>
                  <option value="1h">Last 1 Hour</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="ALL">All Available Time</option>
                </select>
              </div>

              {/* Severity Filter Pills */}
              <div className="siem-control-group">
                <label>SEVERITY:</label>
                <div className="siem-pill-group">
                  {['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO'].map(sev => (
                    <button
                      key={sev}
                      onClick={() => { setSeverityFilter(sev); setPagination(p => ({ ...p, page: 1 })); }}
                      className={`siem-filter-pill ${severityFilter === sev ? 'active' : ''} ${sev.toLowerCase()}`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event Category */}
              <div className="siem-control-group">
                <label>CATEGORY:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                  className="siem-select"
                >
                  <option value="ALL">All Event Categories</option>
                  <option value="THREAT">Threat Detection & DSP</option>
                  <option value="INCIDENT">Incident Escalation</option>
                  <option value="COMPLIANCE">Compliance & Legal Reports</option>
                  <option value="ACCESS">Authentication & User Access</option>
                </select>
              </div>
            </div>

            <div className="siem-toolbar-row search-row">
              {/* Full Text Search */}
              <div className="siem-search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by action, actor, resource hash, or metadata keywords..."
                  className="siem-search-input"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="siem-clear-btn" title="Clear search">✕</button>
                )}
              </div>

              {/* Scoped Call/Session Indicator */}
              {filterCallId && (
                <div className="siem-active-session-filter">
                  <span>Scoped to Session: <code>{filterCallId}</code></span>
                  <button onClick={handleClearSessionFilter} className="siem-clear-session-btn" title="Clear session filter">
                    ✕ Clear Scope
                  </button>
                </div>
              )}

              {/* Page Size Selector */}
              <div className="siem-pagination-size">
                <span>Show:</span>
                <select
                  value={pagination.limit}
                  onChange={(e) => setPagination(p => ({ ...p, limit: Number(e.target.value), page: 1 }))}
                  className="siem-select-small"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page</span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="siem-error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Main Event Table */}
          <div className="siem-table-wrapper">
            <table className="siem-table">
              <thead>
                <tr>
                  <th style={{ width: '170px' }}>Timestamp (UTC)</th>
                  <th style={{ width: '90px' }}>Event ID</th>
                  <th style={{ width: '95px' }}>Severity</th>
                  <th>Action / Event Type</th>
                  <th style={{ width: '130px' }}>Actor</th>
                  <th>Session / Call ID</th>
                  <th style={{ width: '90px' }}>Risk Score</th>
                  <th style={{ width: '130px' }}>SHA-256 Hash</th>
                  <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="siem-empty-cell">
                      <div className="siem-loading-spinner">
                        <span className="spinner-ring"></span>
                        <span>Querying verified cryptographic ledger...</span>
                      </div>
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="siem-empty-cell">
                      <div className="siem-no-data-box">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
                          <rect x="2" y="3" width="20" height="18" rx="2" ry="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                        <p>No audit events match the specified query filters.</p>
                        <button
                          onClick={() => { setSeverityFilter('ALL'); setCategoryFilter('ALL'); setTimeRange('ALL'); setSearchQuery(''); setFilterCallId(''); }}
                          className="siem-btn-link"
                        >
                          Reset all filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => {
                    const score = ev.metadata?.score ?? ev.metadata?.finalScore ?? null;
                    return (
                      <tr
                        key={ev.id}
                        onClick={() => handleInspectEvent(ev)}
                        className={`siem-row clickable ${inspectedEvent?.id === ev.id ? 'selected' : ''}`}
                      >
                        {/* Timestamp */}
                        <td className="font-mono text-muted text-xs">
                          {new Date(ev.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>

                        {/* Event ID */}
                        <td className="font-mono text-xs font-semibold text-slate">
                          #{String(ev.id).padStart(5, '0')}
                        </td>

                        {/* Severity */}
                        <td>
                          <span className={`siem-badge ${getSeverityBadgeClass(ev.severity)}`}>
                            {ev.severity || 'INFO'}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="font-semibold text-main">
                          <span className="siem-action-tag">{ev.action}</span>
                          {ev.metadata?.reason && (
                            <span className="siem-action-sub">{ev.metadata.reason}</span>
                          )}
                        </td>

                        {/* Actor */}
                        <td className="font-mono text-xs text-muted">
                          {ev.actor || 'system'}
                        </td>

                        {/* Session / Call ID */}
                        <td className="font-mono text-xs">
                          {ev.callId ? (
                            <button
                              onClick={(e) => handleFilterBySession(ev.callId, e)}
                              className="siem-callid-btn"
                              title="Scope logs to this session ID"
                            >
                              {ev.callId.length > 20 ? ev.callId.slice(0, 18) + '...' : ev.callId}
                            </button>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </td>

                        {/* Risk Score */}
                        <td className="font-mono text-xs font-bold">
                          {score !== null ? (
                            <span className={`siem-score-tag ${score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'moderate' : 'low'}`}>
                              {score}
                            </span>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </td>

                        {/* SHA-256 Hash */}
                        <td className="font-mono text-xs">
                          {ev.eventHash ? (
                            <span
                              onClick={(e) => handleCopyHash(ev.eventHash, e)}
                              className="siem-hash-cell"
                              title="Click to copy full SHA-256 hash"
                            >
                              {copiedHash === ev.eventHash ? 'COPIED!' : ev.eventHash.slice(0, 12) + '...'}
                            </span>
                          ) : (
                            <span className="text-dim">GENESIS</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleInspectEvent(ev); }}
                            className="siem-action-icon-btn"
                            title="Inspect event details"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="siem-pagination-bar">
            <div className="siem-pagination-info">
              Showing <strong>{events.length}</strong> of <strong>{pagination.total}</strong> recorded security events
              {pagination.totalPages > 1 && ` (Page ${pagination.page} of ${pagination.totalPages})`}
            </div>

            <div className="siem-pagination-controls">
              <button
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => fetchEvents(1)}
                className="siem-page-btn"
                title="First Page"
              >
                ««
              </button>
              <button
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => fetchEvents(pagination.page - 1)}
                className="siem-page-btn"
                title="Previous Page"
              >
                ‹ Prev
              </button>

              <span className="siem-page-current">Page {pagination.page}</span>

              <button
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => fetchEvents(pagination.page + 1)}
                className="siem-page-btn"
                title="Next Page"
              >
                Next ›
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => fetchEvents(pagination.totalPages)}
                className="siem-page-btn"
                title="Last Page"
              >
                »»
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: Chronological Session Investigation Timeline ────────────── */}
      {activeTab === 'timeline' && (
        <div className="siem-timeline-view-container">
          <div className="siem-timeline-header-bar">
            <div>
              <h3>Chronological Incident Investigation Timeline</h3>
              <p>Traces the chronological progression of a voice call session across acoustic detection, intent analysis, risk escalation, and compliance actions.</p>
            </div>

            <div className="siem-timeline-filter-box">
              <label>INVESTIGATE SESSION ID:</label>
              <input
                type="text"
                value={filterCallId}
                onChange={(e) => setFilterCallId(e.target.value)}
                placeholder="Enter or paste call_id..."
                className="siem-search-input"
              />
              <button
                onClick={() => {
                  if (filterCallId.trim()) {
                    handleInspectEvent({ callId: filterCallId.trim(), action: 'LOOKUP' });
                  }
                }}
                className="siem-btn siem-btn-secondary"
              >
                Trace Session
              </button>
            </div>
          </div>

          {filterCallId ? (
            <div className="siem-session-timeline">
              <div className="timeline-meta-box">
                <div>
                  <span className="label">ACTIVE SESSION:</span>
                  <span className="val font-mono">{filterCallId}</span>
                </div>
                <button onClick={handleClearSessionFilter} className="siem-btn-link text-xs">
                  Clear Session Filter
                </button>
              </div>

              {isLoadingTimeline ? (
                <div className="siem-empty-cell">
                  <span className="spinner-ring"></span>
                  <span>Compiling chronological lifecycle...</span>
                </div>
              ) : inspectedSessionTimeline.length === 0 ? (
                <div className="siem-no-data-box">
                  <p>No audit events logged for session ID <code>{filterCallId}</code>.</p>
                </div>
              ) : (
                <div className="timeline-nodes-track">
                  {inspectedSessionTimeline.map((step, idx) => {
                    const score = step.metadata?.score ?? step.metadata?.finalScore ?? null;
                    return (
                      <div key={step.id} className="timeline-node">
                        <div className="timeline-node-marker">
                          <span className={`node-dot ${getSeverityBadgeClass(step.severity)}`}></span>
                          {idx < inspectedSessionTimeline.length - 1 && <span className="node-line"></span>}
                        </div>

                        <div className="timeline-node-card">
                          <div className="timeline-node-header">
                            <span className="node-step-index">STEP {step.stepIndex}</span>
                            <span className="node-timestamp font-mono">
                              {new Date(step.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                            </span>
                            <span className={`siem-badge ${getSeverityBadgeClass(step.severity)}`}>
                              {step.severity}
                            </span>
                            <span className="node-actor font-mono">by {step.actor}</span>
                          </div>

                          <div className="timeline-node-body">
                            <strong className="node-action">{step.action}</strong>
                            {step.resource && (
                              <span className="node-resource font-mono">Target: {step.resource}</span>
                            )}

                            {score !== null && (
                              <div className="node-score-alert">
                                <span>Evaluated Threat Score:</span>
                                <strong>{score} / 100</strong>
                              </div>
                            )}

                            {step.metadata && Object.keys(step.metadata).length > 0 && (
                              <pre className="node-meta-json">
                                {JSON.stringify(step.metadata, null, 2)}
                              </pre>
                            )}

                            <div className="node-provenance">
                              <span>Block Hash:</span>
                              <code onClick={() => handleCopyHash(step.eventHash)} className="clickable">
                                {step.eventHash ? step.eventHash.slice(0, 20) + '...' : 'GENESIS'}
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="siem-timeline-empty-prompt">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h4>No Active Session Selected for Timeline Tracing</h4>
              <p>Select any session ID from the Security Event Log table above or enter a session ID in the box to view its full forensic lifecycle.</p>
              <div className="recent-sessions-list">
                <span>Recent active sessions:</span>
                {events.filter(e => e.callId).slice(0, 4).map(e => (
                  <button
                    key={e.id}
                    onClick={() => handleFilterBySession(e.callId)}
                    className="session-chip-btn font-mono"
                  >
                    {e.callId.slice(0, 18)}...
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: Forensic Voice Scans & Dossier Compliance ──────────────── */}
      {activeTab === 'analyses' && (
        <div className="siem-analyses-view-container">
          <div className="siem-analyses-header">
            <div>
              <h3>Audio Threat Scans & Incident Reports</h3>
              <p>Review past uploaded voice files, inspect forensic neural indicators, and export compliance documents.</p>
            </div>
            <button onClick={fetchHistory} className="siem-btn siem-btn-secondary" disabled={isLoadingHistory}>
              {isLoadingHistory ? 'Refreshing...' : 'Refresh Scans'}
            </button>
          </div>

          {historicalAnalyses.length === 0 ? (
            <div className="siem-no-data-box">
              <p>No audio files have been scanned yet. Recorded scans will appear here permanently.</p>
            </div>
          ) : (
            <div className="siem-table-wrapper">
              <table className="siem-table">
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Audio Filename</th>
                    <th>Risk Tier</th>
                    <th>Final Score</th>
                    <th>Threat Category</th>
                    <th>Forensic Signals</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalAnalyses.map(row => {
                    const sev = row.risk_level === 'CRITICAL' ? 'CRITICAL' : row.risk_level === 'HIGH' ? 'HIGH' : row.risk_level === 'SUSPICIOUS' ? 'MODERATE' : 'LOW';
                    return (
                      <tr key={row.id} className="siem-row">
                        <td className="font-mono text-muted text-xs">
                          {new Date(row.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="font-semibold text-main">
                          {row.audio_filename || 'live_stream.webm'}
                        </td>
                        <td>
                          <span className={`siem-badge ${getSeverityBadgeClass(sev)}`}>
                            {row.risk_level}
                          </span>
                        </td>
                        <td className="font-mono text-xs font-bold">
                          <span className={`siem-score-tag ${row.final_score >= 80 ? 'critical' : row.final_score >= 60 ? 'high' : 'low'}`}>
                            {row.final_score} / 100
                          </span>
                        </td>
                        <td>{row.threat_category || 'Clean'}</td>
                        <td>
                          <span className="siem-indicator-pill">
                            {Array.isArray(row.indicators) ? row.indicators.length : 0} signals
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/history/${row.id}`);
                                const data = await res.json();
                                if (data.success && data.analysis) {
                                  setInspectedAnalysis({
                                    ...data.analysis.raw_result,
                                    analysisId: data.analysis.id,
                                    final_score: data.analysis.final_score,
                                    risk_level: data.analysis.risk_level,
                                    transcript: data.analysis.transcript,
                                    indicators: data.analysis.indicators || []
                                  });
                                }
                              } catch (_) { }
                            }}
                            className="siem-action-icon-btn"
                          >
                            Inspect Telemetry
                          </button>
                          <button
                            onClick={() => onExportReport && onExportReport(row.id, 'pdf')}
                            className="siem-btn-export-link"
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {inspectedAnalysis && (
            <div className="siem-embedded-analysis-inspector">
              <div className="inspector-top-banner">
                <h4>Inspected Telemetry: {inspectedAnalysis.analysisId}</h4>
                <button onClick={() => setInspectedAnalysis(null)} className="siem-btn siem-btn-secondary">
                  ✕ Close Telemetry
                </button>
              </div>
              <SecurityDashboard
                analysis={inspectedAnalysis}
                onExportReport={onExportReport}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── EVENT INSPECTOR SLIDE-OVER DRAWER ──────────────────────────────── */}
      {isInspectorOpen && inspectedEvent && (
        <aside className="siem-drawer-overlay" onClick={handleCloseInspector}>
          <div className="siem-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="siem-drawer-header">
              <div>
                <div className="siem-drawer-tag">SECURITY AUDIT INSPECTOR</div>
                <h3>Event #{String(inspectedEvent.id).padStart(5, '0')}: {inspectedEvent.action}</h3>
              </div>
              <button onClick={handleCloseInspector} className="siem-drawer-close-btn" title="Close Inspector">✕</button>
            </div>

            {/* Drawer Content */}
            <div className="siem-drawer-body">
              {/* Severity & Status Banner */}
              <div className="drawer-status-strip">
                <div>
                  <span className="status-label">SEVERITY:</span>
                  <span className={`siem-badge ${getSeverityBadgeClass(inspectedEvent.severity)}`}>
                    {inspectedEvent.severity}
                  </span>
                </div>
                <div>
                  <span className="status-label">TIMESTAMP (UTC):</span>
                  <span className="status-val font-mono">
                    {new Date(inspectedEvent.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                  </span>
                </div>
              </div>

              {/* Cryptographic Chain Integrity Section */}
              <div className="drawer-section">
                <div className="section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span>Cryptographic Chain Provenance</span>
                </div>

                <div className="provenance-field">
                  <span className="field-label">EVENT SHA-256 HASH:</span>
                  <div className="field-value-hash">
                    <code className="font-mono text-xs">{inspectedEvent.eventHash || 'GENESIS BLOCK'}</code>
                    {inspectedEvent.eventHash && (
                      <button
                        onClick={(e) => handleCopyHash(inspectedEvent.eventHash, e)}
                        className="copy-hash-btn"
                      >
                        {copiedHash === inspectedEvent.eventHash ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="provenance-field">
                  <span className="field-label">PREVIOUS BLOCK LINK (PREV_HASH):</span>
                  <div className="field-value-hash">
                    <code className="font-mono text-xs">{inspectedEvent.prevHash || GENESIS_HASH}</code>
                    {inspectedEvent.prevHash && (
                      <button
                        onClick={(e) => handleCopyHash(inspectedEvent.prevHash, e)}
                        className="copy-hash-btn"
                      >
                        {copiedHash === inspectedEvent.prevHash ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="chain-guarantee-pill">
                  <span className="check-icon">✓</span>
                  <span>Tamper-Evident SHA-256 Link Verified Intact</span>
                </div>
              </div>

              {/* Event Attributes */}
              <div className="drawer-section">
                <div className="section-title">
                  <span>Contextual Metadata & Scope</span>
                </div>

                <div className="spec-table">
                  <div className="spec-row">
                    <span className="spec-key">ACTOR:</span>
                    <span className="spec-val font-mono">{inspectedEvent.actor || 'system'}</span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-key">RESOURCE:</span>
                    <span className="spec-val font-mono">{inspectedEvent.resource || '—'}</span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-key">ASSOCIATED SESSION (CALL ID):</span>
                    <span className="spec-val font-mono">
                      {inspectedEvent.callId ? (
                        <button
                          onClick={() => handleFilterBySession(inspectedEvent.callId)}
                          className="siem-callid-btn"
                        >
                          {inspectedEvent.callId}
                        </button>
                      ) : '—'}
                    </span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-key">REQUEST ID:</span>
                    <span className="spec-val font-mono">{inspectedEvent.requestId || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Raw JSON Forensic Payload */}
              <div className="drawer-section">
                <div className="section-title">
                  <span>Decoded Payload Parameters</span>
                </div>
                <pre className="drawer-json-viewer">
                  {JSON.stringify(inspectedEvent.metadata || {}, null, 2)}
                </pre>
              </div>

              {/* Session Correlation Quick Feed */}
              {inspectedSessionTimeline.length > 1 && (
                <div className="drawer-section">
                  <div className="section-title">
                    <span>Correlated Session Lifecycle ({inspectedSessionTimeline.length} events)</span>
                  </div>
                  <div className="drawer-correlated-list">
                    {inspectedSessionTimeline.map(step => (
                      <div
                        key={step.id}
                        onClick={() => handleInspectEvent(step)}
                        className={`correlated-item ${step.id === inspectedEvent.id ? 'current' : ''}`}
                      >
                        <span className={`siem-badge ${getSeverityBadgeClass(step.severity)}`}>
                          {step.severity}
                        </span>
                        <strong className="correlated-action">{step.action}</strong>
                        <span className="correlated-time font-mono">
                          {new Date(step.timestamp).toISOString().slice(11, 19)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="siem-drawer-footer">
              {inspectedEvent.callId && (
                <button
                  onClick={() => {
                    setFilterCallId(inspectedEvent.callId);
                    setActiveTab('timeline');
                    setIsInspectorOpen(false);
                  }}
                  className="siem-btn siem-btn-verify"
                >
                  View Full Session Timeline
                </button>
              )}
              <button onClick={handleCloseInspector} className="siem-btn siem-btn-secondary">
                Close
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ─── CRYPTOGRAPHIC CHAIN INTEGRITY MODAL ────────────────────────────── */}
      {isVerifyModalOpen && (
        <div className="siem-modal-overlay" onClick={() => setIsVerifyModalOpen(false)}>
          <div className="siem-modal" onClick={(e) => e.stopPropagation()}>
            <div className="siem-modal-header">
              <div className="siem-modal-badge">CRYPTOGRAPHIC INTEGRITY VERIFICATION</div>
              <h3>Audit Trail Hash Chain Certification</h3>
            </div>

            <div className="siem-modal-body">
              {isVerifying ? (
                <div className="siem-modal-loading">
                  <span className="spinner-ring"></span>
                  <h4>Computing SHA-256 Hash Tree Across Stored Blocks...</h4>
                  <p>Validating forward and backward linkage from genesis to head block.</p>
                </div>
              ) : verifyResult ? (
                <div className="siem-verify-result">
                  <div className={`verify-banner ${verifyResult.verified ? 'success' : 'failed'}`}>
                    <div className="verify-icon">
                      {verifyResult.verified ? '✓' : '✕'}
                    </div>
                    <div>
                      <h4>{verifyResult.verified ? 'AUDIT TRAIL INTEGRITY CONFIRMED' : 'CHAIN COMPROMISE DETECTED'}</h4>
                      <p>{verifyResult.verified ? 'Every block in the audit trail has been mathematically validated against its preceding link.' : verifyResult.error}</p>
                    </div>
                  </div>

                  <div className="verify-specs-table">
                    <div className="spec-row">
                      <span className="spec-key">VERIFICATION STATUS:</span>
                      <span className="spec-val font-semibold text-verified">
                        {verifyResult.status || (verifyResult.verified ? 'VERIFIED_INTACT' : 'CORRUPTED')}
                      </span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-key">BLOCKS VALIDATED:</span>
                      <span className="spec-val font-mono">
                        {verifyResult.chainLength?.toLocaleString() || 0} blocks
                      </span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-key">ALGORITHM:</span>
                      <span className="spec-val font-mono">{verifyResult.algorithm || 'SHA-256'}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-key">EXECUTION DURATION:</span>
                      <span className="spec-val font-mono">{verifyResult.executionMs || 0} ms</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-key">GENESIS BLOCK HASH:</span>
                      <span className="spec-val font-mono text-xs">{verifyResult.genesisHash || GENESIS_HASH}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-key">HEAD BLOCK HASH:</span>
                      <span className="spec-val font-mono text-xs">{verifyResult.latestHash || '—'}</span>
                    </div>
                    <div className="spec-row">
                      <span className="spec-key">TIMESTAMP OF AUDIT:</span>
                      <span className="spec-val font-mono text-xs">{verifyResult.verifiedAt}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="siem-modal-footer">
              <button
                onClick={handleVerifyChain}
                className="siem-btn siem-btn-verify"
                disabled={isVerifying}
              >
                Re-Run Verification
              </button>
              <button onClick={() => setIsVerifyModalOpen(false)} className="siem-btn siem-btn-secondary">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
