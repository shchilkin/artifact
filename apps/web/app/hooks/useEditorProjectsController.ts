import { type MutableRefObject, useCallback, useMemo, useState } from 'react';

import type { CanvasDocument } from '../types/config';
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
}

export function useEditorProjectsController({
  doc,
  docRef,
  imageCache,
  onLoadDocument,
}: UseGeneratorProjectsControllerOptions) {
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjectFingerprint, setSavedProjectFingerprint] = useState<string | null>(null);
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
  const projectSaveState: ProjectSaveState =
    savedProjectFingerprint && savedProjectFingerprint === activeDocumentFingerprint ? 'saved' : 'unsaved';

  const handleLoadProject = useCallback(
    (project: SavedProject) => {
      const { doc } = loadProject(project);
      void storePortableDocumentAssets(doc)
        .catch(() => doc)
        .then((storedDoc) => {
          onLoadDocument(storedDoc);
          setSavedProjectFingerprint(documentFingerprint(storedDoc));
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
    saveCurrentProject: (name: string) => {
      const savedActiveFingerprint = documentFingerprint(docRef.current);
      void saveProject(name, docRef.current, imageCache).then((project) => {
        if (!project) return;
        setSavedProjectFingerprint(savedActiveFingerprint);
      });
    },
    deleteProject,
    deleteRecoveryDraft,
    projectSaveState,
  };
}
