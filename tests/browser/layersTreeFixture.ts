import type { CanvasDocument, GraphEdge } from '../../apps/web/app/types/config';
import {
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMaskNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeTextLayer,
} from '../../apps/web/app/types/config';

function edge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return { id: `e-${fromId}-${toId}-${toPort}`, fromId, fromPort: 'out', toId, toPort };
}

/**
 * Custom graph for the Layers tree (v0.50 U6):
 *
 *   Output ← Headline(bg) ← Glow merge(a: Grade ← Backdrop, b: Cutout mask(in: Badge ← Pattern repeat, mask: Matte))
 *   Pattern repeat: in = Dot, bg = Backdrop (shared with Grade, so it appears as a reference row there)
 *   Not in output: Unused fill
 */
export const layersTreeDocument: CanvasDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  layers: [
    makeFillLayer({ id: 'tree-backdrop', name: 'Backdrop', color: '#203a8c' }),
    makeTextLayer({ id: 'tree-dot', name: 'Dot', content: '•', size: 60 }),
    makeTextLayer({ id: 'tree-matte', name: 'Matte', content: 'MATTE', size: 140 }),
    makeFillLayer({ id: 'tree-badge', name: 'Badge', color: '#e0503a', opacity: 70 }),
    makeTextLayer({ id: 'tree-headline', name: 'Headline', content: 'TREE', size: 120 }),
    makeFillLayer({ id: 'tree-unused', name: 'Unused fill', color: '#33cc88' }),
  ],
  graph: {
    edges: [
      edge('tree-backdrop', 'tree-grade', 'in'),
      edge('tree-grade', 'tree-glow', 'a'),
      edge('tree-dot', 'tree-pattern', 'in'),
      edge('tree-backdrop', 'tree-pattern', 'bg'),
      edge('tree-pattern', 'tree-badge', 'bg'),
      edge('tree-badge', 'tree-cutout', 'in'),
      edge('tree-matte', 'tree-cutout', 'mask'),
      edge('tree-cutout', 'tree-glow', 'b'),
      edge('tree-glow', 'tree-headline', 'bg'),
      edge('tree-headline', '__export__', 'in'),
    ],
    positions: {},
    mergeNodes: [makeGraphMergeNode({ id: 'tree-glow', name: 'Glow', blendMode: 'screen', opacity: 70 })],
    colorNodes: [makeGraphColorNode({ id: 'tree-grade', name: 'Grade' })],
    maskNodes: [makeGraphMaskNode({ id: 'tree-cutout', name: 'Cutout' })],
    repeatNodes: [makeGraphRepeatNode({ id: 'tree-pattern', name: 'Pattern' })],
    areas: [
      { id: 'tree-area-type', name: 'Type', nodeIds: ['tree-headline', 'tree-matte'], color: '#d8b04a' },
      { id: 'tree-area-texture', name: 'Texture', nodeIds: ['tree-pattern', 'tree-dot'], color: '#4ab0d8' },
    ],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
