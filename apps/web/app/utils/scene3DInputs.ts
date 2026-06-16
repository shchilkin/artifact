import type {
  CanvasDocument,
  CanvasGraph,
  GraphEnvironmentNode,
  GraphScene3DNode,
  Layer,
  ModelLayer,
} from '../types/config';

export function getSceneModelInputLayerIds(graph: CanvasGraph | undefined): Set<string> {
  const ids = new Set<string>();
  if (!graph) return ids;
  const sceneNodeIds = new Set((graph.scene3dNodes ?? []).map((node) => node.id));
  if (sceneNodeIds.size === 0) return ids;
  for (const edge of graph.edges) {
    if (edge.toPort === 'model' && sceneNodeIds.has(edge.toId)) ids.add(edge.fromId);
  }
  return ids;
}

export function isSceneModelInputLayer(layer: Layer, graph: CanvasGraph | undefined): boolean {
  return layer.kind === 'model' && getSceneModelInputLayerIds(graph).has(layer.id);
}

export function getSceneModelLayer(
  graph: CanvasGraph | undefined,
  layers: Layer[],
  sceneId: string,
): ModelLayer | null {
  const modelId = graph?.edges.find((edge) => edge.toId === sceneId && edge.toPort === 'model')?.fromId;
  const layer = modelId ? layers.find((item) => item.id === modelId) : null;
  return layer?.kind === 'model' ? layer : null;
}

export function getSceneEnvironmentNode(graph: CanvasGraph | undefined, sceneId: string): GraphEnvironmentNode | null {
  const environmentId = graph?.edges.find((edge) => edge.toId === sceneId && edge.toPort === 'env')?.fromId;
  return environmentId ? ((graph?.environmentNodes ?? []).find((node) => node.id === environmentId) ?? null) : null;
}

export function getScene3DTarget(doc: CanvasDocument, id: string | null): GraphScene3DNode | null {
  if (!id) return null;
  return (doc.graph?.scene3dNodes ?? []).find((node) => node.id === id) ?? null;
}

export function isSelectableScene3DTarget(doc: CanvasDocument, id: string | null): boolean {
  return Boolean(getScene3DTarget(doc, id));
}
