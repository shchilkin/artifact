export type { RenderOptions } from './render/layers';

import type { CanvasDocument } from '../types/config';
import { EXPORT_NODE_ID, inferLinearGraph } from './nodeGraph';
import { renderGraphTarget } from './render/graph';
import type { RenderOptions } from './render/layers';

export { renderGraphTarget } from './render/graph';

export async function renderDocument(
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  if (options.graphMode === 'graph' && doc.graph) {
    return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, options);
  }

  if (options.graphMode !== 'stack' && doc.graph) {
    return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, options);
  }

  // Stack mode: infer a linear graph from doc.layers and execute it.
  // This guarantees identical rendering logic between layer and node views,
  // bypassing any custom edges in doc.graph while preserving correct layer order.
  const tempGraph = inferLinearGraph(doc.layers);
  return renderGraphTarget(doc, tempGraph, EXPORT_NODE_ID, W, H, imageCache, options);
}
