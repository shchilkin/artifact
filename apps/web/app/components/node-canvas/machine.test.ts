import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { nodeCanvasMachine } from './machine';
import type { ContextMenuState } from './types';

const paneMenu = (): Exclude<ContextMenuState, null> => ({
  type: 'pane-add',
  x: 120,
  y: 80,
  flowPos: { x: 20, y: 30 },
});

const nodeMenu = (): Exclude<ContextMenuState, null> => ({
  type: 'node',
  x: 220,
  y: 180,
  nodeId: 'text-a',
  isMerge: false,
  isExport: false,
});

function startNodeCanvasActor() {
  const actor = createActor(nodeCanvasMachine, { input: { selectedNodeIds: [] } });
  actor.start();
  return actor;
}

function startSelectedNodeCanvasActor(selectedNodeIds: string[]) {
  const actor = createActor(nodeCanvasMachine, { input: { selectedNodeIds } });
  actor.start();
  return actor;
}

describe('nodeCanvasMachine overlay state', () => {
  it('opens and explicitly closes context menus', () => {
    const actor = startNodeCanvasActor();

    actor.send({ type: 'CONTEXT_MENU_OPENED', menu: paneMenu() });
    expect(actor.getSnapshot().context.contextMenu).toEqual(paneMenu());

    actor.send({ type: 'CONTEXT_MENU_CLOSED' });
    expect(actor.getSnapshot().context.contextMenu).toBeNull();

    actor.stop();
  });

  it('replaces an open context menu with the latest menu request', () => {
    const actor = startNodeCanvasActor();

    actor.send({ type: 'CONTEXT_MENU_OPENED', menu: paneMenu() });
    actor.send({ type: 'CONTEXT_MENU_OPENED', menu: nodeMenu() });

    expect(actor.getSnapshot().context.contextMenu).toEqual(nodeMenu());

    actor.stop();
  });

  it('closes the context menu on canvas and selection actions', () => {
    const actor = startNodeCanvasActor();

    for (const event of [
      { type: 'PANE_CLICKED' as const },
      { type: 'NODE_SELECTED' as const, id: 'text-a', additive: false },
      { type: 'EDGE_SELECTED' as const, id: 'edge-a' },
    ]) {
      actor.send({ type: 'CONTEXT_MENU_OPENED', menu: paneMenu() });
      actor.send(event);
      expect(actor.getSnapshot().context.contextMenu).toBeNull();
    }

    actor.stop();
  });

  it('clears the context menu before opening the gallery overlay', () => {
    const actor = startNodeCanvasActor();

    actor.send({ type: 'CONTEXT_MENU_OPENED', menu: nodeMenu() });
    actor.send({ type: 'GALLERY_OPENED', nodeId: 'image-a' });

    expect(actor.getSnapshot().context.contextMenu).toBeNull();
    expect(actor.getSnapshot().context.galleryNodeId).toBe('image-a');

    actor.stop();
  });

  it('keeps selected node id references stable when validity filtering is a no-op', () => {
    const actor = startSelectedNodeCanvasActor(['shader-a']);
    const before = actor.getSnapshot().context.selectedNodeIds;

    actor.send({ type: 'FILTER_INVALID_REFERENCES', validNodeIds: ['shader-a'], validEdgeIds: [] });

    expect(actor.getSnapshot().context.selectedNodeIds).toBe(before);
    actor.stop();
  });
});
