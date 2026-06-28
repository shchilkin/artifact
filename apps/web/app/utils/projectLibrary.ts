import type { CanvasDocument } from '../types/config';

export interface SavedProject {
  id: string;
  name: string;
  doc: CanvasDocument;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  storage?: ProjectStorageKind;
}

export type ProjectStorageKind = 'local' | 'cloud' | 'synced';

export const PROJECTS_STORAGE_KEY = 'artifact-projects-v1';
export const MAX_PROJECTS = 30;
const PROJECT_STORAGE_FULL_MESSAGE =
  'Project storage is full. Kept the app running and compacted saved thumbnails where possible.';
export const PROJECT_THUMBNAIL_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23080706'/%3E%3C/svg%3E";
const LEGACY_PROJECT_THUMBNAIL_FALLBACKS = new Set([
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
]);

export interface ProjectStorage {
  setItem(key: string, value: string): void;
}

function isSavedProject(value: unknown): value is SavedProject {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedProject>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.thumbnail === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Boolean(candidate.doc) &&
    typeof candidate.doc === 'object'
  );
}

function normalizeProjectThumbnail(thumbnail: string) {
  return LEGACY_PROJECT_THUMBNAIL_FALLBACKS.has(thumbnail) ? PROJECT_THUMBNAIL_FALLBACK : thumbnail;
}

export function normalizeProjectStorage(storage: unknown): ProjectStorageKind {
  return storage === 'cloud' || storage === 'synced' ? storage : 'local';
}

export function normalizeSavedProjects(value: unknown): SavedProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSavedProject)
    .map((project) => ({
      ...project,
      thumbnail: normalizeProjectThumbnail(project.thumbnail),
      storage: normalizeProjectStorage(project.storage),
    }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_PROJECTS);
}

export function saveProjectSnapshot(projects: SavedProject[], project: SavedProject): SavedProject[] {
  return [project, ...projects.filter((item) => item.id !== project.id)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_PROJECTS);
}

export function deleteProjectSnapshot(projects: SavedProject[], id: string): SavedProject[] {
  return projects.filter((project) => project.id !== id);
}

function withCompactThumbnails(projects: SavedProject[]): SavedProject[] {
  return projects.map((project) => ({ ...project, thumbnail: PROJECT_THUMBNAIL_FALLBACK }));
}

function uniqueStorageAttempts(projects: SavedProject[]): SavedProject[][] {
  const compacted = withCompactThumbnails(projects);
  const attempts = [projects, compacted, compacted.slice(0, 12), compacted.slice(0, 6), compacted.slice(0, 1)];
  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.length}:${attempt.every((project) => project.thumbnail === PROJECT_THUMBNAIL_FALLBACK)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isQuotaLikeError(error: unknown) {
  if (!(error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException))) return false;
  return error.name === 'QuotaExceededError' || /quota/i.test(error.message);
}

export interface PersistSavedProjectsResult {
  ok: boolean;
  projects: SavedProject[];
  compacted: boolean;
  error: string | null;
}

export function persistSavedProjects(storage: ProjectStorage, projects: SavedProject[]): PersistSavedProjectsResult {
  let lastError: unknown = null;
  for (const attempt of uniqueStorageAttempts(projects)) {
    try {
      storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(attempt));
      const compacted =
        attempt.length !== projects.length ||
        attempt.some((project, index) => project.thumbnail !== projects[index]?.thumbnail);
      return {
        ok: true,
        projects: attempt,
        compacted,
        error: compacted ? PROJECT_STORAGE_FULL_MESSAGE : null,
      };
    } catch (error) {
      lastError = error;
      if (!isQuotaLikeError(error)) break;
    }
  }

  return {
    ok: false,
    projects,
    compacted: false,
    error: lastError instanceof Error ? lastError.message : PROJECT_STORAGE_FULL_MESSAGE,
  };
}
