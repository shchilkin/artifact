import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import {
  type ActiveProjectBinding,
  activeProjectBindingFor,
  activeProjectFromBinding,
  loadActiveProjectBinding,
  saveActiveProjectBinding,
} from '../utils/activeProjectBinding';
import { storePortableDocumentAssets } from '../utils/documentAssets';
import { documentFingerprint } from '../utils/documentFingerprint';
import { type SavedProject } from '../utils/projectLibrary';
import { acceptProjectDocument } from '../utils/projectLoadBinding';
import type { ProjectSaveState } from '../utils/storageStatus';
import { useProjects } from './useProjects';

interface UseGeneratorProjectsControllerOptions {
  doc: CanvasDocument;
  docRef: MutableRefObject<CanvasDocument>;
  imageCache: Map<string, HTMLImageElement>;
  onLoadDocument: (doc: CanvasDocument) => Promise<CanvasDocument | null>;
  initialDocumentClearsProject?: boolean;
}

export function useEditorProjectsController({
  doc,
  docRef,
  imageCache,
  onLoadDocument,
  initialDocumentClearsProject = false,
}: UseGeneratorProjectsControllerOptions) {
  const [showProjects, setShowProjects] = useState(false);
  const pendingProjectLoad = useRef(0);
  const [activeProjectBinding, setActiveProjectBinding] = useState<ActiveProjectBinding | null>(() =>
    typeof window === 'undefined' || initialDocumentClearsProject
      ? null
      : loadActiveProjectBinding(window.localStorage),
  );
  const {
    projects,
    recoveryDraft,
    storageError,
    projectSyncStates,
    maxProjects,
    saveProject,
    saveProjectToCloud,
    deleteProject,
    loadProject,
    deleteRecoveryDraft,
    refreshRecoveryDraft,
  } = useProjects();
  const activeDocumentFingerprint = useMemo(() => documentFingerprint(doc), [doc]);
  const activeProject = useMemo(
    () => activeProjectFromBinding(projects, activeProjectBinding),
    [activeProjectBinding, projects],
  );
  const projectSaveState: ProjectSaveState =
    activeProject && activeProjectBinding.savedFingerprint === activeDocumentFingerprint
      ? 'saved'
      : activeProject
        ? 'unsaved'
        : 'untracked';

  const updateActiveProjectBinding = useCallback((binding: ActiveProjectBinding | null) => {
    setActiveProjectBinding(binding);
    saveActiveProjectBinding(typeof window === 'undefined' ? null : window.localStorage, binding);
  }, []);

  const clearActiveProject = useCallback(() => {
    updateActiveProjectBinding(null);
  }, [updateActiveProjectBinding]);
  const cancelPendingProjectLoads = useCallback(() => {
    pendingProjectLoad.current += 1;
  }, []);

  useEffect(() => {
    if (initialDocumentClearsProject) {
      saveActiveProjectBinding(typeof window === 'undefined' ? null : window.localStorage, null);
    }
  }, [initialDocumentClearsProject]);

  const handleLoadProject = useCallback(
    (project: SavedProject) => {
      const serial = ++pendingProjectLoad.current;
      void loadProject(project)
        .then(({ doc }) => storePortableDocumentAssets(doc).catch(() => doc))
        .then(async (storedDoc) => {
          if (serial !== pendingProjectLoad.current) return;
          if (
            !(await acceptProjectDocument(
              project,
              storedDoc,
              onLoadDocument,
              () => docRef.current,
              updateActiveProjectBinding,
            ))
          )
            return;
          setShowProjects(false);
        })
        .catch((error) => {
          console.error('[projects] unable to load project', error);
        });
    },
    [docRef, loadProject, onLoadDocument, updateActiveProjectBinding],
  );

  const saveProjectAndBind = useCallback(
    (name: string, projectId?: string) => {
      void saveProject(name, docRef.current, imageCache, { projectId }).then((project) => {
        if (!project) return;
        updateActiveProjectBinding(activeProjectBindingFor(project));
      });
    },
    [docRef, imageCache, saveProject, updateActiveProjectBinding],
  );

  return {
    showProjects,
    projects,
    activeProject,
    recoveryDraft,
    storageError,
    projectSyncStates,
    maxProjects,
    toggleProjects: () => {
      refreshRecoveryDraft();
      setShowProjects((current) => !current);
    },
    closeProjects: () => setShowProjects(false),
    handleLoadProject,
    cancelPendingProjectLoads,
    clearActiveProject,
    saveCurrentProject: (name: string) => {
      saveProjectAndBind(name);
    },
    saveActiveProject: (name: string) => {
      if (!activeProject) return;
      saveProjectAndBind(name, activeProject.id);
    },
    deleteProject: (id: string) => {
      if (activeProjectBinding?.projectId === id) clearActiveProject();
      void deleteProject(id);
    },
    saveProjectToCloud: (project: SavedProject) => {
      void saveProjectToCloud(project);
    },
    deleteRecoveryDraft,
    projectSaveState,
  };
}
