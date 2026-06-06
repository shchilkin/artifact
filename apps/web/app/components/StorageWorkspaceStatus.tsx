import type { ReactNode } from 'react';

import type { BrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import { type StatusPillModel, warningPills, workspaceWarnings } from './StorageWorkspaceStatusModel';

interface StorageWarningStripProps {
  status: BrowserStorageStatus;
  storageError: string | null;
}

export function StorageWarningStrip({ status, storageError }: StorageWarningStripProps) {
  const pills = warningPills(status, storageError);
  const warnings = workspaceWarnings(status, storageError);
  if (pills.length === 0 && warnings.length === 0) return null;

  return (
    <section className="storage-warning-strip" aria-label="Local workspace warning">
      <div className="storage-warning-strip__main" role="status">
        {pills.map((pill) => (
          <StatusPill key={pill.id} tone={pill.tone}>
            {pill.label}
          </StatusPill>
        ))}
      </div>
      {warnings.length > 0 && <div className="storage-warning-strip__warnings">{warnings.join(' / ')}</div>}
    </section>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: StatusPillModel['tone'] }) {
  return <span className={`storage-status-pill storage-status-pill-${tone}`}>{children}</span>;
}
