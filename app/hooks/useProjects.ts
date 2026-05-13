import { useCallback, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import { generateThumbnail } from '../utils/generateThumbnail';
import {
  deleteProjectSnapshot,
  MAX_PROJECTS,
  normalizeSavedProjects,
  PROJECT_THUMBNAIL_FALLBACK,
  PROJECTS_STORAGE_KEY,
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
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function useProjects() {
  const [projects, setProjects] = useState<SavedProject[]>(loadFromStorage);

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

      setProjects((prev) => {
        const next = saveProjectSnapshot(prev, project);
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const next = deleteProjectSnapshot(prev, id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const loadProject = useCallback((project: SavedProject) => ({ doc: project.doc }), []);

  return { projects, saveProject, deleteProject, loadProject, maxProjects: MAX_PROJECTS };
}
