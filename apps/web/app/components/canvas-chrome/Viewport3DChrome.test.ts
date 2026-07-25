import { describe, expect, it } from 'vitest';

import { resolveViewport3DStatus, viewport3DClassName } from './viewport3DChromeState';

describe('Viewport3DChrome', () => {
  it('prioritizes unavailable and failed states over loading or ready frames', () => {
    expect(resolveViewport3DStatus({ hasRenderedFrame: false })).toBe('loading');
    expect(resolveViewport3DStatus({ hasRenderedFrame: true })).toBe('ready');
    expect(resolveViewport3DStatus({ hasRenderedFrame: true, failed: true })).toBe('failed');
    expect(resolveViewport3DStatus({ hasRenderedFrame: true, unavailable: true, failed: true })).toBe('unavailable');
  });

  it('keeps locked viewports free of React Flow event-isolation classes', () => {
    const locked = viewport3DClassName({
      className: 'custom-frame',
      interactive: true,
      locked: true,
      status: 'ready',
    });
    const unlocked = viewport3DClassName({
      interactive: true,
      locked: false,
      status: 'ready',
    });

    expect(locked).toContain('artifact-viewport3d--locked');
    expect(locked).toContain('custom-frame');
    expect(locked).not.toContain('nodrag');
    expect(locked).not.toContain('nopan');
    expect(locked).not.toContain('nowheel');
    expect(unlocked).toContain('nodrag nopan nowheel');
  });
});
