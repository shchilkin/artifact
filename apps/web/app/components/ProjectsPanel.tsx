import { type CSSProperties, type KeyboardEvent, useState } from 'react';

import type { BrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import type { SavedProject } from '../utils/projectLibrary';
import { formatBytes, projectSizeBytes } from '../utils/storageStatus';
import { type WorkspaceStatusRow, workspaceStatusRows, workspaceWarnings } from './StorageWorkspaceStatusModel';
import { ActionButton } from './ui/ActionButton';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';

interface Props {
  projects: SavedProject[];
  recoveryDraft: SavedProject | null;
  storageStatus: BrowserStorageStatus;
  storageError: string | null;
  maxProjects: number;
  onSave: (name: string) => void;
  onLoad: (project: SavedProject) => void;
  onDelete: (id: string) => void;
  onDeleteRecoveryDraft: () => void;
  onNewBlank: () => void;
  onClose: () => void;
}

const FALLBACK_ACTIVE_WORK_ROW = {
  id: 'active-work',
  tone: 'muted',
  label: 'Active work',
  value: 'Unavailable',
} satisfies WorkspaceStatusRow;

const FALLBACK_RECOVERY_ROW = {
  id: 'recovery',
  tone: 'muted',
  label: 'Recovery copy',
  value: 'None',
} satisfies WorkspaceStatusRow;

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'saved locally';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ProjectsPanel({
  projects,
  recoveryDraft,
  storageStatus,
  storageError,
  maxProjects,
  onSave,
  onLoad,
  onDelete,
  onDeleteRecoveryDraft,
  onNewBlank,
  onClose,
}: Props) {
  const hasSavedItems = projects.length > 0 || recoveryDraft !== null;
  const countClassName = projectCountClassName(projects.length, maxProjects);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Sheet open onOpenChange={handleOpenChange}>
      <SheetContent className="library-panel" style={{ '--artifact-sheet-width': '360px' } as CSSProperties}>
        <SheetHeader className="flex items-center justify-between px-4 min-h-11 border-b border-border shrink-0">
          <div>
            <SheetTitle className="text-[10px] tracking-[2.5px] text-accent font-semibold">PROJECTS</SheetTitle>
            <SheetDescription className="sr-only">
              Save, load, delete, or start local Artifact projects.
            </SheetDescription>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={countClassName}>
              {projects.length} / {maxProjects}
            </span>
            <SheetClose asChild>
              <ActionButton aria-label="Close projects" variant="quiet">
                x
              </ActionButton>
            </SheetClose>
          </div>
        </SheetHeader>
        <ProjectSaveForm projectCount={projects.length} onSave={onSave} />
        <ProjectWorkspaceSummary
          projects={projects}
          storageStatus={storageStatus}
          storageError={storageError}
          maxProjects={maxProjects}
          onNewBlank={onNewBlank}
        />
        <ProjectsList
          hasSavedItems={hasSavedItems}
          projects={projects}
          recoveryDraft={recoveryDraft}
          onDelete={onDelete}
          onDeleteRecoveryDraft={onDeleteRecoveryDraft}
          onLoad={onLoad}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProjectSaveForm({ projectCount, onSave }: { projectCount: number; onSave: (name: string) => void }) {
  const [name, setName] = useState('');

  const handleSave = () => {
    onSave(projectSaveName(name, projectCount));
    setName('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleSave();
  };

  return (
    <div className="library-save-form">
      <label htmlFor="project-name-input" className="sr-only">
        Snapshot name
      </label>
      <input
        id="project-name-input"
        type="text"
        placeholder="Snapshot name..."
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        className="library-save-input"
      />
      <ActionButton className="library-save-button" onClick={handleSave} variant="primary">
        SAVE SNAPSHOT
      </ActionButton>
    </div>
  );
}

function ProjectWorkspaceSummary({
  projects,
  storageStatus,
  storageError,
  maxProjects,
  onNewBlank,
}: {
  projects: SavedProject[];
  storageStatus: BrowserStorageStatus;
  storageError: string | null;
  maxProjects: number;
  onNewBlank: () => void;
}) {
  const totalProjectBytes = projects.reduce((total, project) => total + projectSizeBytes(project), 0);
  const statusRows = workspaceStatusRows(storageStatus, storageError);
  const activeWorkRow = getStatusRow(statusRows, 'active-work', FALLBACK_ACTIVE_WORK_ROW);
  const recoveryRow = getStatusRow(statusRows, 'recovery', FALLBACK_RECOVERY_ROW);
  const detailRows = statusRows.filter(isWorkspaceDetailRow);

  return (
    <div className="project-workspace-summary px-4 py-3 border-b border-border shrink-0">
      <div className="project-status-stack">
        <ProjectStatusLine row={activeWorkRow} />
        <RecoveryStatusLine row={recoveryRow} />
      </div>
      <WorkspaceWarnings storageStatus={storageStatus} storageError={storageError} />
      <details className="project-storage-details">
        <summary>Storage details</summary>
        <div className="project-workspace-summary__rows">
          {detailRows.map((row) => (
            <ProjectDetailRow key={row.id} row={row} />
          ))}
          <ProjectDetailRow row={recoveryRow} />
          <ProjectPlainDetailRow label="Saved snapshots" value={`${projects.length} / ${maxProjects}`} />
          <ProjectPlainDetailRow label="Project data" value={formatBytes(totalProjectBytes)} />
        </div>
      </details>
      <ActionButton
        className="project-new-blank-action w-full mt-2"
        onClick={onNewBlank}
        aria-label="Create new project from projects"
        variant="quiet"
      >
        CREATE NEW PROJECT
      </ActionButton>
    </div>
  );
}

function projectCountClassName(projectCount: number, maxProjects: number) {
  const toneClassName = projectCount >= maxProjects - 2 ? 'text-accent' : 'text-dim';
  return `text-[9px] tracking-[0.5px] ${toneClassName}`;
}

function projectSaveName(name: string, projectCount: number) {
  const trimmed = name.trim();
  if (trimmed.length > 0) return trimmed;
  return `Snapshot ${projectCount + 1}`;
}

function getStatusRow(rows: WorkspaceStatusRow[], id: string, fallback: WorkspaceStatusRow) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) return row;
  return fallback;
}

function isWorkspaceDetailRow(row: WorkspaceStatusRow) {
  return row.id !== 'active-work' && row.id !== 'recovery';
}

function ProjectStatusLine({ row }: { row: Pick<WorkspaceStatusRow, 'tone' | 'label' | 'value'> }) {
  return (
    <div className={`project-status-line project-status-line-${row.tone}`}>
      <span className="project-status-line__label">{row.label}</span>
      <span className="project-status-line__value">{row.value}</span>
    </div>
  );
}

function RecoveryStatusLine({ row }: { row: WorkspaceStatusRow }) {
  if (row.tone !== 'warning') return null;
  return <ProjectStatusLine row={{ ...row, value: 'Available' }} />;
}

function ProjectDetailRow({ row }: { row: WorkspaceStatusRow }) {
  return (
    <div className="project-workspace-summary__row">
      <span>{row.label}</span>
      <span className={`project-workspace-summary__value project-workspace-summary__value-${row.tone}`}>
        {row.value}
      </span>
    </div>
  );
}

function ProjectPlainDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="project-workspace-summary__row">
      <span>{label}</span>
      <span className="project-workspace-summary__value">{value}</span>
    </div>
  );
}

