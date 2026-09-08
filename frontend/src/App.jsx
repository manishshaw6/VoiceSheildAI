import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import './voxshield.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ScannerPage from './pages/ScannerPage';
import LiveShieldPage from './pages/LiveShieldPage';
import SpeakerGuardPage from './pages/SpeakerGuardPage';
import AuditVaultPage from './pages/AuditVaultPage';
import AboutPage from './pages/AboutPage';

function App() {
  const handleExportReport = async (analysisId) => {
    try {
      const res = await fetch(`/api/analysis/${analysisId}/report`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Report export failed');

      const blob = new Blob([JSON.stringify(data.report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VoiceShieldAI_Report_${analysisId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Could not export report: ' + err.message);
    }
  };

  return (
    <BrowserRouter>
      <div className="page-shell-pro">
        <Navbar />

        <main className="main-content-pro">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/scanner" element={<ScannerPage onExportReport={handleExportReport} />} />
            <Route path="/live" element={<LiveShieldPage />} />
            <Route path="/speaker-guard" element={<SpeakerGuardPage />} />
            <Route path="/history" element={<AuditVaultPage onExportReport={handleExportReport} />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
