import { describe, expect, it } from 'vitest';
import { ImageSourceWriteGate } from './imageSourceWriteGate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('delayed image storage', () => {
  it('uses the latest selection when saves finish out of order', async () => {
    let epoch = 0;
    const gate = new ImageSourceWriteGate(() => epoch);
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];
    const older = gate.storeThenApply(
      'image-1',
      'old',
      () => first.promise,
      (value) => applied.push(value),
    );
    const newer = gate.storeThenApply(
      'image-1',
      'new',
      () => second.promise,
      (value) => applied.push(value),
    );
    second.resolve('artifact-asset://new');
    await newer;
    first.resolve('artifact-asset://old');
    await older;
    expect(applied).toEqual(['artifact-asset://new']);
    epoch += 1;
  });

  it('drops a completion after New/Open replaces the document', async () => {
    let epoch = 0;
    const gate = new ImageSourceWriteGate(() => epoch);
    const saving = deferred<string>();
    const applied: string[] = [];
    const pending = gate.storeThenApply(
      'reused-id',
      'source',
      () => saving.promise,
      (value) => applied.push(value),
    );
    epoch += 1;
    gate.clear();
    saving.resolve('artifact-asset://old-document');
    await pending;
    expect(applied).toEqual([]);
  });
});
