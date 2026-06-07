import { describe, expect, it } from 'vitest';

import type { CanvasDocument } from '../types/config';
import {
  activeProjectBindingFor,
  activeProjectFromBinding,
  loadActiveProjectBinding,
  saveActiveProjectBinding,
} from './activeProjectBinding';
import type { SavedProject } from './projectLibrary';

const doc = {
  global: { bg: '#000000', seed: 1, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
} as CanvasDocument;

const project: SavedProject = {
  id: 'project-a',
  name: 'Project A',
  doc,
  thumbnail: 'data:image/png;base64,aaaa',
  createdAt: '2026-06-07T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
};

describe('activeProjectBinding', () => {
  it('creates a binding from a saved project and resolves it from the project list', () => {
    const binding = activeProjectBindingFor(project);

    expect(binding.projectId).toBe(project.id);
    expect(activeProjectFromBinding([project], binding)).toBe(project);
    expect(activeProjectFromBinding([], binding)).toBeNull();
  });

  it('persists and clears the active project binding as editor session state', () => {
    const storage = new MapStorage();
    const binding = activeProjectBindingFor(project);

    saveActiveProjectBinding(storage, binding);
    expect(loadActiveProjectBinding(storage)).toEqual(binding);

    saveActiveProjectBinding(storage, null);
    expect(loadActiveProjectBinding(storage)).toBeNull();
  });
});

class MapStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}
