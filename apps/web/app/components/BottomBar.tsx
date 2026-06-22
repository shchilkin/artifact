import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import type { ProjectWorkspaceStatus } from './StorageWorkspaceStatusModel';
import { ActionButton } from './ui/ActionButton';

interface Props {
  onNewBlank: () => void;
  onRandomize: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  onProjectsToggle: () => void;
  onCopyLink: () => void;
  onOpenDocument: () => void;
  onSaveDocument: () => void;
  onSaveProjectPackage: (fontEmbeddingMode?: 'license-aware' | 'explicit-font-files') => void;
  onExport: () => void;
  exportBusy: boolean;
  projectWorkspaceStatus: ProjectWorkspaceStatus;
}

export function BottomBar({
  onNewBlank,
  onRandomize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  onCopyLink,
  onOpenDocument,
  onSaveDocument,
  onSaveProjectPackage,
  onProjectsToggle,
  onExport,
  exportBusy,
  projectWorkspaceStatus,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(() => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [onCopyLink]);

  return (
    <div className="bottom-bar">
      <div className="bottom-history-group" aria-label="Document history and reset">
        <ActionButton onClick={onNewBlank} aria-label="Create new project" title="Create new project" variant="quiet">
          NEW
        </ActionButton>
        <ActionButton onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Cmd+Z)" variant="quiet">
          {undoButtonLabel(canUndo, undoCount)}
        </ActionButton>
        <ActionButton onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Cmd+Shift+Z)" variant="quiet">
          ↪
        </ActionButton>
        <ActionButton className="rand-btn" onClick={onRandomize} variant="quiet">
          RAND
        </ActionButton>
      </div>

      <div className="bottom-secondary-group">
        <div className="bottom-file-group" aria-label="File actions">
          <ActionButton
            onClick={onOpenDocument}
            aria-label="Open document file"
            title="Open .artifact or .artifact.json"
            variant="quiet"
          >
            OPEN
          </ActionButton>
          <ActionButton
            onClick={onSaveDocument}
            aria-label="Save document file"
            title="Save .artifact.json"
            variant="quiet"
          >
            SAVE
          </ActionButton>
          <CopyLinkButton copied={copied} onCopyLink={handleCopyLink} />
        </div>

        <div className="bottom-package-group" aria-label="Package actions">
          <ActionButton
            onClick={() => onSaveProjectPackage('license-aware')}
            aria-label="Save editable project package"
            title="Save editable .artifact project package. Open-license Google fonts are included; unknown local fonts stay metadata-only."
            variant="quiet"
          >
            PKG
          </ActionButton>
          <ActionButton
            onClick={() => onSaveProjectPackage('explicit-font-files')}
            aria-label="Save project package with all imported font files"
            title="Save .artifact with all imported font files. Only use this when you have rights to distribute those files."
            variant="quiet"
          >
            PKG FONTS
          </ActionButton>
        </div>
      </div>

      <div className="bottom-primary-group">
        <ProjectWorkspaceButton status={projectWorkspaceStatus} onClick={onProjectsToggle} />
        <ActionButton className="export-btn" onClick={onExport} disabled={exportBusy} variant="primary">
          {exportBusy ? '…' : 'EXPORT'}
        </ActionButton>
      </div>
    </div>
  );
}

function ProjectWorkspaceButton({ status, onClick }: { status: ProjectWorkspaceStatus; onClick: () => void }) {
  return (
    <ActionButton
      onClick={onClick}
      variant="quiet"
      className={`project-workspace-button project-workspace-button-${status.tone}`}
      title={status.title}
    >
      <span>PROJECTS</span>
      <span className="project-workspace-dot" aria-hidden="true" />
      {status.badge && <span className="project-workspace-badge">{status.badge}</span>}
    </ActionButton>
  );
}

function undoButtonLabel(canUndo: boolean, undoCount: number) {
  return canUndo && undoCount > 0 ? `↩ ${undoCount}` : '↩';
}

function CopyLinkButton({ copied, onCopyLink }: { copied: boolean; onCopyLink: () => void }) {
  return (
    <ActionButton onClick={onCopyLink} aria-label="Copy link to current state" variant="quiet">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? 'check' : 'link'}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          style={{ display: 'inline-block' }}
        >
          {copied ? '✓' : 'LINK'}
        </motion.span>
      </AnimatePresence>
    </ActionButton>
  );
}
