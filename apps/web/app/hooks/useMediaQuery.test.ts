import { describe, expect, it, vi } from 'vitest';

import { type MediaQuerySource, watchMediaQuery } from './useMediaQuery';

function fakeQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const source: MediaQuerySource = {
    matches: initial,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const change = (matches: boolean) => {
    source.matches = matches;
    for (const listener of listeners) listener();
  };
  return { source, change, listeners };
}

const flushMicrotasks = () => Promise.resolve();

describe('watchMediaQuery', () => {
  it('reports the current match once when it starts watching', () => {
    const { source } = fakeQuery(true);
    const onChange = vi.fn();
    watchMediaQuery(source, onChange);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  // Firefox can run change listeners synchronously inside a style flush, which may happen while React is
  // rendering another component. The update must wait until that call stack has finished.
  it('never reports a change from inside the change listener', async () => {
    const { source, change } = fakeQuery(false);
    const onChange = vi.fn();
    watchMediaQuery(source, onChange);
    onChange.mockClear();

    change(true);
    expect(onChange).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('reports the latest match when several changes land before it runs', async () => {
    const { source, change } = fakeQuery(false);
    const onChange = vi.fn();
    watchMediaQuery(source, onChange);
    onChange.mockClear();

    change(true);
    change(false);
    await flushMicrotasks();
    expect(onChange.mock.calls.at(-1)).toEqual([false]);
  });

  it('stops listening and drops a pending change once stopped', async () => {
    const { source, change, listeners } = fakeQuery(false);
    const onChange = vi.fn();
    const stop = watchMediaQuery(source, onChange);
    onChange.mockClear();

    change(true);
    stop();
    await flushMicrotasks();
    expect(onChange).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