function WorkspaceWarnings({
  storageStatus,
  storageError,
}: {
  storageStatus: BrowserStorageStatus;
  storageError: string | null;
}) {
  const warnings = workspaceWarnings(storageStatus, storageError);
  if (warnings.length === 0) return null;
  return (
    <div className="project-workspace-summary__warnings" role="status">
      {warnings.map((warning) => (
        <span key={warning}>{warning}</span>
      ))}
    </div>
  );
}

function ProjectsList({
  hasSavedItems,
  projects,
  recoveryDraft,
  onDelete,
  onDeleteRecoveryDraft,
  onLoad,
}: {
  hasSavedItems: boolean;
  projects: SavedProject[];
  recoveryDraft: SavedProject | null;
  onDelete: (id: string) => void;
  onDeleteRecoveryDraft: () => void;
  onLoad: (project: SavedProject) => void;
}) {
  if (!hasSavedItems) return <ProjectsEmptyState />;
  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
      <RecoveryDraftCard recoveryDraft={recoveryDraft} onDeleteRecoveryDraft={onDeleteRecoveryDraft} onLoad={onLoad} />
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} onDelete={onDelete} onLoad={onLoad} />
      ))}
    </div>
  );
}

function ProjectsEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-dim text-[11px] p-5 text-center">
      <div className="text-[32px] text-accent opacity-30 mb-2">▣</div>
      <p>No projects saved yet.</p>
      <p>Save a snapshot to come back to this document later.</p>
    </div>
  );
}

