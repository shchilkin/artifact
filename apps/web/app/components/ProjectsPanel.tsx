import { type CSSProperties, type KeyboardEvent, type ReactNode, useState } from 'react';

import type { BrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import type { SavedProject } from '../utils/projectLibrary';
import { formatBytes, projectSizeBytes } from '../utils/storageStatus';
import { type WorkspaceStatusRow, workspaceStatusRows, workspaceWarnings } from './StorageWorkspaceStatusModel';
import { ActionButton } from './ui/ActionButton';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
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
  onSaveToCloud: (project: SavedProject) => void;
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
  label: 'Recovery draft',
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
  onSaveToCloud,
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
              Save editable work in this browser, load local projects, or start a new canvas.
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
          onSaveToCloud={onSaveToCloud}
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
            placeholder="Name this project..."
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
      <p className="project-save-note">Projects save editable work in this browser. Share downloads portable files.</p>
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
  const toneClassName = projectCount >= maxProjects - 2 ? 'project-count-warning' : 'project-count-muted';
  return `project-count ${toneClassName}`;
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
  onSaveToCloud,
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
  onSaveToCloud?: (project: SavedProject) => void;
  onSaveCopy?: (name: string) => void;
  onLoad: (project: SavedProject) => void;
}) {
  if (!hasSavedItems) return <ProjectsEmptyState />;
  return (
    <div className="projects-list">
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
          onSaveToCloud={onSaveToCloud}
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
    <div className="projects-empty-state">
      <div className="projects-empty-state__mark">▣</div>
      <p>Save this draft as a project.</p>
      <p>Projects keep editable work inside this browser.</p>
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
      <ProjectCardPrimary project={recoveryDraft} badge="RECOVERY" loadMode={loadMode} onLoad={loadProject} />
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
  onSaveToCloud,
  onSaveCopy,
  onLoad,
}: {
  project: SavedProject;
  active: boolean;
  loadMode: 'button' | 'card';
  onDelete: (id: string) => void;
  onSaveToCloud?: (project: SavedProject) => void;
  onSaveCopy?: () => void;
  onLoad: (project: SavedProject) => void;
}) {
  const loadProject = () => onLoad(project);
  return (
    <ProjectCardFrame active={active}>
      <ProjectCardPrimary
        project={project}
        badge={active ? 'ACTIVE' : undefined}
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
        onSaveToCloud={shouldShowSaveToCloud(project, onSaveToCloud) ? () => onSaveToCloud(project) : undefined}
      />
    </ProjectCardFrame>
  );
}

function ProjectCardFrame({ active, children, draft }: { active: boolean; children: ReactNode; draft?: boolean }) {
  const stateClass = draft ? 'library-card-draft' : active ? 'library-card-active' : '';
  return (
    <div className={`library-card ${stateClass}`} aria-current={active ? 'true' : undefined}>
      {children}
    </div>
  );
}

