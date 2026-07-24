import { describe, expect, it } from 'vitest';
import { CANVAS_CHROME_INVARIANTS, CANVAS_CHROME_SURFACES } from './canvasChromeInventory';

describe('canvas chrome inventory', () => {
  it('closes every v0.47 canvas-chrome surface with an explicit state mapping', () => {
    expect(CANVAS_CHROME_SURFACES.map(({ id }) => id)).toEqual([
      'graph-viewport',
      'graph-areas',
      'nodes',
      'edges-and-ports',
      'canvas-preview',
      'thumbnails-and-gallery',
      'primitive-viewport',
      'scene-3d-viewport',
    ]);

    for (const surface of CANVAS_CHROME_SURFACES) {
      expect(
        surface.states.map(({ name }) => name),
        `${surface.id} state contract changed`,
      ).toEqual(EXPECTED_CANVAS_CHROME_STATES[surface.id]);
      expect(surface.ownerIssue).toMatch(/^#17[2-6]$/);
      for (const state of surface.states) {
        expect(state.name).not.toHaveLength(0);
        expect(state.pattern).not.toHaveLength(0);
        expect(['artifact-pattern', 'approved-non-goal']).toContain(state.disposition);
      }
    }
  });

  it('names every semantic boundary that chrome work must preserve', () => {
    expect(CANVAS_CHROME_INVARIANTS.map(({ id }) => id)).toEqual([
      'canvas-document',
      'graph-semantics',
      'renderer-entry-points',
      'render-signatures-and-caches',
      'export',
      'pointer-geometry',
      'camera-ownership',
    ]);

    for (const invariant of CANVAS_CHROME_INVARIANTS) {
      expect(invariant.rule).not.toHaveLength(0);
      expect(invariant.proof).not.toHaveLength(0);
    }
  });
});

const EXPECTED_CANVAS_CHROME_STATES = {
  'graph-viewport': [
    'Resting grid',
    'Empty graph',
    'Pan and zoom controls',
    'React Flow attribution',
    'Selection marquee',
    'Node alignment guides',
    'Add Library drag idle',
    'Add Library canvas-ready drop',
    'Add Library edge-ready drop',
    'Invalid canvas drop target',
    'Pane, node, and edge menus',
    'Toolbar default and hover',
    'Toolbar keyboard focus',
    'Toolbar pressed',
    'Toolbar disabled',
    'Area create and add-to-area actions',
    'Account loading, signed-out, and signed-in actions',
    'Preview queue status',
    'Performance metrics overlay',
    'Rendered graph position',
  ],
  'graph-areas': [
    'Default area',
    'Selected area',
    'Collapsed area',
    'Empty area',
    'Dragging through an area',
    'Area color',
  ],
  nodes: [
    'Default node',
    'Hover',
    'Keyboard focus',
    'Selected',
    'Dragging',
    'Muted or hidden',
    'Locked or delete-disabled',
    'Output path',
    'Thumbnail loading',
    'Thumbnail ready',
    'Thumbnail failed',
    'AI loading, error, current, and history badges',
    'Rendered node pixels',
  ],
  'edges-and-ports': [
    'Default edge',
    'Selected edge',
    'Output-path edge',
    'Valid insertion edge',
    'Invalid connection',
    'Disconnected port',
    'Connected port',
    'Connecting from or to port',
    'Port keyboard focus',
    'Edge routing and port coordinates',
  ],
  'canvas-preview': [
    'Loaded opaque artwork',
    'Loaded transparent artwork',
    'Empty canvas',
    'Render error',
    'Recovery frame',
    'Selected transformable layer',
    'Locked selection',
    'Hidden selection',
    'Document, file, and image drop previews',
    'Pointer and keyboard manipulation',
    'Rendered document pixels',
  ],
  'thumbnails-and-gallery': [
    'Thumbnail loading',
    'Thumbnail ready',
    'Thumbnail failed',
    'Selected thumbnail',
    'Full gallery open',
    'Narrow gallery',
    'Gallery keyboard focus',
    'Gallery pan and zoom active',
    'Gallery transform handles',
    'Rendered preview pixels',
  ],
  'primitive-viewport': [
    'Loading',
    'Ready and passive',
    'Active and unlocked',
    'Hover camera ownership',
    'Keyboard focus',
    'Locked pass-through',
    'Reset available',
    'WebGL unavailable',
    'Node and modal modes',
    'Rendered primitive pixels',
  ],
  'scene-3d-viewport': [
    'Scene loading',
    'Scene ready',
    'Scene active',
    'Scene locked',
    'Model or environment missing',
    'Environment ready',
    'Camera reset available',
    'Rendered scene pixels',
  ],
} as const satisfies Record<(typeof CANVAS_CHROME_SURFACES)[number]['id'], readonly string[]>;
