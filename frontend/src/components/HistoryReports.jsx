import React, { useState, useEffect } from 'react';

export default function HistoryReports({ onSelectAnalysis, onExportReport }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success) {
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setStatusMsg('Failed to load history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this analysis record from audit history?')) return;

    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleInspect = async (id) => {
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      if (data.success && data.analysis) {
        const raw = data.analysis.raw_result || {};
        onSelectAnalysis({
          ...raw,
          analysisId: data.analysis.id,
          final_score: data.analysis.final_score,
          risk_level: data.analysis.risk_level,
          transcript: data.analysis.transcript,
          indicators: data.analysis.indicators || []
        });
      }
    } catch (err) {
      console.error('Inspect error:', err);
    }
  };

  const getLevelColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return '#ff3b5c';
      case 'HIGH': return '#ff8c00';
      case 'MODERATE': return '#ffd700';
      default: return '#00e5a3';
    }
  };

  return (
    <div className="history-panel-container">
      <div className="history-header">
        <div>
          <div className="analyzer-badge">SECURITY AUDIT LOG</div>
          <h3>Analysis History & Forensic Reports</h3>
          <p>Review past scan evaluations, examine forensic evidence, or export compliance reports.</p>
        </div>
        <button onClick={fetchHistory} className="refresh-btn" disabled={isLoading}>
          🔄 {isLoading ? 'Refreshing...' : 'Refresh Records'}
        </button>
      </div>

      {statusMsg && <div className="status-banner">{statusMsg}</div>}

      {history.length === 0 ? (
        <div className="empty-history-box">
          <div className="empty-icon">🗄️</div>
          <h4>No Security Audit Logs Recorded Yet</h4>
          <p>Scanned audio and live stream sessions will be permanently logged here.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>File / Source</th>
                <th>Risk Level</th>
                <th>Score</th>
                <th>Category</th>
                <th>Indicators</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map(row => {
                const color = getLevelColor(row.risk_level);
                return (
                  <tr key={row.id} onClick={() => handleInspect(row.id)} className="clickable-row">
                    <td className="time-col">{new Date(row.timestamp).toLocaleString()}</td>
                    <td className="file-col">
                      <strong>{row.audio_filename || 'live_stream.webm'}</strong>
                    </td>
                    <td>
                      <span className="table-risk-tag" style={{ color, borderColor: color, backgroundColor: `${color}18` }}>
                        {row.risk_level}
                      </span>
                    </td>
                    <td>
                      <span className="table-score" style={{ color }}>
                        {row.final_score} / 100
                      </span>
                    </td>
                    <td className="cat-col">{row.threat_category || 'Clean'}</td>
                    <td>
                      <span className="indicator-count-badge">
                        {Array.isArray(row.indicators) ? row.indicators.length : 0} signals
                      </span>
                    </td>
                    <td className="actions-col">
                      <button
                        className="table-btn inspect-btn"
                        onClick={(e) => { e.stopPropagation(); handleInspect(row.id); }}
                        title="View Full Dashboard"
                      >
                        👁️ Inspect
                      </button>
                      <button
                        className="table-btn report-btn"
                        onClick={(e) => { e.stopPropagation(); onExportReport(row.id); }}
                        title="Download Security Report"
                      >
                        📄 Report
                      </button>
                      <button
                        className="table-btn delete-btn"
                        onClick={(e) => handleDelete(row.id, e)}
                        title="Delete Record"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
