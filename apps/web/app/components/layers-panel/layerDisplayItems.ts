import type { CanvasGraph, EffectLayer, GraphArea, Layer, LayerKind } from '../../types/config';
import { EFFECT_PRESETS } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';

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

export type GraphHelperKind =
  | 'merge'
  | 'color'
  | 'repeat'
  | 'material'
  | 'mask'
  | 'transform'
  | 'grimeShadow'
  | 'environment'
  | 'export';

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

const GRAPH_HELPER_META: Record<GraphHelperKind, { icon: string; label: string }> = {
  merge: { icon: '◇', label: 'merge' },
  color: { icon: '◐', label: 'grade' },
  repeat: { icon: '▦', label: 'repeat' },
  material: { icon: '◒', label: 'material' },
  mask: { icon: '◒', label: 'mask' },
  transform: { icon: '↻', label: 'transform' },
  grimeShadow: { icon: '◖', label: 'shadow' },
  environment: { icon: '◇', label: 'env' },
  export: { icon: '↗', label: 'output' },
};

function getAreaGraphHelpers(graph: CanvasGraph | undefined, area: GraphArea): GraphHelperRowData[] {
  if (!graph) return [];

  const areaNodeIds = new Set(area.nodeIds);
  const helpersById = new Map<string, GraphHelperRowData>();

  graph.mergeNodes.forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'merge', ...GRAPH_HELPER_META.merge });
  });
  (graph.colorNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'color', ...GRAPH_HELPER_META.color });
  });
  (graph.repeatNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'repeat', ...GRAPH_HELPER_META.repeat });
  });
  (graph.materialNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'material', ...GRAPH_HELPER_META.material });
  });
  (graph.maskNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'mask', ...GRAPH_HELPER_META.mask });
  });
  (graph.transformNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'transform', ...GRAPH_HELPER_META.transform });
  });
  (graph.grimeShadowNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'grimeShadow', ...GRAPH_HELPER_META.grimeShadow });
  });
  (graph.environmentNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'environment', ...GRAPH_HELPER_META.environment });
  });
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
      items.push({ type: 'layer', layer, areas: [] });
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
