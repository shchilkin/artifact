import { useCallback, useState } from 'react';
import { EditorCommandBar } from './editor-workflow/EditorCommandBar';
import { EditorCommandGroup } from './editor-workflow/EditorCommandGroup';
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
    <EditorCommandBar className="bottom-bar" label="Editor actions">
      <EditorCommandGroup className="bottom-history-group" label="Document history">
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
      </EditorCommandGroup>

      <EditorCommandGroup className="bottom-secondary-group" label="File actions">
        <div className="bottom-file-group">
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
      </EditorCommandGroup>

      <EditorCommandGroup className="bottom-primary-group" label="Project and export actions">
        <MoreMenu
          copied={copied}
          onCopyLink={handleCopyLink}
          onOpenDocument={onOpenDocument}
          onSaveDocument={onSaveDocument}
          onSaveProjectPackage={onSaveProjectPackage}
        />
        <ProjectWorkspaceButton status={projectWorkspaceStatus} onClick={onProjectsToggle} />
        <ActionButton
          className="export-btn"
          onClick={onExport}
          loading={exportBusy}
          variant="primary"
          aria-label={exportBusy ? 'Exporting artwork' : 'Export artwork'}
        >
          {exportBusy ? '…' : 'EXPORT'}
        </ActionButton>
      </EditorCommandGroup>
    </EditorCommandBar>
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
      aria-label={`Projects. ${status.title}${status.badge ? `. ${status.badge}` : ''}`}
      title={`${status.title}. Local projects are the save workspace.`}
    >
      <span>PROJECTS</span>
      <span className="project-workspace-dot" aria-hidden="true" />
      {status.badge && <span className="project-workspace-badge">{status.badge}</span>}
    </ActionButton>
  );
}
