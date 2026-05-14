import type { CanvasDocument } from '../types/config';

export interface SavedProject {
  id: string;
  name: string;
  doc: CanvasDocument;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
}

export const PROJECTS_STORAGE_KEY = 'artifact-projects-v1';
export const MAX_PROJECTS = 30;
export const PROJECT_THUMBNAIL_FALLBACK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

export function normalizeSavedProjects(value: unknown): SavedProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSavedProject)
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
