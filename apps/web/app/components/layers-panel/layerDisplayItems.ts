import type { CanvasGraph, EffectLayer, GraphArea, Layer, LayerKind } from '../../types/config';
import { EFFECT_PRESETS } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { GRAPH_NODE_KINDS, GRAPH_NODE_MODELS, type GraphNodeKind } from '../../utils/nodeKinds';

const KIND_ICONS: Record<LayerKind, string> = {
  text: 'T',
  image: '◻',
  emoji: '✦',
  effect: '⚡',
  fill: '■',
  primitive: '◍',
  noise: '░',
  array: '▦',
  lineField: '≋',
  model: '⬡',
};

export type GraphHelperKind = GraphNodeKind | 'export';

export interface GraphHelperRowData {
  id: string;
  name: string;
  kind: GraphHelperKind;
  icon: string;
  label: string;
}

export type LayerDisplayItem =
  | { type: 'layer'; layer: Layer; areas: GraphArea[]; nested?: false }
  | { type: 'area'; area: GraphArea; layers: Layer[]; graphHelpers: GraphHelperRowData[] };

export function getLayerIcon(layer: Layer): string {
  if (layer.kind === 'effect') return EFFECT_PRESETS[(layer as EffectLayer).preset!]?.icon ?? KIND_ICONS.effect;
  return KIND_ICONS[layer.kind];
}

export const GRAPH_HELPER_META: Record<GraphHelperKind, { icon: string; label: string }> = {
  ...(Object.fromEntries(
    GRAPH_NODE_KINDS.map((kind) => [
      kind,
      { icon: GRAPH_NODE_MODELS[kind].look.layersIcon, label: GRAPH_NODE_MODELS[kind].look.layersLabel },
    ]),
  ) as Record<GraphNodeKind, { icon: string; label: string }>),
  export: { icon: '↗', label: 'output' },
};

function getAreaGraphHelpers(graph: CanvasGraph | undefined, area: GraphArea): GraphHelperRowData[] {
  if (!graph) return [];

  const areaNodeIds = new Set(area.nodeIds);
  const helpersById = new Map<string, GraphHelperRowData>();

  for (const node of Object.values(graph.nodes)) {
    if (!areaNodeIds.has(node.id) || GRAPH_NODE_MODELS[node.kind].look.inLayerAreas === false) continue;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: node.kind, ...GRAPH_HELPER_META[node.kind] });
  }
  if (areaNodeIds.has(EXPORT_NODE_ID)) {
    helpersById.set(EXPORT_NODE_ID, {
      id: EXPORT_NODE_ID,
      name: 'Export',
      kind: 'export',
      ...GRAPH_HELPER_META.export,
    });
  }

  return area.nodeIds.flatMap((nodeId) => {
    const helper = helpersById.get(nodeId);
    return helper ? [helper] : [];
  });
}

/** Shared by every top-level row, so a memoized row does not re-render for a new empty array. */
const NO_AREAS: GraphArea[] = [];

export function buildLayerDisplayItems(
  displayLayers: Layer[],
  areasByLayerId: Map<string, GraphArea[]>,
  graph: CanvasGraph | undefined,
): LayerDisplayItem[] {
  const items: LayerDisplayItem[] = [];
  const renderedAreaIds = new Set<string>();
  const renderedLayerIds = new Set<string>();

  for (const layer of displayLayers) {
    if (renderedLayerIds.has(layer.id)) continue;
    const area = areasByLayerId.get(layer.id)?.[0];
    if (!area) {
      items.push({ type: 'layer', layer, areas: NO_AREAS });
      renderedLayerIds.add(layer.id);
      continue;
    }

    if (renderedAreaIds.has(area.id)) continue;
    const areaLayerIds = new Set(area.nodeIds);
    const areaLayers = displayLayers.filter((item) => areaLayerIds.has(item.id));
    for (const item of areaLayers) renderedLayerIds.add(item.id);
    renderedAreaIds.add(area.id);
    items.push({
      type: 'area',
      area,
      layers: areaLayers,
      graphHelpers: getAreaGraphHelpers(graph, area),
    });
  }

  return items;
}
