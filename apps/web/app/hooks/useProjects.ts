import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

import type { CanvasDocument, ImageLayer } from '../types/config';
import { getArtifactAuthBaseUrl } from '../utils/authClient';
import {
  deleteCloudProject,
  listCloudProjects,
  prepareCloudSavedProject,
  saveCloudProject,
} from '../utils/cloudProjectsClient';
import { storePortableDocumentAssets } from '../utils/documentAssets';
import { generateThumbnail, projectThumbnailDimensions } from '../utils/generateThumbnail';
import { preloadImageSources } from '../utils/preloadImageSources';
import {
  MAX_PROJECTS,
  normalizeProjectStorage,
  normalizeSavedProjects,
  PROJECT_THUMBNAIL_FALLBACK,
  PROJECTS_STORAGE_KEY,
  type ProjectStorageKind,
  type SavedProject,
} from '../utils/projectLibrary';
import {
  deleteStoredPreBlankDraft,
  deleteStoredProject,
  listStoredProjects,
  loadStoredPreBlankDraft,
  saveStoredPreBlankDraft,
  saveStoredProject,
} from '../utils/projectStore';
import { useArtifactAuth } from './useArtifactAuth';

function loadFromStorage(): SavedProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return normalizeSavedProjects(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

type LoadedPreBlankDraft = Awaited<ReturnType<typeof loadStoredPreBlankDraft>>;

export function draftToProject(draft: LoadedPreBlankDraft, thumbnail?: string): SavedProject | null {
  if (!draft) return null;
  return {
    id: 'pre-blank-draft',
    name: 'Previous work',
    doc: draft.doc,
    thumbnail: thumbnail ?? draft.thumbnail ?? PROJECT_THUMBNAIL_FALLBACK,
    createdAt: draft.savedAt,
    updatedAt: draft.savedAt,
  };
}

export function useProjects() {
  const auth = useArtifactAuth();
  const [projects, setProjects] = useState<SavedProject[]>(loadFromStorage);
  const [recoveryDraft, setRecoveryDraft] = useState<SavedProject | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refreshRecoveryDraft = useCallback(async () => {
    try {
      const draft = await loadStoredPreBlankDraft();
      const project = await recoveryDraftProject(draft);
      if (mountedRef.current) setRecoveryDraft(project);
    } catch (error) {
      setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load recovery copy');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    listStoredProjects()
      .then((items) => {
        if (mountedRef.current) setProjects(items);
        void refreshOutdatedProjectThumbnails(items, mountedRef, setProjects, setStorageError);
      })
      .catch((error) => {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load projects');
      });
    loadStoredPreBlankDraft()
      .then((draft) => {
        return recoveryDraftProject(draft);
      })
      .then((project) => {
        if (mountedRef.current) setRecoveryDraft(project);
      })
      .catch((error) => {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load recovery copy');
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!auth.configured || !auth.loaded || !auth.signedIn) return undefined;
    const controller = new AbortController();
    void auth
      .getToken()
      .then((bearerToken) =>
        listCloudProjects({ baseUrl: getArtifactAuthBaseUrl(), bearerToken, signal: controller.signal }),
      )
      .then((cloudProjects) => {
        if (!mountedRef.current) return;
        setStorageError(null);
        setProjects((current) => mergeProjects(current, cloudProjects));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to load cloud projects');
      });
    return () => controller.abort();
  }, [auth]);

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
        void autoSyncProjectToCloud(project, auth, mountedRef, setProjects, setStorageError);
        return project;
      } catch (error) {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to save project');
        return null;
      }
    },
    [auth, projects],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      try {
        const next = await deleteStoredProject(id);
        setStorageError(null);
        if (mountedRef.current) {
          setProjects((current) =>
            mergeProjects(
              next,
              current.filter((project) => project.id !== id),
            ),
          );
        }
        void deleteProjectFromCloud(id, auth, setStorageError);
      } catch (error) {
        setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to delete project');
      }
    },
    [auth],
  );

  const saveProjectToCloud = useCallback(
    async (project: SavedProject) => {
      if (!auth.configured || !auth.loaded || !auth.signedIn) {
        setStorageError('Sign in to save projects to cloud');
        return null;
      }
      return await uploadProjectToCloud(project, auth, mountedRef, setProjects, setStorageError);
    },
    [auth],
  );

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
    saveProjectToCloud,
    deleteProject,
    loadProject,
    deleteRecoveryDraft,
    refreshRecoveryDraft,
    maxProjects: MAX_PROJECTS,
  };
}

async function autoSyncProjectToCloud(
  project: SavedProject,
  auth: ReturnType<typeof useArtifactAuth>,
  mountedRef: MutableRefObject<boolean>,
  setProjects: (projects: SavedProject[] | ((projects: SavedProject[]) => SavedProject[])) => void,
  setStorageError: (value: string | null) => void,
) {
  if (!auth.configured || !auth.signedIn) return;
  await uploadProjectToCloud(project, auth, mountedRef, setProjects, setStorageError);
}

