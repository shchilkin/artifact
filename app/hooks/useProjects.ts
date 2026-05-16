import { useCallback, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import { deletePreBlankDraft, loadPreBlankDraft } from '../utils/documentPersistence';
import { generateThumbnail } from '../utils/generateThumbnail';
import {
  deleteProjectSnapshot,
  MAX_PROJECTS,
  normalizeSavedProjects,
  PROJECT_THUMBNAIL_FALLBACK,
  PROJECTS_STORAGE_KEY,
  persistSavedProjects,
  type SavedProject,
  saveProjectSnapshot,
} from '../utils/projectLibrary';

function loadFromStorage(): SavedProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return normalizeSavedProjects(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function saveToStorage(projects: SavedProject[]) {
  return persistSavedProjects(localStorage, projects);
}

function loadDraftFromStorage(): SavedProject | null {
  const draft = loadPreBlankDraft(localStorage) ?? loadPreBlankDraft(sessionStorage);
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
  const [recoveryDraft, setRecoveryDraft] = useState<SavedProject | null>(loadDraftFromStorage);
  const [storageError, setStorageError] = useState<string | null>(null);

  const saveProject = useCallback(
    async (name: string, doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>) => {
      let thumbnail = PROJECT_THUMBNAIL_FALLBACK;
      try {
        thumbnail = await generateThumbnail(doc, imageCache);
      } catch (err) {
        console.error('[projects] thumbnail generation failed, using placeholder', err);
      }

      const now = new Date().toISOString();
      const project: SavedProject = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        doc,
        thumbnail,
        createdAt: now,
        updatedAt: now,
      };

      const next = saveProjectSnapshot(projects, project);
      const result = saveToStorage(next);
      setStorageError(result.error);
      if (result.ok) setProjects(result.projects);
    },
    [projects],
  );

  const deleteProject = useCallback(
    (id: string) => {
      const next = deleteProjectSnapshot(projects, id);
      const result = saveToStorage(next);
      setStorageError(result.error);
      if (result.ok) setProjects(result.projects);
    },
    [projects],
  );

  const loadProject = useCallback((project: SavedProject) => ({ doc: project.doc }), []);

  const deleteRecoveryDraft = useCallback(() => {
    deletePreBlankDraft(localStorage);
    deletePreBlankDraft(sessionStorage);
    setRecoveryDraft(null);
  }, []);

  const refreshRecoveryDraft = useCallback(() => {
    setRecoveryDraft(loadDraftFromStorage());
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
