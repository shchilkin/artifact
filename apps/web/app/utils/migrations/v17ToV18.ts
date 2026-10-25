import { isRecord, type StoredDocument } from './shared';

/** Frozen: the Grime Shadow node's defaults when this step shipped. */
const GRIME_SHADOW_DEFAULTS = {
  x: 8,
  y: 10,
  layers: 5,
  blur: 10,
  spread: 14,
  grime: 45,
  jitter: 10,
  opacity: 58,
  color: '#090606',
  seedOffset: 0,
  shadowOnly: false,
};

/** Frozen: the hash the Grime Shadow renderer salted its random stream with. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shadowLayer(id: string, stored: Record<string, unknown>): Record<string, unknown> {
  const node = { ...GRIME_SHADOW_DEFAULTS, ...stored };
  const drop = node.layers === 1 && node.grime === 0 && node.jitter === 0;
  return {
    id,
    kind: 'effect',
    name: typeof stored.name === 'string' ? stored.name : 'Grime Shadow',
    visible: stored.hidden !== true,
    locked: false,
    preset: 'grimeShadow',
    maskAlpha: false,
    seedOffset: node.seedOffset,
    mix: 100,
    effects: [
      {
        id: `${id}-shadow`,
        effect: 'shadow',
        enabled: true,
        params: {
          mode: drop ? 'drop' : 'grime',
          opacity: node.opacity,
          color: node.color,
          x: node.x,
          y: node.y,
          blur: node.blur,
          spread: node.spread,
          layers: node.layers,
          grime: node.grime,
          jitter: node.jitter,
          source: node.shadowOnly === true ? 'hide' : 'show',
          variation: hashString(id),
        },
      },
    ],
  };
}

/** The layer feeding a node's `in` port, if that is a layer. */
function upstreamLayerId(graph: Record<string, unknown>, id: string, layerIds: ReadonlySet<string>): string | null {
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const edge = edges.find((item) => isRecord(item) && item.toId === id && item.toPort === 'in');
  return isRecord(edge) && typeof edge.fromId === 'string' && layerIds.has(edge.fromId) ? edge.fromId : null;
}

/**
 * Schema 17 -> 18: Grime Shadow graph nodes become effect layers running the Shadow effect, with the node's id,
 * settings, and connections, so they render the same pixels. Each joins the layer list right after the layer
 * feeding it, or at the end.
 */
export function migrateV17ToV18(raw: StoredDocument): StoredDocument {
  if (!isRecord(raw.graph) || !isRecord(raw.graph.nodes)) return { ...raw, schemaVersion: 18 };
  const graph = raw.graph;
  const nodes: Record<string, unknown> = { ...raw.graph.nodes };
  const layers: unknown[] = Array.isArray(raw.layers) ? [...raw.layers] : [];
  for (const [id, node] of Object.entries(raw.graph.nodes)) {
    if (!isRecord(node) || node.kind !== 'grimeShadow') continue;
    delete nodes[id];
    const layerIds = new Set(
      layers.flatMap((layer) => (isRecord(layer) && typeof layer.id === 'string' ? [layer.id] : [])),
    );
    const upstream = upstreamLayerId(graph, id, layerIds);
    const index = upstream ? layers.findIndex((layer) => isRecord(layer) && layer.id === upstream) + 1 : layers.length;
    layers.splice(index, 0, shadowLayer(id, node));
  }
  return { ...raw, schemaVersion: 18, layers, graph: { ...graph, nodes } };
}
