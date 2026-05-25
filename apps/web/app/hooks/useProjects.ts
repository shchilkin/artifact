import { useCallback, useEffect, useRef, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import { storePortableDocumentAssets } from '../utils/documentAssets';
import { generateThumbnail } from '../utils/generateThumbnail';
import {
  MAX_PROJECTS,
  normalizeSavedProjects,
  PROJECT_THUMBNAIL_FALLBACK,
  PROJECTS_STORAGE_KEY,
  type SavedProject,
} from '../utils/projectLibrary';
import {
  deleteStoredPreBlankDraft,
  deleteStoredProject,
  listStoredProjects,
  loadStoredPreBlankDraft,
  saveStoredProject,
} from '../utils/projectStore';

function loadFromStorage(): SavedProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return normalizeSavedProjects(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function draftToProject(draft: Awaited<ReturnType<typeof loadStoredPreBlankDraft>>): SavedProject | null {
  if (!draft) return null;
  return {
    id: 'pre-blank-draft',
    name: 'Previous draft',
    doc: draft.doc,
    thumbnail: PROJECT_THUMBNAIL_FALLBACK,
    createdAt: draft.savedAt,
    updatedAt: draft.savedAt,
  };
}

export function useProjects() {
  const [projects, setProjects] = useState<SavedProject[]>(loadFromStorage);
  const [recoveryDraft, setRecoveryDraft] = useState<SavedProject | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refreshRecoveryDraft = useCallback(async () => {
    try {
      const draft = await loadStoredPreBlankDraft();
      if (mountedRef.current) setRecoveryDraft(draftToProject(draft));
    } catch (error) {
      if (mountedRef.current) setStorageError(error instanceof Error ? error.message : 'Unable to load recovery draft');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    listStoredProjects()
      .then((items) => {
        if (mountedRef.current) setProjects(items);
      })
      .catch((error) => {
        if (mountedRef.current) setStorageError(error instanceof Error ? error.message : 'Unable to load projects');
      });
    loadStoredPreBlankDraft()
      .then((draft) => {
        if (mountedRef.current) setRecoveryDraft(draftToProject(draft));
      })
      .catch((error) => {
        if (mountedRef.current)
          setStorageError(error instanceof Error ? error.message : 'Unable to load recovery draft');
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const saveProject = useCallback(
    async (name: string, doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>) => {
      let thumbnail = PROJECT_THUMBNAIL_FALLBACK;
      try {
        thumbnail = await generateThumbnail(doc, imageCache);
      } catch (err) {
        console.error('[projects] thumbnail generation failed, using placeholder', err);
      }

      const now = new Date().toISOString();
      try {
        const storedDoc = await storePortableDocumentAssets(doc);
        const project: SavedProject = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name,
          doc: storedDoc,
          thumbnail,
          createdAt: now,
          updatedAt: now,
        };
        const next = await saveStoredProject(project);
        setStorageError(null);
        if (mountedRef.current) setProjects(next);
      } catch (error) {
        if (mountedRef.current) setStorageError(error instanceof Error ? error.message : 'Unable to save project');
      }
    },
    [],
  );

  const deleteProject = useCallback(async (id: string) => {
    try {
      const next = await deleteStoredProject(id);
      setStorageError(null);
      if (mountedRef.current) setProjects(next);
    } catch (error) {
      if (mountedRef.current) setStorageError(error instanceof Error ? error.message : 'Unable to delete project');
    }
  }, []);

  const loadProject = useCallback((project: SavedProject) => ({ doc: project.doc }), []);

  const deleteRecoveryDraft = useCallback(() => {
    deleteStoredPreBlankDraft()
      .then(() => {
        if (mountedRef.current) setRecoveryDraft(null);
      })
      .catch((error) => {
        if (mountedRef.current)
          setStorageError(error instanceof Error ? error.message : 'Unable to delete recovery draft');
      });
  }, []);

  return {
    projects,
    recoveryDraft,
    storageError,
    saveProject,
    deleteProject,
    loadProject,
    deleteRecoveryDraft,
    refreshRecoveryDraft,
    maxProjects: MAX_PROJECTS,
  };
}
