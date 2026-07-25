import {
  type CanvasDocument,
  type GraphEnvironmentNode,
  type GraphMaterialNode,
  type GraphScene3DNode,
  type ImageLayer,
  MATERIAL_TEXTURE_SOURCE_FIELDS,
  type ModelLayer,
} from '../types/config';

type SourceMapper = (source: string) => Promise<string>;

async function mapImageLayer(layer: ImageLayer, mapSource: SourceMapper): Promise<ImageLayer> {
  const src = await mapSource(layer.src);
  const aiGenerationHistory = layer.aiGenerationHistory?.length
    ? await Promise.all(
        layer.aiGenerationHistory.map(async (variant) => {
          const variantSrc = await mapSource(variant.src);
          return variantSrc === variant.src ? variant : { ...variant, src: variantSrc };
        }),
      )
    : layer.aiGenerationHistory;
  const historyChanged = aiGenerationHistory?.some(
    (variant, index) => variant.src !== layer.aiGenerationHistory?.[index]?.src,
  );
  return src === layer.src && !historyChanged ? layer : { ...layer, src, aiGenerationHistory };
}

async function mapMaterialNode(node: GraphMaterialNode, mapSource: SourceMapper): Promise<GraphMaterialNode> {
  const mappedEntries = await Promise.all(
    MATERIAL_TEXTURE_SOURCE_FIELDS.map(async (field) => {
      const source = node[field];
      return [field, source ? await mapSource(source) : source] as const;
    }),
  );
  const changed = mappedEntries.some(([field, source]) => source !== node[field]);
  return changed ? Object.assign({ ...node }, Object.fromEntries(mappedEntries)) : node;
}

export async function mapDocumentImageSources(doc: CanvasDocument, mapSource: SourceMapper): Promise<CanvasDocument> {
  const layers = await Promise.all(
    doc.layers.map((layer) => (layer.kind === 'image' ? mapImageLayer(layer, mapSource) : layer)),
  );
  const materialNodes = await Promise.all(
    (doc.graph?.materialNodes ?? []).map((node) => mapMaterialNode(node, mapSource)),
  );
  const layersChanged = layers.some((layer, index) => layer !== doc.layers[index]);
  const materialNodesChanged = materialNodes.some((node, index) => node !== doc.graph?.materialNodes?.[index]);
  if (!layersChanged && !materialNodesChanged) return doc;
  return {
    ...doc,
    layers,
    ...(materialNodesChanged && doc.graph ? { graph: { ...doc.graph, materialNodes } } : {}),
  };
}

export async function mapDocumentModelSources(
  doc: CanvasDocument,
  mapSource: (source: string, layer: ModelLayer) => Promise<string>,
): Promise<CanvasDocument> {
  const layers = await Promise.all(
    doc.layers.map(async (layer) => {
      if (layer.kind !== 'model') return layer;
      const modelSrc = await mapSource(layer.modelSrc, layer);
      return modelSrc === layer.modelSrc ? layer : ({ ...layer, modelSrc } satisfies ModelLayer);
    }),
  );
  return layers.some((layer, index) => layer !== doc.layers[index]) ? { ...doc, layers } : doc;
}

async function mapEnvironmentNode<T extends GraphEnvironmentNode | GraphScene3DNode>(
  node: T,
  mapSource: (source: string, node: T) => Promise<string>,
): Promise<T> {
  if (!node.environmentSrc) return node;
  const environmentSrc = await mapSource(node.environmentSrc, node);
  return environmentSrc === node.environmentSrc ? node : ({ ...node, environmentSrc } satisfies T);
}

export async function mapDocumentEnvironmentSources(
  doc: CanvasDocument,
  mapSource: (source: string, node: GraphEnvironmentNode | GraphScene3DNode) => Promise<string>,
): Promise<CanvasDocument> {
  const graph = doc.graph;
  if (!graph?.environmentNodes?.length && !graph?.scene3dNodes?.length) return doc;
  const environmentNodes = await Promise.all(
    (graph.environmentNodes ?? []).map((node) => mapEnvironmentNode(node, mapSource)),
  );
  const scene3dNodes = await Promise.all((graph.scene3dNodes ?? []).map((node) => mapEnvironmentNode(node, mapSource)));
  const changed =
    environmentNodes.some((node, index) => node !== graph.environmentNodes?.[index]) ||
    scene3dNodes.some((node, index) => node !== graph.scene3dNodes?.[index]);
  return changed ? { ...doc, graph: { ...graph, environmentNodes, scene3dNodes } } : doc;
}
