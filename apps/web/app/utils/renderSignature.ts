/**
 * Render-relevant field signatures per node type.
 *
 * Each function returns a stable JSON string of only the fields that affect
 * visual output. UI-only fields (id, name, locked) are always excluded so
 * that renaming a layer or locking it never triggers a thumbnail re-render.
 *
 * Add a field here if and only if it is read by renderer.ts, pixiFilters.ts,
 * primitiveScene.ts, primitiveRenderer.ts, or modelRenderer.ts.
 */

import type { CanvasGraph, GraphEdge, Layer, PrimitiveViewportStateConfig } from '../types/config';
import { type GraphNode, modelOfNode } from './nodeKinds';

/** Content signature for a single layer (all render-relevant fields). */
export function layerRenderSig(layer: Layer): string {
  switch (layer.kind) {
    case 'text': {
      const { visible, content, font, size, color, opacity, blendMode, x, y, rotation, align, scaleX, scaleY } = layer;
      return JSON.stringify([
        layer.kind,
        visible,
        content,
        font,
        size,
        color,
        opacity,
        blendMode,
        x,
        y,
        rotation,
        align,
        scaleX,
        scaleY,
      ]);
    }
    case 'image': {
      const { visible, src, fit, opacity, blendMode, x, y, scaleX, scaleY, rotation } = layer;
      return JSON.stringify([layer.kind, visible, src, fit, opacity, blendMode, x, y, scaleX, scaleY, rotation]);
    }
    case 'emoji': {
      const { visible, emojis, density, minSz, maxSz, blur, seedOffset, opacity, blendMode } = layer;
      return JSON.stringify([layer.kind, visible, emojis, density, minSz, maxSz, blur, seedOffset, opacity, blendMode]);
    }
    case 'fill': {
      const { visible, color, opacity, blendMode } = layer;
      return JSON.stringify([layer.kind, visible, color, opacity, blendMode]);
    }
    case 'effect': {
      // All effect fields are render-relevant. Exclude only id, name, locked.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, name: _name, locked: _locked, ...render } = layer;
      return JSON.stringify(render);
    }
    case 'lineField': {
      // Line fields are full-frame procedural material; placement fields are ignored by the renderer.
      return JSON.stringify([
        layer.kind,
        layer.visible,
        layer.opacity,
        layer.blendMode,
        layer.color,
        layer.accentColor,
        layer.seedOffset,
        layer.lineFieldOrientation,
        layer.lineFieldDistortion,
        layer.lineFieldCount,
        layer.lineFieldSpacing,
        layer.lineFieldStroke,
        layer.lineFieldStrength,
        layer.lineFieldFrequency,
        layer.lineFieldBackground,
        layer.lineFieldTransparent,
      ]);
    }
    case 'primitive':
    case 'noise':
    case 'array': {
      // All procedural fields are render-relevant. Exclude only id, name, locked.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, name: _name, locked: _locked, ...render } = layer;
      return JSON.stringify(render);
    }
    case 'model': {
      return JSON.stringify([
        layer.kind,
        layer.visible,
        layer.opacity,
        layer.blendMode,
        layer.color,
        layer.accentColor,
        layer.tiltX,
        layer.tiltY,
        layer.tiltZ,
        layer.modelSrc,
      ]);
    }
  }
}

/** Render-relevant fields for a graph edge (topology change invalidates downstream). */
export function edgeRenderSig(edge: GraphEdge): string {
  return JSON.stringify([edge.fromId, edge.fromPort, edge.toId, edge.toPort]);
}

/** Camera signature for a primitive, model, or 3D scene node; `default` when no view state is set. */
export function viewStateRenderSig(view: PrimitiveViewportStateConfig | undefined): string {
  return view ? `${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}` : 'default';
}

/** Render-relevant fields for a graph-only node, from its kind's model. */
export function graphNodeRenderSig(node: GraphNode): string {
  return modelOfNode(node).renderSignature(node);
}

/** Render signatures of every graph-only node. Layers and edges have their own signatures. */
export function graphNodeRenderSigs(graph: Pick<CanvasGraph, 'nodes'>) {
  return Object.values(graph.nodes).map((node) => ({ id: node.id, kind: node.kind, sig: graphNodeRenderSig(node) }));
}