function ProjectCardPrimary({
  badge,
  loadMode,
  onLoad,
  project,
}: {
  badge?: string;
  loadMode: 'button' | 'card';
  onLoad: () => void;
  project: SavedProject;
}) {
  const content = (
    <>
      <ProjectCardImage project={project} badge={badge} loadMode={loadMode} />
      <div className="library-card-copy">
        <ProjectCardMeta project={project} />
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

function ProjectCardImage({
  badge,
  loadMode,
  project,
}: {
  badge?: string;
  loadMode: 'button' | 'card';
  project: SavedProject;
}) {
  return (
    <div className="library-card-artwork">
      <img src={project.thumbnail} alt={project.name} className="library-card-image" />
      {badge && <span className="library-card-badge">{badge}</span>}
      {loadMode === 'card' && (
        <span className="library-card-hover-cue" aria-hidden="true">
          OPEN PROJECT
        </span>
      )}
    </div>
  );
}

function ProjectCardMeta({ project }: { project: SavedProject }) {
  return (
    <div className="library-card-meta">
      <div className="library-card-title">{project.name}</div>
      <ProjectStorageChip project={project} />
      <div className="library-card-updated">{formatUpdatedAt(project.updatedAt)}</div>
      <div className="library-card-seed">seed: {project.doc.global.seed}</div>
      <div className="library-card-size">size: {formatBytes(projectSizeBytes(project))}</div>
    </div>
  );
}

function ProjectStorageChip({ project }: { project: SavedProject }) {
  const storage = project.storage ?? 'local';
  return <div className={`library-card-storage library-card-storage-${storage}`}>{storageLabel(storage)}</div>;
}

function ProjectCardActions({
  deleteVariant,
  loadVariant,
  onCopy,
  onDelete,
  onLoad,
  onSaveToCloud,
  project,
  showLoad = true,
}: {
  deleteVariant: 'danger' | 'quiet';
  loadVariant: 'danger' | 'quiet';
  onCopy?: () => void;
  onDelete: () => void;
  onLoad: () => void;
  onSaveToCloud?: () => void;
  project: SavedProject;
  showLoad?: boolean;
}) {
  if (!showLoad && !onCopy && !onSaveToCloud) {
    return <ProjectCardSecondaryActions project={project} onConfirmDelete={onDelete} />;
  }

  if (!showLoad) {
    return (
      <ProjectCardSecondaryActions
        project={project}
        onConfirmDelete={onDelete}
        onCopy={onCopy}
        onSaveToCloud={onSaveToCloud}
      />
    );
  }

  return (
    <ProjectCardButtonActions
      deleteVariant={deleteVariant}
      loadVariant={loadVariant}
      onCopy={onCopy}
      onDelete={onDelete}
      onLoad={onLoad}
      onSaveToCloud={onSaveToCloud}
      project={project}
      showLoad={showLoad}
    />
  );
}

function ProjectCardButtonActions({
  deleteVariant,
  loadVariant,
  onCopy,
  onDelete,
  onLoad,
  onSaveToCloud,
  project,
  showLoad,
}: {
  deleteVariant: 'danger' | 'quiet';
  loadVariant: 'danger' | 'quiet';
  onCopy?: () => void;
  onDelete: () => void;
  onLoad: () => void;
  onSaveToCloud?: () => void;
  project: SavedProject;
  showLoad: boolean;
}) {
  return (
    <div className="library-card-actions">
      <ProjectLoadAction loadVariant={loadVariant} project={project} showLoad={showLoad} onLoad={onLoad} />
      <ProjectDeleteButtonAction deleteVariant={deleteVariant} project={project} onDelete={onDelete} />
      <ProjectCopyAction project={project} onCopy={onCopy} />
      <ProjectCloudAction project={project} onSaveToCloud={onSaveToCloud} />
    </div>
  );
}

function ProjectLoadAction({
  loadVariant,
  onLoad,
  project,
  showLoad,
}: {
  loadVariant: 'danger' | 'quiet';
  onLoad: () => void;
  project: SavedProject;
  showLoad: boolean;
}) {
  if (!showLoad) return null;
  return (
    <ActionButton
      className="library-card-action library-card-action-load"
      aria-label={`Load ${project.name}`}
      onClick={onLoad}
      variant={loadVariant}
    >
      LOAD
    </ActionButton>
  );
}

function ProjectDeleteButtonAction({
  deleteVariant,
  onDelete,
  project,
}: {
  deleteVariant: 'danger' | 'quiet';
  onDelete: () => void;
  project: SavedProject;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <ActionButton
        className="library-card-action library-card-action-delete"
        aria-label={`Delete ${project.name}`}
        onClick={() => setConfirmOpen(true)}
        variant={deleteVariant}
      >
        DEL
      </ActionButton>
      <ProjectDeleteDialog
        open={confirmOpen}
        project={project}
        onConfirmDelete={onDelete}
        onOpenChange={setConfirmOpen}
      />
    </>
  );
}

function ProjectDeleteDialog({
  onConfirmDelete,
  onOpenChange,
  open,
  project,
}: {
  onConfirmDelete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  project: SavedProject;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="project-delete-dialog">
        <DialogTitle className="project-delete-dialog__title">Delete project?</DialogTitle>
        <DialogDescription className="project-delete-dialog__copy">
          {project.name} will be removed from this browser.
        </DialogDescription>
        <div className="project-delete-dialog__actions">
          <DialogClose asChild>
            <ActionButton variant="quiet">CANCEL</ActionButton>
          </DialogClose>
          <DialogClose asChild>
            <ActionButton variant="danger" onClick={onConfirmDelete}>
              DELETE
            </ActionButton>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCardSecondaryActions({
  onConfirmDelete,
  onCopy,
  onSaveToCloud,
  project,
}: {
  onConfirmDelete: () => void;
  onCopy?: () => void;
  onSaveToCloud?: () => void;
  project: SavedProject;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="library-card-actions library-card-secondary-actions">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="library-card-more-action" aria-label={`Project actions for ${project.name}`}>
            ...
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" onClick={(event) => event.stopPropagation()}>
          {onSaveToCloud && <DropdownMenuItem onSelect={onSaveToCloud}>Save to cloud</DropdownMenuItem>}
          {onCopy && <DropdownMenuItem onSelect={onCopy}>Save copy</DropdownMenuItem>}
          <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectDeleteDialog
        open={confirmOpen}
        project={project}
        onConfirmDelete={onConfirmDelete}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}

function ProjectCopyAction({ onCopy, project }: { onCopy?: () => void; project: SavedProject }) {
  if (!onCopy) return null;
  return (
    <ActionButton
      className="library-card-action library-card-action-copy"
      aria-label={`Save copy of ${project.name}`}
      onClick={onCopy}
      variant="quiet"
    >
      COPY
    </ActionButton>
  );
}

function ProjectCloudAction({ onSaveToCloud, project }: { onSaveToCloud?: () => void; project: SavedProject }) {
  if (!onSaveToCloud) return null;
  return (
    <ActionButton
      className="library-card-action library-card-action-cloud"
      aria-label={`Save ${project.name} to cloud`}
      onClick={onSaveToCloud}
      variant="quiet"
    >
      CLOUD
    </ActionButton>
  );
}

function shouldShowSaveToCloud(project: SavedProject, onSaveToCloud?: (project: SavedProject) => void) {
  return Boolean(onSaveToCloud) && (project.storage ?? 'local') === 'local';
}

function storageLabel(storage: SavedProject['storage']) {
  if (storage === 'cloud') return 'CLOUD';
  if (storage === 'synced') return 'SYNCED';
  return 'LOCAL';
}
