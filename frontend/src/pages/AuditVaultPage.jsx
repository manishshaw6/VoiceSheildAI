import React from 'react';
import EnterpriseAuditConsole from '../components/EnterpriseAuditConsole';

export default function AuditVaultPage({ onExportReport }) {
  return (
    <div className="siem-page-shell">
      <EnterpriseAuditConsole onExportReport={onExportReport} />
    </div>
  );
}
