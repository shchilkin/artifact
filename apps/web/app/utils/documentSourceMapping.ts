import {
  type CanvasDocument,
  type GraphEnvironmentNode,
  type GraphMaterialNode,
  type GraphScene3DNode,
  type ImageLayer,
  MATERIAL_TEXTURE_SOURCE_FIELDS,
  type ModelLayer,
} from '../types/config';
import { mapGraphNodesAsync } from './nodeGraph';

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
  const graph = await mapGraphNodesAsync(doc.graph, async (node) =>
    node.kind === 'material' ? mapMaterialNode(node, mapSource) : node,
  );
  const layersChanged = layers.some((layer, index) => layer !== doc.layers[index]);
  if (!layersChanged && graph === doc.graph) return doc;
  return { ...doc, layers, graph };
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
  const graph = await mapGraphNodesAsync(doc.graph, async (node) =>
    node.kind === 'environment' || node.kind === 'scene3d' ? mapEnvironmentNode(node, mapSource) : node,
  );
  return graph === doc.graph ? doc : { ...doc, graph };
}
