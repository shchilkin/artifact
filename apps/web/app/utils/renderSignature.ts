/**
 * Render-relevant field signatures per node type.
 *
 * Each function returns a stable JSON string of only the fields that affect
 * visual output. UI-only fields (id, name, locked) are always excluded so
 * that renaming a layer or locking it never triggers a thumbnail re-render.
 *
 * Add a field here if and only if it is read by renderer.ts, pixiFilters.ts,
 * primitiveScene.ts, or primitiveRenderer.ts.
 */

import type {
  GraphColorNode,
  GraphEdge,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphTransformNode,
  Layer,
} from '../types/config';

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
  }
}

/** Render-relevant fields for a merge node. */
export function mergeNodeRenderSig(node: GraphMergeNode): string {
  return JSON.stringify([node.blendMode, node.opacity]);
}

/** Render-relevant fields for a color node. */
export function colorNodeRenderSig(node: GraphColorNode): string {
  return JSON.stringify([node.contrast, node.brightness, node.saturation, node.hue]);
}

/** Render-relevant fields for a repeat node. */
export function repeatNodeRenderSig(node: GraphRepeatNode): string {
  return JSON.stringify([
    node.pattern,
    node.count,
    node.rows,
    node.gap,
    node.radius,
    node.scale,
    node.jitter,
    node.rotation,
    node.rotationMode ?? 'fixed',
    node.rotationStep ?? 0,
    node.rotationJitter ?? 0,
    node.seedOffset,
    node.opacity,
    node.blendMode,
  ]);
}

/** Render-relevant fields for a mask node. */
export function maskNodeRenderSig(node: GraphMaskNode): string {
  return JSON.stringify([node.mode, node.invert, node.threshold, node.feather, node.expand, node.opacity]);
}

/** Render-relevant fields for a transform node. */
export function transformNodeRenderSig(node: GraphTransformNode): string {
  return JSON.stringify([
    node.x,
    node.y,
    node.scaleX,
    node.scaleY,
    node.rotation,
    node.pivotMode ?? 'canvas',
    node.opacity,
  ]);
}

/** Render-relevant fields for a grime shadow node. */
export function grimeShadowNodeRenderSig(node: GraphGrimeShadowNode): string {
  return JSON.stringify([
    node.x,
    node.y,
    node.layers,
    node.blur,
    node.spread,
    node.grime,
    node.jitter,
    node.opacity,
    node.color,
    node.seedOffset,
    node.shadowOnly,
  ]);
}

/** Render-relevant fields for a graph edge (topology change invalidates downstream). */
export function edgeRenderSig(edge: GraphEdge): string {
  return JSON.stringify([edge.fromId, edge.fromPort, edge.toId, edge.toPort]);
}
