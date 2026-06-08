import { useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';

import { ProjectsList } from '../components/ProjectsPanel';
import { SiteNav } from '../components/SiteNav';
import { ActionLink } from '../components/ui/ActionButton';
import { useProjects } from '../hooks/useProjects';
import {
  activeProjectBindingFor,
  activeProjectFromBinding,
  loadActiveProjectBinding,
  saveActiveProjectBinding,
} from '../utils/activeProjectBinding';
import { storePortableDocumentAssets } from '../utils/documentAssets';
import { normalizeDocument, saveDocumentToStorage } from '../utils/documentPersistence';
import type { SavedProject } from '../utils/projectLibrary';

export const meta: MetaFunction = () => [
  { title: 'artifact | Projects' },
  {
    name: 'description',
    content: 'Browse, recover, delete, and open local Artifact projects stored in this browser.',
  },
];

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const [openError, setOpenError] = useState<string | null>(null);
  const [activeProjectBinding, setActiveProjectBinding] = useState(loadInitialActiveProjectBinding);
  const { projects, recoveryDraft, storageError, maxProjects, deleteProject, deleteRecoveryDraft } = useProjects();
  const activeProject = useMemo(
    () => activeProjectFromBinding(projects, activeProjectBinding),
    [activeProjectBinding, projects],
  );
  const viewModel = useMemo(
    () => projectsRouteViewModel(projects, recoveryDraft, activeProject, maxProjects, storageError, openError),
    [activeProject, maxProjects, openError, projects, recoveryDraft, storageError],
  );

  const updateActiveProjectBinding = (project: SavedProject | null) => {
    const binding = project ? activeProjectBindingFor(project) : null;
    setActiveProjectBinding(binding);
    saveActiveProjectBinding(typeof window === 'undefined' ? null : window.localStorage, binding);
  };

  const handleOpenProject = (project: SavedProject) => {
    void openProjectInEditor(project, { navigate, setOpenError, updateActiveProjectBinding });
  };

  const handleDeleteProject = (id: string) => {
    if (activeProjectBinding?.projectId === id) updateActiveProjectBinding(null);
    void deleteProject(id);
  };

  return (
    <main className="projects-route min-h-screen bg-bg text-text">
      <SiteNav solid />
      <section className="projects-page-shell">
        <ProjectsPageHeader />
        <ProjectsPageContext viewModel={viewModel} />
        <ProjectsPageWarning message={viewModel.warning} />
        <ProjectsPageLibrary
          activeProjectId={viewModel.activeProjectId}
          hasSavedItems={viewModel.hasSavedItems}
          projects={projects}
          recoveryDraft={recoveryDraft}
          onDelete={handleDeleteProject}
          onDeleteRecoveryDraft={deleteRecoveryDraft}
          onLoad={handleOpenProject}
        />
      </section>
    </main>
  );
}

function ProjectsPageHeader() {
  return (
    <header className="projects-page-header" aria-labelledby="projects-page-title">
      <div className="projects-page-kicker">Local workspace</div>
      <div className="projects-page-title-row">
        <div>
          <h1 id="projects-page-title">Projects</h1>
          <p>Open saved work from this browser or recover a previous draft.</p>
        </div>
        <ActionLink to="/app?new=blank" variant="primary">
          New project
        </ActionLink>
      </div>
    </header>
  );
}

function ProjectsPageContext({ viewModel }: { viewModel: ReturnType<typeof projectsRouteViewModel> }) {
  return (
    <div className="projects-page-context" aria-label="Projects summary">
      <span>{viewModel.savedLabel}</span>
      {viewModel.recoveryLabel && <span>{viewModel.recoveryLabel}</span>}
      {viewModel.limitLabel && <span className="projects-page-context-warning">{viewModel.limitLabel}</span>}
    </div>
  );
}

function ProjectsPageWarning({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="projects-page-warning" role="status">
      {message}
    </div>
  );
}

function ProjectsPageLibrary({
  activeProjectId,
  hasSavedItems,
  onDelete,
  onDeleteRecoveryDraft,
  onLoad,
  projects,
  recoveryDraft,
}: {
  activeProjectId: string | null;
  hasSavedItems: boolean;
  onDelete: (id: string) => void;
  onDeleteRecoveryDraft: () => void;
  onLoad: (project: SavedProject) => void;
  projects: SavedProject[];
  recoveryDraft: SavedProject | null;
}) {
  return (
    <section className="projects-page-library" aria-label="Local projects">
      <ProjectsList
        hasSavedItems={hasSavedItems}
        projects={projects}
        activeProjectId={activeProjectId}
        recoveryDraft={recoveryDraft}
        loadMode="card"
        onDelete={onDelete}
        onDeleteRecoveryDraft={onDeleteRecoveryDraft}
        onLoad={onLoad}
      />
    </section>
  );
}

function loadInitialActiveProjectBinding() {
  return typeof window === 'undefined' ? null : loadActiveProjectBinding(window.localStorage);
}

function projectsRouteViewModel(
  projects: SavedProject[],
  recoveryDraft: SavedProject | null,
  activeProject: SavedProject | null,
  maxProjects: number,
  storageError: string | null,
  openError: string | null,
) {
  return {
    activeProjectId: activeProjectId(activeProject),
    hasSavedItems: hasProjectListItems(projects, recoveryDraft),
    limitLabel: projectLimitLabel(projects.length, maxProjects),
    recoveryLabel: recoveryDraft ? 'Recovery copy available' : null,
    savedLabel: savedProjectsLabel(projects.length),
    warning: projectWarningMessage(storageError, openError),
  };
}

function activeProjectId(project: SavedProject | null) {
  return project ? project.id : null;
}

function hasProjectListItems(projects: SavedProject[], recoveryDraft: SavedProject | null) {
  return projects.length > 0 || recoveryDraft !== null;
}

function savedProjectsLabel(count: number) {
  if (count === 0) return 'No saved projects yet';
  if (count === 1) return '1 saved project';
  return `${count} saved projects`;
}

function projectLimitLabel(count: number, maxProjects: number) {
  if (maxProjects <= 0) return null;
  if (count >= maxProjects) return 'Library full';
  if (count >= maxProjects - 3) return 'Library almost full';
  return null;
}

function projectWarningMessage(storageError: string | null, openError: string | null) {
  return storageError || openError;
}

async function openProjectInEditor(
  project: SavedProject,
  {
    navigate,
    setOpenError,
    updateActiveProjectBinding,
  }: {
    navigate: ReturnType<typeof useNavigate>;
    setOpenError: (message: string | null) => void;
    updateActiveProjectBinding: (project: SavedProject | null) => void;
  },
) {
  setOpenError(null);
  try {
    const storedDoc = normalizeDocument(await storeProjectDocumentForEditor(project));
    saveDocumentToStorage(storedDoc);
    updateActiveProjectBinding(activeProjectForOpenedProject(project, storedDoc));
    navigate('/app');
  } catch (error) {
    setOpenError(error instanceof Error ? error.message : 'Unable to open project');
  }
}

async function storeProjectDocumentForEditor(project: SavedProject) {
  try {
    return await storePortableDocumentAssets(project.doc);
  } catch {
    return project.doc;
  }
}

function activeProjectForOpenedProject(project: SavedProject, doc: SavedProject['doc']) {
  if (project.id === 'pre-blank-draft') return null;
  return { ...project, doc };
}
