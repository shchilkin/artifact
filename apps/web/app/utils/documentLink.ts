import type { CanvasDocument } from '../types/config';
import { isLayerStackGraph } from './nodeGraph';

/**
 * Document JSON for a `?doc=` link. A layer-stack graph is fully determined by the layers, so it is left out
 * unless it carries areas or saved camera views; `normalizeDocument` rebuilds it when the link opens. This keeps
 * links for layer documents as short as they were before every document had a graph.
 */
export function serializeDocumentForLink(doc: CanvasDocument): string {
  const { graph, ...withoutGraph } = doc;
  const derivable =
    isLayerStackGraph(doc) &&
    (graph.areas?.length ?? 0) === 0 &&
    Object.keys(graph.primitiveViewStates ?? {}).length === 0;
  return JSON.stringify(derivable ? withoutGraph : doc);
}

/** Editor path that opens this document, e.g. `/app?doc=...&from=docs`. */
export function editorDocumentPath(doc: CanvasDocument, extraParams: Record<string, string> = {}): string {
  const extra = Object.entries(extraParams)
    .map(([key, value]) => `&${key}=${encodeURIComponent(value)}`)
    .join('');
  return `/app?doc=${encodeURIComponent(serializeDocumentForLink(doc))}${extra}`;
}
