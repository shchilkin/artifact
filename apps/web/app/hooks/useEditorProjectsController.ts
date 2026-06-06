import { type MutableRefObject, useCallback, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import { storePortableDocumentAssets } from '../utils/documentAssets';
import { type SavedProject } from '../utils/projectLibrary';
import { useProjects } from './useProjects';

interface UseGeneratorProjectsControllerOptions {
  docRef: MutableRefObject<CanvasDocument>;
  imageCache: Map<string, HTMLImageElement>;
  onLoadDocument: (doc: CanvasDocument) => void;
}

export function useEditorProjectsController({
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
      void storePortableDocumentAssets(doc)
        .catch(() => doc)
        .then((storedDoc) => {
          onLoadDocument(storedDoc);
          setShowProjects(false);
        });
    },
    [loadProject, onLoadDocument],
  );

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
