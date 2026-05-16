import { type MutableRefObject, useCallback, useEffect, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import { type SavedProject } from '../utils/projectLibrary';
import { useProjects } from './useProjects';

interface UseGeneratorProjectsControllerOptions {
  docRef: MutableRefObject<CanvasDocument>;
  imageCache: Map<string, HTMLImageElement>;
  onLoadDocument: (doc: CanvasDocument) => void;
}

export function useGeneratorProjectsController({
  docRef,
  imageCache,
  onLoadDocument,
}: UseGeneratorProjectsControllerOptions) {
  const [showProjects, setShowProjects] = useState(false);
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

  const handleLoadProject = useCallback(
    (project: SavedProject) => {
      const { doc } = loadProject(project);
      onLoadDocument(doc);
      setShowProjects(false);
    },
    [loadProject, onLoadDocument],
  );

  useEffect(() => {
    if (!showProjects) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowProjects(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showProjects]);

  return {
    showProjects,
    projects,
    recoveryDraft,
    storageError,
    maxProjects,
    toggleProjects: () => {
      refreshRecoveryDraft();
      setShowProjects((current) => !current);
    },
    closeProjects: () => setShowProjects(false),
    handleLoadProject,
    saveCurrentProject: (name: string) => saveProject(name, docRef.current, imageCache),
    deleteProject,
    deleteRecoveryDraft,
  };
}
