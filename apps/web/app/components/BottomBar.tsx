import { useCallback, useState } from 'react';
import type { ProjectWorkspaceStatus } from './StorageWorkspaceStatusModel';
import { ActionButton } from './ui/ActionButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

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
    <div className="bottom-bar" role="toolbar" aria-label="Editor actions">
      <div className="bottom-history-group" aria-label="Document history">
        <ActionButton
          onClick={onNewBlank}
          aria-label="Create new project"
          title="Create new project"
          variant="quiet"
          className="bottom-command"
        >
          NEW
        </ActionButton>
        <ActionButton
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Cmd+Z)"
          variant="quiet"
          className="bottom-command bottom-icon-command"
        >
          <span aria-hidden="true">↩</span>
          {canUndo && undoCount > 0 ? (
            <span className="bottom-command-badge" aria-hidden="true">
              {undoCount}
            </span>
          ) : null}
        </ActionButton>
        <ActionButton
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Cmd+Shift+Z)"
          variant="quiet"
          className="bottom-command bottom-icon-command"
        >
          <span aria-hidden="true">↪</span>
        </ActionButton>
        <ActionButton
          className="bottom-command rand-btn"
          onClick={onRandomize}
          aria-label="Randomize document"
          title="Randomize document"
          variant="quiet"
        >
          RANDOM
        </ActionButton>
      </div>

      <div className="bottom-secondary-group">
        <div className="bottom-file-group" aria-label="File actions">
          <ActionButton
            onClick={onOpenDocument}
            aria-label="Open document file"
            title="Open .artifact or .artifact.json"
            variant="quiet"
            className="bottom-command bottom-file-action"
          >
            OPEN
          </ActionButton>
          <ShareMenu
            copied={copied}
            onCopyLink={handleCopyLink}
            onSaveDocument={onSaveDocument}
            onSaveProjectPackage={onSaveProjectPackage}
          />
        </div>
      </div>

      <div className="bottom-primary-group">
        <MoreMenu
          copied={copied}
          onCopyLink={handleCopyLink}
          onOpenDocument={onOpenDocument}
          onSaveDocument={onSaveDocument}
          onSaveProjectPackage={onSaveProjectPackage}
        />
        <ProjectWorkspaceButton status={projectWorkspaceStatus} onClick={onProjectsToggle} />
        <ActionButton className="export-btn" onClick={onExport} disabled={exportBusy} variant="primary">
          {exportBusy ? '…' : 'EXPORT'}
        </ActionButton>
      </div>
    </div>
  );
}

function MoreMenu({
  copied,
  onCopyLink,
  onOpenDocument,
  onSaveDocument,
  onSaveProjectPackage,
}: {
  copied: boolean;
  onCopyLink: () => void;
  onOpenDocument: () => void;
  onSaveDocument: () => void;
  onSaveProjectPackage: (fontEmbeddingMode?: 'license-aware' | 'explicit-font-files') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          aria-label="More editor actions"
          title="Open, share, or download editable files"
          variant="quiet"
          className="bottom-command bottom-more-menu-trigger"
        >
          MORE
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="bottom-share-menu">
        <DropdownMenuItem onSelect={onOpenDocument}>Open document</DropdownMenuItem>
        <DropdownMenuSeparator className="artifact-dropdown-menu-separator" />
        <ShareMenuItems
          copied={copied}
          onCopyLink={onCopyLink}
          onSaveDocument={onSaveDocument}
          onSaveProjectPackage={onSaveProjectPackage}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShareMenu({
  copied,
  onCopyLink,
  onSaveDocument,
  onSaveProjectPackage,
}: {
  copied: boolean;
  onCopyLink: () => void;
  onSaveDocument: () => void;
  onSaveProjectPackage: (fontEmbeddingMode?: 'license-aware' | 'explicit-font-files') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          aria-label="Share link or download editable files"
          title="Copy an editor link or download editable files"
          variant="quiet"
          className="bottom-command share-menu-trigger bottom-file-action"
        >
          SHARE
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="bottom-share-menu">
        <ShareMenuItems
          copied={copied}
          onCopyLink={onCopyLink}
          onSaveDocument={onSaveDocument}
          onSaveProjectPackage={onSaveProjectPackage}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShareMenuItems({
  copied,
  onCopyLink,
  onSaveDocument,
  onSaveProjectPackage,
}: {
  copied: boolean;
  onCopyLink: () => void;
  onSaveDocument: () => void;
  onSaveProjectPackage: (fontEmbeddingMode?: 'license-aware' | 'explicit-font-files') => void;
}) {
  return (
    <>
      <DropdownMenuLabel>Share link</DropdownMenuLabel>
      <DropdownMenuItem onSelect={onCopyLink}>{copied ? 'Copied editor link' : 'Copy editor link'}</DropdownMenuItem>
      <DropdownMenuSeparator className="artifact-dropdown-menu-separator" />
      <DropdownMenuLabel>Download editable copy</DropdownMenuLabel>
      <DropdownMenuItem onSelect={onSaveDocument}>Download document file</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSaveProjectPackage('license-aware')}>
        Download package + assets
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSaveProjectPackage('explicit-font-files')}>
        Download package + assets + fonts
      </DropdownMenuItem>
    </>
  );
}

function ProjectWorkspaceButton({ status, onClick }: { status: ProjectWorkspaceStatus; onClick: () => void }) {
  return (
    <ActionButton
      onClick={onClick}
      variant="quiet"
      className={`bottom-command project-workspace-button project-workspace-button-${status.tone}`}
      title={`${status.title}. Local projects are the save workspace.`}
    >
      <span>PROJECTS</span>
      <span className="project-workspace-dot" aria-hidden="true" />
      {status.badge && <span className="project-workspace-badge">{status.badge}</span>}
    </ActionButton>
  );
}