function RecoveryDraftCard({
  recoveryDraft,
  onDeleteRecoveryDraft,
  onLoad,
}: {
  recoveryDraft: SavedProject | null;
  onDeleteRecoveryDraft: () => void;
  onLoad: (project: SavedProject) => void;
}) {
  if (!recoveryDraft) return null;
  return (
    <div className="library-card library-card-draft flex gap-2.5 p-2.5 border rounded transition-colors">
      <ProjectCardImage project={recoveryDraft} />
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <ProjectCardMeta project={recoveryDraft} eyebrow="RECOVERY COPY" />
        <ProjectCardActions
          project={recoveryDraft}
          deleteVariant="quiet"
          loadVariant="quiet"
          onDelete={onDeleteRecoveryDraft}
          onLoad={() => onLoad(recoveryDraft)}
        />
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
  onLoad,
}: {
  project: SavedProject;
  onDelete: (id: string) => void;
  onLoad: (project: SavedProject) => void;
}) {
  return (
    <div className="library-card flex gap-2.5 p-2.5 border border-border rounded bg-sidebar-raised/50 transition-colors hover:border-accent/30">
      <ProjectCardImage project={project} />
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <ProjectCardMeta project={project} />
        <ProjectCardActions
          project={project}
          deleteVariant="quiet"
          loadVariant="quiet"
          onDelete={() => onDelete(project.id)}
          onLoad={() => onLoad(project)}
        />
      </div>
    </div>
  );
}

function ProjectCardImage({ project }: { project: SavedProject }) {
  return <img src={project.thumbnail} alt={project.name} className="w-20 h-20 rounded object-cover shrink-0" />;
}

function ProjectCardMeta({ project, eyebrow }: { project: SavedProject; eyebrow?: string }) {
  return (
    <div>
      {eyebrow && <div className="text-[10px] text-accent tracking-[2px]">{eyebrow}</div>}
      <div className="text-[12px] text-text truncate">{project.name}</div>
      <div className="text-[10px] text-dim tracking-[0.5px]">{formatUpdatedAt(project.updatedAt)}</div>
      <div className="text-[10px] text-dim tracking-[0.5px]">seed: {project.doc.global.seed}</div>
      <div className="text-[10px] text-dim tracking-[0.5px]">size: {formatBytes(projectSizeBytes(project))}</div>
    </div>
  );
}

function ProjectCardActions({
  deleteVariant,
  loadVariant,
  onDelete,
  onLoad,
  project,
}: {
  deleteVariant: 'danger' | 'quiet';
  loadVariant: 'danger' | 'quiet';
  onDelete: () => void;
  onLoad: () => void;
  project: SavedProject;
}) {
  return (
    <div className="flex gap-1.5">
      <ActionButton
        className="library-card-action library-card-action-load"
        aria-label={`Load ${project.name}`}
        onClick={onLoad}
        variant={loadVariant}
      >
        LOAD
      </ActionButton>
      <ActionButton
        className="library-card-action library-card-action-delete"
        aria-label={`Delete ${project.name}`}
        onClick={onDelete}
        variant={deleteVariant}
      >
        DEL
      </ActionButton>
    </div>
  );
}