async function uploadProjectToCloud(
  project: SavedProject,
  auth: ReturnType<typeof useArtifactAuth>,
  mountedRef: MutableRefObject<boolean>,
  setProjects: (projects: SavedProject[] | ((projects: SavedProject[]) => SavedProject[])) => void,
  setStorageError: (value: string | null) => void,
) {
  try {
    const bearerToken = await auth.getToken();
    const cloudProject = await prepareCloudSavedProject(project);
    const saved = await saveCloudProject(cloudProject, { baseUrl: getArtifactAuthBaseUrl(), bearerToken });
    if (mountedRef.current) setProjects((current) => mergeProjects(current, [saved]));
    if (mountedRef.current) setStorageError(null);
    return saved;
  } catch (error) {
    setMountedStorageError(mountedRef.current, setStorageError, error, 'Saved locally. Cloud sync failed');
    return null;
  }
}

async function deleteProjectFromCloud(
  id: string,
  auth: ReturnType<typeof useArtifactAuth>,
  setStorageError: (value: string | null) => void,
) {
  if (!auth.configured || !auth.signedIn) return;
  try {
    const bearerToken = await auth.getToken();
    await deleteCloudProject(id, { baseUrl: getArtifactAuthBaseUrl(), bearerToken });
  } catch (error) {
    setStorageError(errorMessage(error, 'Deleted locally. Cloud delete failed'));
  }
}

export function mergeProjects(localProjects: SavedProject[], cloudProjects: SavedProject[]) {
  const byId = new Map<string, SavedProject>();
  for (const project of [...localProjects, ...cloudProjects]) {
    const existing = byId.get(project.id);
    const candidate = normalizeProjectForMerge(project);
    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }
    byId.set(candidate.id, mergeProjectRecords(existing, candidate));
  }
  return normalizeSavedProjects(Array.from(byId.values()));
}

function normalizeProjectForMerge(project: SavedProject): SavedProject {
  return { ...project, storage: normalizeProjectStorage(project.storage) };
}

function mergeProjectRecords(current: SavedProject, incoming: SavedProject): SavedProject {
  const currentUpdatedAt = Date.parse(current.updatedAt);
  const incomingUpdatedAt = Date.parse(incoming.updatedAt);
  const newest = incomingUpdatedAt >= currentUpdatedAt ? incoming : current;
  return { ...newest, storage: mergeProjectStorage(current.storage, incoming.storage) };
}

export function mergeProjectStorage(a: SavedProject['storage'], b: SavedProject['storage']): ProjectStorageKind {
  const storage = new Set([normalizeProjectStorage(a), normalizeProjectStorage(b)]);
  if (storage.has('synced') || (storage.has('local') && storage.has('cloud'))) return 'synced';
  if (storage.has('cloud')) return 'cloud';
  return 'local';
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

async function recoveryDraftProject(draft: LoadedPreBlankDraft): Promise<SavedProject | null> {
  if (!draft) return null;
  const thumbnail = await recoveryDraftThumbnail(draft);
  return draftToProject(draft, thumbnail);
}

async function recoveryDraftThumbnail(draft: NonNullable<LoadedPreBlankDraft>) {
  if (draft.thumbnail && !(await thumbnailNeedsUpgrade(draft.thumbnail, draft.doc))) return draft.thumbnail;
  const thumbnail = await projectThumbnail(draft.doc, await projectImageCache(draft.doc));
  if (thumbnail !== PROJECT_THUMBNAIL_FALLBACK) {
    void saveStoredPreBlankDraft(draft.doc, new Date(draft.savedAt), { thumbnail }).catch(() => {
      // Recovery thumbnails are an optimization; loading the draft should still work.
    });
  }
  return thumbnail;
}

async function refreshOutdatedProjectThumbnails(
  projects: SavedProject[],
  mountedRef: MutableRefObject<boolean>,
  setProjects: (projects: SavedProject[]) => void,
  setStorageError: (value: string | null) => void,
) {
  for (const project of projects) {
    if (!mountedRef.current) return;
    if (!(await thumbnailNeedsUpgrade(project.thumbnail, project.doc))) continue;
    const thumbnail = await projectThumbnail(project.doc, await projectImageCache(project.doc));
    if (!mountedRef.current || thumbnail === project.thumbnail) continue;
    try {
      const next = await saveStoredProject({ ...project, thumbnail });
      setStorageError(null);
      if (mountedRef.current) setProjects(next);
    } catch (error) {
      setMountedStorageError(mountedRef.current, setStorageError, error, 'Unable to update project preview');
    }
  }
}

async function projectImageCache(doc: CanvasDocument) {
  const imageCache = new Map<string, HTMLImageElement>();
  await preloadImageSources(projectImageSources(doc), imageCache);
  return imageCache;
}

function projectImageSources(doc: CanvasDocument) {
  return Array.from(
    new Set(
      doc.layers
        .filter((layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.src))
        .map((layer) => layer.src),
    ),
  );
}

async function thumbnailNeedsUpgrade(thumbnail: string, doc: CanvasDocument) {
  if (thumbnail === PROJECT_THUMBNAIL_FALLBACK) return true;
  const size = await imageDimensions(thumbnail);
  if (!size) return true;
  const expected = projectThumbnailDimensions(doc);
  const currentShortEdge = Math.min(size.width, size.height);
  const expectedShortEdge = Math.min(expected.width, expected.height);
  return currentShortEdge < expectedShortEdge * 0.95;
}

function imageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
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
    storage: 'local',
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
