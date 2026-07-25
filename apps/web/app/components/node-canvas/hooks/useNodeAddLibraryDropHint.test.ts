import { describe, expect, it } from 'vitest';

import { resolveAddLibraryDropVisualState } from './useNodeAddLibraryDropHint';

describe('resolveAddLibraryDropVisualState', () => {
  it.each([
    [{ active: false, ready: false, edgeId: null, validAction: false }, 'inactive'],
    [{ active: true, ready: false, edgeId: null, validAction: false }, 'idle'],
    [{ active: true, ready: true, edgeId: null, validAction: true }, 'canvas-ready'],
    [{ active: true, ready: true, edgeId: 'edge-1', validAction: true }, 'edge-ready'],
    [{ active: true, ready: true, edgeId: null, validAction: false }, 'invalid'],
  ] as const)('maps %o to %s', (state, expected) => {
    expect(resolveAddLibraryDropVisualState(state)).toBe(expected);
  });
});
