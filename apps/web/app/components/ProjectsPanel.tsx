import { type CSSProperties, useState } from 'react';

import type { SavedProject } from '../utils/projectLibrary';
import { ActionButton } from './ui/ActionButton';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';

interface Props {
  projects: SavedProject[];
  recoveryDraft: SavedProject | null;
  storageError: string | null;
  maxProjects: number;
  onSave: (name: string) => void;
  onLoad: (project: SavedProject) => void;
  onDelete: (id: string) => void;
  onDeleteRecoveryDraft: () => void;
  onNewBlank: () => void;
  onClose: () => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'saved locally';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ProjectsPanel({
  projects,
  recoveryDraft,
  storageError,
  maxProjects,
  onSave,
  onLoad,
  onDelete,
  onDeleteRecoveryDraft,
  onNewBlank,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const nearLimit = projects.length >= maxProjects - 2;
  const hasSavedItems = projects.length > 0 || Boolean(recoveryDraft);

  const handleSave = () => {
    const trimmed = name.trim() || `Project ${projects.length + 1}`;
    onSave(trimmed);
    setName('');
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="library-panel" style={{ '--artifact-sheet-width': '360px' } as CSSProperties}>
        <SheetHeader className="flex items-center justify-between px-4 min-h-11 border-b border-border shrink-0">
          <div>
            <SheetTitle className="text-[10px] tracking-[2.5px] text-accent font-semibold">PROJECTS</SheetTitle>
            <SheetDescription className="sr-only">
              Save, load, delete, or start local Artifact projects.
            </SheetDescription>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`text-[9px] tracking-[0.5px] ${nearLimit ? 'text-accent' : 'text-dim'}`}>
              {projects.length} / {maxProjects}
            </span>
            <SheetClose asChild>
              <ActionButton aria-label="Close projects" variant="quiet">
                x
              </ActionButton>
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="flex gap-2 px-4 py-2.5 border-b border-border shrink-0">
          <label htmlFor="project-name-input" className="sr-only">
            Project name
          </label>
          <input
            id="project-name-input"
            type="text"
            placeholder="Project name..."
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSave()}
            className="flex-1 bg-sidebar-raised border border-border text-text font-mono text-[11px] px-2 h-11 rounded-sm outline-none focus:border-accent placeholder:text-dim"
          />
          <ActionButton onClick={handleSave} variant="primary">
            SAVE
          </ActionButton>
        </div>
        <div className="px-4 py-2.5 border-b border-border shrink-0">
          <ActionButton className="w-full" onClick={onNewBlank} aria-label="New blank canvas from projects">
            NEW BLANK CANVAS
          </ActionButton>
        </div>
        <StorageErrorMessage storageError={storageError} />
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

function StorageErrorMessage({ storageError }: { storageError: string | null }) {
  if (!storageError) return null;
  return (
    <div className="mx-4 mt-3 border border-accent/60 bg-accent/10 p-2.5 text-[10px] leading-relaxed text-accent">
      {storageError}
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
    <div className="library-card library-card-accent flex gap-2.5 p-2.5 border border-accent/50 rounded bg-accent/10 transition-colors hover:border-accent">
      <ProjectCardImage project={recoveryDraft} />
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <ProjectCardMeta project={recoveryDraft} eyebrow="RECOVERABLE DRAFT" />
        <ProjectCardActions
          project={recoveryDraft}
          deleteVariant="danger"
          loadVariant="danger"
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
        className="library-card-action"
        aria-label={`Load ${project.name}`}
        onClick={onLoad}
        variant={loadVariant}
      >
        LOAD
      </ActionButton>
      <ActionButton
        className="library-card-action"
        aria-label={`Delete ${project.name}`}
        onClick={onDelete}
        variant={deleteVariant}
      >
        DEL
      </ActionButton>
    </div>
  );
}
