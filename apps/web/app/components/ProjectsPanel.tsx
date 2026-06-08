import { type CSSProperties, type KeyboardEvent, type ReactNode, useState } from 'react';

import type { BrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import type { SavedProject } from '../utils/projectLibrary';
import { formatBytes, projectSizeBytes } from '../utils/storageStatus';
import { type WorkspaceStatusRow, workspaceStatusRows, workspaceWarnings } from './StorageWorkspaceStatusModel';
import { ActionButton } from './ui/ActionButton';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';

interface Props {
  projects: SavedProject[];
  activeProject: SavedProject | null;
  recoveryDraft: SavedProject | null;
  storageStatus: BrowserStorageStatus;
  storageError: string | null;
  maxProjects: number;
  onSaveCopy: (name: string) => void;
  onSaveActive: (name: string) => void;
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
  activeProject,
  recoveryDraft,
  storageStatus,
  storageError,
  maxProjects,
  onSaveCopy,
  onSaveActive,
  onLoad,
  onDelete,
  onDeleteRecoveryDraft,
  onNewBlank,
  onClose,
}: Props) {
  const viewModel = projectsPanelViewModel(projects, activeProject, recoveryDraft, maxProjects);

  const handleOpenChange = (open: boolean) => {
    closeProjectsOnSheetClose(open, onClose);
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
            <span className={viewModel.countClassName}>
              {projects.length} / {maxProjects}
            </span>
            <SheetClose asChild>
              <ActionButton aria-label="Close projects" variant="quiet">
                x
              </ActionButton>
            </SheetClose>
          </div>
        </SheetHeader>
        <ProjectSaveForm
          key={activeProject?.id ?? 'new-project'}
          activeProject={activeProject}
          activeWorkState={storageStatus.summary.activeWorkState}
          projectCount={projects.length}
          onSaveActive={onSaveActive}
          onSaveCopy={onSaveCopy}
        />
        <ProjectWorkspaceSummary
          projects={projects}
          activeProject={activeProject}
          storageStatus={storageStatus}
          storageError={storageError}
          maxProjects={maxProjects}
          onNewBlank={onNewBlank}
        />
        <ProjectsList
          hasSavedItems={viewModel.hasSavedItems}
          projects={projects}
          activeProjectId={viewModel.activeProjectId}
          recoveryDraft={recoveryDraft}
          onDelete={onDelete}
          onDeleteRecoveryDraft={onDeleteRecoveryDraft}
          onSaveCopy={onSaveCopy}
          onLoad={onLoad}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProjectSaveForm({
  activeProject,
  activeWorkState,
  projectCount,
  onSaveActive,
  onSaveCopy,
}: {
  activeProject: SavedProject | null;
  activeWorkState: BrowserStorageStatus['summary']['activeWorkState'];
  projectCount: number;
  onSaveActive: (name: string) => void;
  onSaveCopy: (name: string) => void;
}) {
  const [name, setName] = useState(activeProject?.name ?? '');
  const formState = projectSaveFormState(activeProject, activeWorkState, name);

  const handleSave = () => {
    if (formState.saveDisabled) return;
    submitProjectSave(formState, {
      name,
      onSaveActive,
      onSaveCopy,
      projectCount,
      resetName: () => setName(''),
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleSave();
  };

  return (
    <div className="project-save-panel">
      <div className="project-primary-save">
        <label htmlFor="project-name-input" className="project-name-field">
          <span>PROJECT NAME</span>
          <input
            id="project-name-input"
            type="text"
            placeholder="Project name..."
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        <ActionButton
          className="library-save-button"
          disabled={formState.saveDisabled}
          onClick={handleSave}
          variant="primary"
          aria-label={formState.ariaLabel}
        >
          {formState.buttonLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function ProjectWorkspaceSummary({
  projects,
  activeProject,
  storageStatus,
  storageError,
  maxProjects,
  onNewBlank,
}: {
  projects: SavedProject[];
  activeProject: SavedProject | null;
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
          <ProjectPlainDetailRow label="Active project" value={activeProject?.name ?? 'None'} />
          <ProjectPlainDetailRow label="Saved projects" value={`${projects.length} / ${maxProjects}`} />
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

function projectsPanelViewModel(
  projects: SavedProject[],
  activeProject: SavedProject | null,
  recoveryDraft: SavedProject | null,
  maxProjects: number,
) {
  return {
    activeProjectId: activeProject?.id ?? null,
    countClassName: projectCountClassName(projects.length, maxProjects),
    hasSavedItems: hasProjectListItems(projects, recoveryDraft),
  };
}

function hasProjectListItems(projects: SavedProject[], recoveryDraft: SavedProject | null) {
  return projects.length > 0 || recoveryDraft !== null;
}

function closeProjectsOnSheetClose(open: boolean, onClose: () => void) {
  if (!open) onClose();
}

function projectSaveFormState(
  activeProject: SavedProject | null,
  activeWorkState: BrowserStorageStatus['summary']['activeWorkState'],
  name: string,
) {
  const hasActiveProject = activeProject !== null;
  const nameChanged = projectNameChanged(activeProject, name);
  return {
    activeProjectName: activeProject?.name ?? null,
    ariaLabel: projectSaveAriaLabel(activeProject, name),
    buttonLabel: projectSaveButtonLabel(hasActiveProject),
    hasActiveProject,
    saveDisabled: projectSaveDisabled(hasActiveProject, nameChanged, activeWorkState),
  };
}

function projectNameChanged(activeProject: SavedProject | null, name: string) {
  return activeProject !== null && name.trim() !== activeProject.name;
}

function projectSaveButtonLabel(hasActiveProject: boolean) {
  return hasActiveProject ? 'SAVE PROJECT' : 'CREATE PROJECT';
}

function projectSaveDisabled(
  hasActiveProject: boolean,
  nameChanged: boolean,
  activeWorkState: BrowserStorageStatus['summary']['activeWorkState'],
) {
  return hasActiveProject && !nameChanged && activeWorkState !== 'unsaved';
}

function projectSaveAriaLabel(activeProject: SavedProject | null, name: string) {
  if (!activeProject) return undefined;
  return `Save active project ${name.trim() || activeProject.name}`;
}

function submitProjectSave(
  formState: ReturnType<typeof projectSaveFormState>,
  {
    name,
    onSaveActive,
    onSaveCopy,
    projectCount,
    resetName,
  }: {
    name: string;
    onSaveActive: (name: string) => void;
    onSaveCopy: (name: string) => void;
    projectCount: number;
    resetName: () => void;
  },
) {
  const savedName = projectSaveName(name, projectCount, formState.activeProjectName);
  if (formState.hasActiveProject) onSaveActive(savedName);
  else {
    onSaveCopy(savedName);
    resetName();
  }
}

function projectSaveName(name: string, projectCount: number, activeName: string | null = null) {
  const trimmed = name.trim();
  if (trimmed.length > 0) return trimmed;
  if (activeName) return `${activeName} copy`;
  return `Project ${projectCount + 1}`;
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

export function ProjectsList({
  hasSavedItems,
  projects,
  activeProjectId,
  loadMode = 'button',
  recoveryDraft,
  onDelete,
  onDeleteRecoveryDraft,
  onSaveCopy,
  onLoad,
}: {
  hasSavedItems: boolean;
  projects: SavedProject[];
  activeProjectId: string | null;
  loadMode?: 'button' | 'card';
  recoveryDraft: SavedProject | null;
  onDelete: (id: string) => void;
  onDeleteRecoveryDraft: () => void;
  onSaveCopy?: (name: string) => void;
  onLoad: (project: SavedProject) => void;
}) {
  if (!hasSavedItems) return <ProjectsEmptyState />;
  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
      <RecoveryDraftCard
        loadMode={loadMode}
        recoveryDraft={recoveryDraft}
        onDeleteRecoveryDraft={onDeleteRecoveryDraft}
        onLoad={onLoad}
      />
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          active={project.id === activeProjectId}
          loadMode={loadMode}
          onDelete={onDelete}
          onSaveCopy={
            project.id === activeProjectId && onSaveCopy ? () => onSaveCopy(`${project.name} copy`) : undefined
          }
          onLoad={onLoad}
        />
      ))}
    </div>
  );
}

function ProjectsEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-dim text-[11px] p-5 text-center">
      <div className="text-[32px] text-accent opacity-30 mb-2">▣</div>
      <p>No projects saved yet.</p>
      <p>Create a project to keep editing this document later.</p>
    </div>
  );
}

function RecoveryDraftCard({
  loadMode,
  recoveryDraft,
  onDeleteRecoveryDraft,
  onLoad,
}: {
  loadMode: 'button' | 'card';
  recoveryDraft: SavedProject | null;
  onDeleteRecoveryDraft: () => void;
  onLoad: (project: SavedProject) => void;
}) {
  if (!recoveryDraft) return null;
  const loadProject = () => onLoad(recoveryDraft);
  return (
    <ProjectCardFrame active={false} draft>
      <ProjectCardPrimary project={recoveryDraft} eyebrow="RECOVERY COPY" loadMode={loadMode} onLoad={loadProject} />
      <ProjectCardActions
        project={recoveryDraft}
        deleteVariant="quiet"
        loadVariant="quiet"
        showLoad={loadMode === 'button'}
        onDelete={onDeleteRecoveryDraft}
        onLoad={loadProject}
      />
    </ProjectCardFrame>
  );
}

function ProjectCard({
  project,
  active,
  loadMode,
  onDelete,
  onSaveCopy,
  onLoad,
}: {
  project: SavedProject;
  active: boolean;
  loadMode: 'button' | 'card';
  onDelete: (id: string) => void;
  onSaveCopy?: () => void;
  onLoad: (project: SavedProject) => void;
}) {
  const loadProject = () => onLoad(project);
  return (
    <ProjectCardFrame active={active}>
      <ProjectCardPrimary
        project={project}
        eyebrow={active ? 'ACTIVE PROJECT' : undefined}
        loadMode={loadMode}
        onLoad={loadProject}
      />
      <ProjectCardActions
        project={project}
        deleteVariant="quiet"
        loadVariant="quiet"
        showLoad={loadMode === 'button'}
        onCopy={onSaveCopy}
        onDelete={() => onDelete(project.id)}
        onLoad={loadProject}
      />
    </ProjectCardFrame>
  );
}

function ProjectCardFrame({ active, children, draft }: { active: boolean; children: ReactNode; draft?: boolean }) {
  const stateClass = draft ? 'library-card-draft' : active ? 'library-card-active' : '';
  return (
    <div
      className={`library-card ${stateClass} flex gap-2.5 p-2.5 border border-border rounded bg-sidebar-raised/50 transition-colors hover:border-accent/30`}
      aria-current={active ? 'true' : undefined}
    >
      {children}
    </div>
  );
}

function ProjectCardPrimary({
  eyebrow,
  loadMode,
  onLoad,
  project,
}: {
  eyebrow?: string;
  loadMode: 'button' | 'card';
  onLoad: () => void;
  project: SavedProject;
}) {
  const content = (
    <>
      <ProjectCardImage project={project} />
      <div className="library-card-copy flex-1 flex flex-col justify-between min-w-0">
        <ProjectCardMeta project={project} eyebrow={eyebrow} />
      </div>
    </>
  );

  if (loadMode === 'card') {
    return (
      <button type="button" className="library-card-open" aria-label={`Load ${project.name}`} onClick={onLoad}>
        {content}
      </button>
    );
  }

  return <div className="library-card-open">{content}</div>;
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
  onCopy,
  onDelete,
  onLoad,
  project,
  showLoad = true,
}: {
  deleteVariant: 'danger' | 'quiet';
  loadVariant: 'danger' | 'quiet';
  onCopy?: () => void;
  onDelete: () => void;
  onLoad: () => void;
  project: SavedProject;
  showLoad?: boolean;
}) {
  return (
    <div className="library-card-actions flex gap-1.5">
      {showLoad && (
        <ActionButton
          className="library-card-action library-card-action-load"
          aria-label={`Load ${project.name}`}
          onClick={onLoad}
          variant={loadVariant}
        >
          LOAD
        </ActionButton>
      )}
      <ActionButton
        className="library-card-action library-card-action-delete"
        aria-label={`Delete ${project.name}`}
        onClick={onDelete}
        variant={deleteVariant}
      >
        DEL
      </ActionButton>
      {onCopy && (
        <ActionButton
          className="library-card-action library-card-action-copy"
          aria-label={`Save copy of ${project.name}`}
          onClick={onCopy}
          variant="quiet"
        >
          COPY
        </ActionButton>
      )}
    </div>
  );
}
