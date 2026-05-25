export type { GraphRenderCache } from './render/graph';
export type { RenderOptions } from './render/layers';

import type { CanvasDocument } from '../types/config';
import { EXPORT_NODE_ID, inferLinearGraph } from './nodeGraph';
import { type GraphRenderCache, renderGraphTarget } from './render/graph';
import type { RenderOptions } from './render/layers';

export { renderGraphTarget } from './render/graph';

export const DOCUMENT_RENDER_MEASURE = 'artifact:document-render';

async function measureDocumentRender<T>(task: () => Promise<T>): Promise<T> {
  if (
    typeof performance === 'undefined' ||
    typeof performance.mark !== 'function' ||
    typeof performance.measure !== 'function'
  )
    return task();

  const markId = `${DOCUMENT_RENDER_MEASURE}:${Math.random().toString(36).slice(2)}`;
  const startMark = `${markId}:start`;
  const endMark = `${markId}:end`;

  try {
    performance.mark(startMark);
    const result = await task();
    performance.mark(endMark);
    performance.measure(DOCUMENT_RENDER_MEASURE, startMark, endMark);
    return result;
  } finally {
    performance.clearMarks?.(startMark);
    performance.clearMarks?.(endMark);
  }
}

export async function renderDocument(
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions = {},
  renderCache?: GraphRenderCache,
): Promise<HTMLCanvasElement> {
  return measureDocumentRender(async () => {
    if (options.graphMode === 'graph' && doc.graph) {
      return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, options, renderCache);
    }

    if (options.graphMode !== 'stack' && doc.graph) {
      return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, options, renderCache);
    }

    // Stack mode: infer a linear graph from doc.layers and execute it.
    // This guarantees identical rendering logic between layer and node views,
    // bypassing any custom edges in doc.graph while preserving correct layer order.
    const tempGraph = inferLinearGraph(doc.layers);
    return renderGraphTarget(
      doc,
      tempGraph,
      EXPORT_NODE_ID,
      W,
      H,
      imageCache,
      { ...options, outputBackground: 'document' },
      renderCache,
    );
  });
}
