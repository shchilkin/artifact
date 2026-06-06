import type { CanvasDocument } from '../types/config';
import { loadPreBlankDraft, normalizeDocument, PRE_BLANK_DRAFT_KEY, type PreBlankDraft } from './documentPersistence';
import { openIndexedDatabase, requestToPromise, withIndexedDbStore } from './indexedDb';
import {
  deleteProjectSnapshot,
  MAX_PROJECTS,
  normalizeSavedProjects,
  PROJECTS_STORAGE_KEY,
  type SavedProject,
  saveProjectSnapshot,
} from './projectLibrary';

const DB_NAME = 'artifact-local-projects';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const DRAFTS_STORE = 'drafts';
const PRE_BLANK_DRAFT_ID = 'pre-blank';

interface StoredDraft {
  id: string;
  doc: CanvasDocument;
  savedAt: string;
  reason: PreBlankDraft['reason'];
}

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    openErrorMessage: 'Unable to open project database',
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projects = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
      }
    },
  });
}

async function withStore<T>(
  storeName: typeof PROJECTS_STORE | typeof DRAFTS_STORE,
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  return withIndexedDbStore(openDatabase, storeName, mode, read);
}

function loadLegacyProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return normalizeSavedProjects(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function clearLegacyProjects() {
  try {
    localStorage.removeItem(PROJECTS_STORAGE_KEY);
  } catch {
    // Ignore unavailable localStorage.
  }
}

export async function listStoredProjects(): Promise<SavedProject[]> {
  const projects = await withStore(PROJECTS_STORE, 'readonly', async (store) => {
    const records = await requestToPromise<unknown[]>(store.getAll());
    return normalizeSavedProjects(records);
  });

  if (projects.length > 0) return projects;

  const legacy = loadLegacyProjects();
  if (legacy.length === 0) return [];

  await replaceStoredProjects(legacy);
  clearLegacyProjects();
  return legacy;
}

async function replaceStoredProjects(projects: SavedProject[]): Promise<SavedProject[]> {
  const normalized = normalizeSavedProjects(projects);
  await withStore(PROJECTS_STORE, 'readwrite', async (store) => {
    await requestToPromise(store.clear());
    for (const project of normalized) {
      store.put(project);
    }
  });
  return normalized;
}

export async function saveStoredProject(project: SavedProject): Promise<SavedProject[]> {
  const current = await listStoredProjects();
  const next = saveProjectSnapshot(current, project);
  return replaceStoredProjects(next);
}

export async function deleteStoredProject(id: string): Promise<SavedProject[]> {
  const current = await listStoredProjects();
  const next = deleteProjectSnapshot(current, id).slice(0, MAX_PROJECTS);
  return replaceStoredProjects(next);
}

function loadLegacyDraft(): PreBlankDraft | null {
  try {
    return loadPreBlankDraft(localStorage) ?? loadPreBlankDraft(sessionStorage);
  } catch {
    return null;
  }
}

function clearLegacyDraft() {
  try {
    localStorage.removeItem(PRE_BLANK_DRAFT_KEY);
  } catch {
    // Ignore unavailable localStorage.
  }
  try {
    sessionStorage.removeItem(PRE_BLANK_DRAFT_KEY);
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function normalizeStoredDraft(value: unknown): PreBlankDraft | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredDraft>;
  if (!isStoredPreBlankDraft(candidate)) return null;
  return { reason: 'before-blank', savedAt: candidate.savedAt, doc: normalizeDocument(candidate.doc) };
}

function isStoredPreBlankDraft(candidate: Partial<StoredDraft>): candidate is StoredDraft {
  return (
    candidate.id === PRE_BLANK_DRAFT_ID && candidate.reason === 'before-blank' && typeof candidate.savedAt === 'string'
  );
}

export async function loadStoredPreBlankDraft(): Promise<PreBlankDraft | null> {
  const draft = await withStore(DRAFTS_STORE, 'readonly', async (store) => {
    return normalizeStoredDraft(await requestToPromise<unknown>(store.get(PRE_BLANK_DRAFT_ID)));
  });

  if (draft) return draft;

  const legacy = loadLegacyDraft();
  if (!legacy) return null;

  await saveStoredPreBlankDraft(legacy.doc, new Date(legacy.savedAt));
  clearLegacyDraft();
  return legacy;
}

export async function saveStoredPreBlankDraft(doc: CanvasDocument, date = new Date()): Promise<void> {
  const draft: StoredDraft = {
    id: PRE_BLANK_DRAFT_ID,
    reason: 'before-blank',
    savedAt: date.toISOString(),
    doc,
  };

  await withStore(DRAFTS_STORE, 'readwrite', async (store) => {
    store.put(draft);
  });
}

export async function deleteStoredPreBlankDraft(): Promise<void> {
  await withStore(DRAFTS_STORE, 'readwrite', async (store) => {
    store.delete(PRE_BLANK_DRAFT_ID);
  });
  clearLegacyDraft();
}
