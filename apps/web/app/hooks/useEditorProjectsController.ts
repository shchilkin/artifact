import { type MutableRefObject, useCallback, useEffect, useMemo, useState } from 'react';

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
import type { ProjectSaveState } from '../utils/storageStatus';
import { useProjects } from './useProjects';

interface UseGeneratorProjectsControllerOptions {
  doc: CanvasDocument;
  docRef: MutableRefObject<CanvasDocument>;
  imageCache: Map<string, HTMLImageElement>;
  onLoadDocument: (doc: CanvasDocument) => void;
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
  const [activeProjectBinding, setActiveProjectBinding] = useState<ActiveProjectBinding | null>(() =>
    typeof window === 'undefined' || initialDocumentClearsProject
      ? null
      : loadActiveProjectBinding(window.localStorage),
  );
  const {
    projects,
    recoveryDraft,
    storageError,
    maxProjects,
    saveProject,
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

  useEffect(() => {
    if (initialDocumentClearsProject) {
      saveActiveProjectBinding(typeof window === 'undefined' ? null : window.localStorage, null);
    }
  }, [initialDocumentClearsProject]);

  const handleLoadProject = useCallback(
    (project: SavedProject) => {
      const { doc } = loadProject(project);
      void storePortableDocumentAssets(doc)
        .catch(() => doc)
        .then((storedDoc) => {
          onLoadDocument(storedDoc);
          updateActiveProjectBinding(
            project.id === 'pre-blank-draft'
              ? null
              : {
                  projectId: project.id,
                  savedFingerprint: documentFingerprint(storedDoc),
                },
          );
          setShowProjects(false);
        });
    },
    [loadProject, onLoadDocument, updateActiveProjectBinding],
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
    maxProjects,
    toggleProjects: () => {
      refreshRecoveryDraft();
      setShowProjects((current) => !current);
    },
    closeProjects: () => setShowProjects(false),
    handleLoadProject,
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
    deleteRecoveryDraft,
    projectSaveState,
  };
}
