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
    name: 'Previous work',
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
      setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load recovery copy');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    listStoredProjects()
      .then((items) => {
        if (mountedRef.current) setProjects(items);
      })
      .catch((error) => {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load projects');
      });
    loadStoredPreBlankDraft()
      .then((draft) => {
        if (mountedRef.current) setRecoveryDraft(draftToProject(draft));
      })
      .catch((error) => {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load recovery copy');
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const saveProject = useCallback(
    async (
      name: string,
      doc: CanvasDocument,
      imageCache: Map<string, HTMLImageElement>,
      options: { projectId?: string } = {},
    ) => {
      const thumbnail = await projectThumbnail(doc, imageCache);

      try {
        const storedDoc = await storePortableDocumentAssets(doc);
        const project = buildSavedProject({
          existingProject: findProject(projects, options.projectId),
          name,
          storedDoc,
          thumbnail,
        });
        const next = await saveStoredProject(project);
        setStorageError(null);
        if (mountedRef.current) setProjects(next);
        return project;
      } catch (error) {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to save project');
        return null;
      }
    },
    [projects],
  );

  const deleteProject = useCallback(async (id: string) => {
    try {
      const next = await deleteStoredProject(id);
      setStorageError(null);
      if (mountedRef.current) setProjects(next);
    } catch (error) {
      setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to delete project');
    }
  }, []);

  const loadProject = useCallback((project: SavedProject) => ({ doc: project.doc }), []);

  const deleteRecoveryDraft = useCallback(() => {
    deleteStoredPreBlankDraft()
      .then(() => {
        if (mountedRef.current) setRecoveryDraft(null);
      })
      .catch((error) => {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to delete recovery copy');
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

function setMountedStorageError(
  mounted: boolean,
  setStorageError: (value: string | null) => void,
  error: unknown,
  fallback: string,
) {
  if (mounted) setStorageError(errorMessage(error, fallback));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function projectThumbnail(doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>) {
  try {
    return await generateThumbnail(doc, imageCache);
  } catch (err) {
    console.error('[projects] thumbnail generation failed, using placeholder', err);
    return PROJECT_THUMBNAIL_FALLBACK;
  }
}

function findProject(projects: SavedProject[], projectId?: string) {
  if (!projectId) return null;
  return projects.find((project) => project.id === projectId) ?? null;
}

function buildSavedProject({
  existingProject,
  name,
  storedDoc,
  thumbnail,
}: {
  existingProject: SavedProject | null;
  name: string;
  storedDoc: CanvasDocument;
  thumbnail: string;
}): SavedProject {
  const updatedAt = new Date().toISOString();
  return {
    id: savedProjectId(existingProject),
    name,
    doc: storedDoc,
    thumbnail,
    createdAt: savedProjectCreatedAt(existingProject, updatedAt),
    updatedAt,
  };
}

function savedProjectId(existingProject: SavedProject | null) {
  if (existingProject) return existingProject.id;
  return createProjectId();
}

function savedProjectCreatedAt(existingProject: SavedProject | null, fallback: string) {
  if (existingProject) return existingProject.createdAt;
  return fallback;
}

function createProjectId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
