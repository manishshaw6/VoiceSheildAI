import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import './voxshield.css';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ScannerPage from './pages/ScannerPage';
import LiveShieldPage from './pages/LiveShieldPage';
import SpeakerGuardPage from './pages/SpeakerGuardPage';
import AuditVaultPage from './pages/AuditVaultPage';
import AboutPage from './pages/AboutPage';
import ApiKeyPortalPage from './pages/ApiKeyPortalPage';
import { generateCyberCrimePdfReport } from './services/pdfReportGenerator';

import { AuthProvider } from './context/AuthContext';
import ReportVerificationPage from './pages/ReportVerificationPage';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('voxshield_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('voxshield_sidebar_width');
      return saved ? parseInt(saved, 10) : 260;
    } catch {
      return 260;
    }
  });

  const [isResizing, setIsResizing] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('voxshield_sidebar_collapsed', next.toString());
      } catch (_) {}
      return next;
    });
  };

  // Keyboard shortcut Ctrl + B to toggle sidebar
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const handleExportReport = async (analysisId, format = 'pdf') => {
    try {
      const res = await fetch(`/api/analysis/${analysisId}/report`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Report export failed');

      const report = data.report;

      if (format === 'pdf') {
        window.open(`/api/v1/reports/${analysisId}/pdf`, '_blank');
      } else if (format === 'markdown') {
        const md = generateMarkdownReport(report);
        const blob = new Blob([md], { type: 'text/markdown' });
        downloadBlob(blob, `VoxShieldAI_Report_${analysisId}.md`);
      } else {
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `VoxShieldAI_Report_${analysisId}.json`);
      }
    } catch (err) {
      alert('Could not export report: ' + err.message);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateMarkdownReport = (r) => {
    const lines = [
      `# ${r.title || 'VoxShieldAI Forensic Voice Threat Report'}`,
      '',
      `**Call ID:** ${r.callId}`,
      `**Generated:** ${r.generatedAt}`,
      `**Analysis Timestamp:** ${r.timestamp}`,
      '',
      '---',
      '',
      '## Risk Assessment',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Risk Score | ${r.risk?.score ?? 'N/A'} / 100 |`,
      `| Risk Level | ${r.risk?.level ?? 'N/A'} |`,
      `| Threat Category | ${r.risk?.threatCategory ?? 'N/A'} |`,
      `| Voice Clone Suspicion | ${r.risk?.voiceCloneSuspicion ? 'YES (HIGH RISK)' : 'No'} |`,
      '',
      '## Voice Authenticity Evidence',
      '',
      `- **Provider:** ${r.authenticityEvidence?.provider ?? 'N/A'}`,
      `- **Classification:** ${r.authenticityEvidence?.classification ?? 'N/A'}`,
      `- **Synthetic Probability:** ${r.authenticityEvidence?.syntheticProbability ?? 'N/A'}`,
      '',
      '## Speaker Verification',
      '',
      `- **Status:** ${r.speakerEvidence?.status ?? 'N/A'}`,
      `- **Enrolled Speaker:** ${r.speakerEvidence?.enrolledSpeaker ?? 'N/A'}`,
      `- **Acoustic Similarity:** ${r.speakerEvidence?.similarityPercentage ?? 'N/A'}`,
      '',
      '## Conversation Intelligence',
      '',
      `- **Scam Probability:** ${r.conversationIntelligence?.scamProbability ?? 'N/A'}`,
      `- **Category:** ${r.conversationIntelligence?.category ?? 'N/A'}`,
      '',
      '### Transcript Excerpt',
      '',
      `> ${r.transcriptExcerpt || 'No transcript available.'}`,
      '',
    ];

    if (r.suspiciousTranscriptPhrases?.length) {
      lines.push('## Suspicious Phrases Detected', '');
      for (const p of r.suspiciousTranscriptPhrases) {
        lines.push(`- **${p.type}** (${p.severity}): _"${p.evidence}"_`);
      }
      lines.push('');
    }

    if (r.risk?.reasonsFlagged?.length) {
      lines.push('## Explainable Risk Factors', '');
      for (const reason of r.risk.reasonsFlagged) {
        lines.push(`- ${reason}`);
      }
      lines.push('');
    }

    lines.push(
      '## Intervention Taken',
      '',
      `- **Policy Actions:** ${r.interventionTaken?.policyActions?.join(', ') ?? 'N/A'}`,
      `- **Recommendation:** ${r.interventionTaken?.recommendation ?? 'N/A'}`,
      `- **Blocked Sensitive Action:** ${r.interventionTaken?.blockSensitiveAction ? 'Yes' : 'No'}`,
      `- **Incident Created:** ${r.interventionTaken?.incidentCreated ? 'Yes' : 'No'}`,
      '',
      '## Forensic Evidence',
      '',
      `- **SHA-256 Hash:** \`${r.evidenceHashes?.sha256 ?? 'N/A'}\``,
      `- **Original Filename:** ${r.evidenceHashes?.originalFilename ?? 'N/A'}`,
      `- **Duration:** ${r.evidenceHashes?.durationSeconds ?? 'N/A'}s`,
      '',
      '---',
      '_Report generated by VoxShieldAI — Multi-Signal Voice Threat Intelligence Platform_',
      ''
    );

    return lines.join('\n');
  };

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className={`page-shell-pro ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'} ${isResizing ? 'is-resizing' : ''}`}>
          <Navbar
            onToggleSidebar={toggleSidebar}
            isSidebarCollapsed={sidebarCollapsed}
          />

          <div className="app-workspace-layout">
            <Sidebar
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebar}
              width={sidebarWidth}
              setWidth={setSidebarWidth}
              isResizing={isResizing}
              setIsResizing={setIsResizing}
            />

            <div className="app-main-viewport">
              <main className="main-content-pro">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/scanner" element={<ScannerPage onExportReport={handleExportReport} />} />
                  <Route path="/live" element={<LiveShieldPage onExportReport={handleExportReport} />} />
                  <Route path="/speaker-guard" element={<SpeakerGuardPage />} />
                  <Route path="/history" element={<AuditVaultPage onExportReport={handleExportReport} />} />
                  <Route path="/api-keys" element={<ApiKeyPortalPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/reports/:id/verify" element={<ReportVerificationPage />} />
                  <Route path="/reports/verify/:id" element={<ReportVerificationPage />} />
                </Routes>
              </main>

              <Footer />
            </div>
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
