import { describe, expect, it, vi } from 'vitest';
import type { CanvasDocument } from '../types/config';
import { documentFingerprint } from './documentFingerprint';
import { createBlankDocument } from './documentPersistence';
import type { SavedProject } from './projectLibrary';
import { acceptProjectDocument } from './projectLoadBinding';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe('project binding after asynchronous shared-core Open', () => {
  it('keeps the old binding on rejection and binds only the document that actually wins', async () => {
    const old = createBlankDocument();
    const prepared = { ...old, global: { ...old.global, seed: old.global.seed + 1 } };
    const project = { id: 'project-new', doc: prepared } as SavedProject;
    let current: CanvasDocument = old;
    let binding: string | null = 'project-old';
    const bind = vi.fn((next: { projectId: string } | null) => {
      binding = next?.projectId ?? null;
    });

    const rejected = deferred<CanvasDocument | null>();
    const failed = acceptProjectDocument(
      project,
      prepared,
      () => rejected.promise,
      () => current,
      bind,
    );
    expect(binding).toBe('project-old');
    rejected.resolve(null);
    expect(await failed).toBe(false);
    expect(current).toBe(old);
    expect(binding).toBe('project-old');

    const accepted = deferred<CanvasDocument | null>();
    const loading = acceptProjectDocument(
      project,
      prepared,
      () => accepted.promise,
      () => current,
      bind,
    );
    expect(binding).toBe('project-old');
    current = prepared;
    accepted.resolve(prepared);
    expect(await loading).toBe(true);
    expect(binding).toBe('project-new');
    expect(bind).toHaveBeenLastCalledWith({
      projectId: 'project-new',
      savedFingerprint: documentFingerprint(prepared),
    });

    const superseded = deferred<CanvasDocument | null>();
    const stale = acceptProjectDocument(
      project,
      prepared,
      () => superseded.promise,
      () => current,
      bind,
    );
    const winner = { ...prepared, export: { ...prepared.export, format: 'jpeg' as const } };
    current = winner;
    superseded.resolve(prepared);
    expect(await stale).toBe(false);
    expect(binding).toBe('project-new');
  });
});
