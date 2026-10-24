import type { Layer } from '../../types/config';
import { inferLinearGraph } from '../../types/linearGraph';
import { isRecord, type StoredDocument } from './shared';

/**
 * Schema 4 -> 5: every document has a graph. A document saved as a plain layer stack gets the linear graph the
 * editor used to build for it on the fly (at render time and when the user opened Nodes).
 */
export function migrateV4ToV5(raw: StoredDocument): StoredDocument {
  if (isRecord(raw.graph)) return { ...raw, schemaVersion: 5 };
  const layers = Array.isArray(raw.layers)
    ? raw.layers.filter((layer): layer is Layer => isRecord(layer) && typeof layer.id === 'string')
    : [];
  return { ...raw, schemaVersion: 5, graph: inferLinearGraph(layers) };
}
