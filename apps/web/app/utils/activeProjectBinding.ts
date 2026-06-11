import { documentFingerprint } from './documentFingerprint';
import type { SavedProject } from './projectLibrary';

const ACTIVE_PROJECT_BINDING_KEY = 'artifact-active-project-v1';

export interface ActiveProjectBinding {
  projectId: string;
  savedFingerprint: string;
}

function isActiveProjectBinding(value: unknown): value is ActiveProjectBinding {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ActiveProjectBinding>;
  return typeof candidate.projectId === 'string' && typeof candidate.savedFingerprint === 'string';
}

export function activeProjectFromBinding(
  projects: SavedProject[],
  binding: ActiveProjectBinding | null,
): SavedProject | null {
  if (!binding) return null;
  return projects.find((project) => project.id === binding.projectId) ?? null;
}

export function activeProjectBindingFor(project: SavedProject): ActiveProjectBinding {
  return {
    projectId: project.id,
    savedFingerprint: documentFingerprint(project.doc),
  };
}

export function loadActiveProjectBinding(storage: Storage | null | undefined): ActiveProjectBinding | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACTIVE_PROJECT_BINDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isActiveProjectBinding(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveActiveProjectBinding(
  storage: Storage | null | undefined,
  binding: ActiveProjectBinding | null,
): void {
  if (!storage) return;
  try {
    if (binding) storage.setItem(ACTIVE_PROJECT_BINDING_KEY, JSON.stringify(binding));
    else storage.removeItem(ACTIVE_PROJECT_BINDING_KEY);
  } catch {
    // Project binding is convenience state. Local document/project storage remains authoritative.
  }
}
