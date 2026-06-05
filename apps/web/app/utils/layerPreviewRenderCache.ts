import type { CanvasDocument, ImageLayer, Layer } from '../types/config';
import { hashString } from './hashString';
import { EXPORT_NODE_ID } from './nodeGraph';
import type { RenderOptions } from './render/layers';
import type { GraphRenderCache } from './renderer';
import { layerRenderSig } from './renderSignature';

const LAYER_PREVIEW_GRAPH_CACHE_LIMIT = 128;

interface LayerPreviewRenderCacheConfig {
  width: number;
  height: number;
  renderOptions: Pick<RenderOptions, 'draft' | 'skipEffects' | 'effectResolution' | 'primitiveViewStates'>;
  limit?: number;
}

function imageLayerSignature(layer: ImageLayer, imageCache: Map<string, HTMLImageElement>): string {
  const image = imageCache.get(layer.src);
  return `${hashString(layer.src)}:${image ? `${image.naturalWidth}x${image.naturalHeight}` : 'missing'}`;
}

function primitiveViewSignature(layer: Layer, renderOptions: LayerPreviewRenderCacheConfig['renderOptions']): string {
  if (layer.kind !== 'primitive') return '';
  const view = renderOptions.primitiveViewStates?.[layer.id];
  return view ? `${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}` : 'default';
}

export function createLayerPreviewRenderCache(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  entries: Map<string, Promise<HTMLCanvasElement>>,
  config: LayerPreviewRenderCacheConfig,
): GraphRenderCache {
  const entryKeys = new Map<string, string>();
  const renderModeSig = [
    `${config.width}x${config.height}`,
    `draft:${config.renderOptions.draft ? 1 : 0}`,
    `skip:${config.renderOptions.skipEffects ? 1 : 0}`,
    config.renderOptions.effectResolution
      ? `effect:${config.renderOptions.effectResolution.width}x${config.renderOptions.effectResolution.height}`
      : 'effect:auto',
  ].join('|');
  let prefixSig = hashString(`seed:${doc.global.seed}|mode:${renderModeSig}`);

  for (const layer of doc.layers) {
    const imageSig = layer.kind === 'image' ? imageLayerSignature(layer, imageCache) : '';
    const viewSig = primitiveViewSignature(layer, config.renderOptions);
    prefixSig = hashString(`${prefixSig}|${layerRenderSig(layer)}|image:${imageSig}|view:${viewSig}`);
    entryKeys.set(layer.id, `layer:${prefixSig}`);
  }

  entryKeys.set(EXPORT_NODE_ID, `export:${hashString(`${prefixSig}|bg:${doc.global.bg}`)}`);

  return {
    namespace: `layer-preview:${renderModeSig}`,
    entries,
    entryKey: (nodeId) => entryKeys.get(nodeId) ?? null,
    limit: config.limit ?? LAYER_PREVIEW_GRAPH_CACHE_LIMIT,
  };
}
