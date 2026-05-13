import type { GraphArea, Layer } from '../types/config';

export function getLayerAreaMap(layers: Layer[], areas: GraphArea[] | undefined): Map<string, GraphArea[]> {
  const layerIds = new Set(layers.map((layer) => layer.id));
  const map = new Map<string, GraphArea[]>();

  for (const area of areas ?? []) {
    for (const nodeId of area.nodeIds) {
      if (!layerIds.has(nodeId)) continue;
      if (map.has(nodeId)) continue;
      const existing = map.get(nodeId) ?? [];
      existing.push(area);
      map.set(nodeId, existing);
    }
  }

  return map;
}
