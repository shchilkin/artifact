import type { CanvasDocument, ModelLayer, PrimitiveLayer } from '../../../types/config';
import { findGraphNodeOfKind } from '../../nodeGraph';
import type { GraphScene3DNode } from '../../nodeKinds';
import { cloneCanvas, createCanvas } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import {
  findLayer,
  type GraphNodeRenderContext,
  resolveMaterialTextureCanvases,
  shaderMaterialConfig,
  throwIfRenderAborted,
} from './context';

type Scene3DSourceLayer = ModelLayer | PrimitiveLayer;

function findScene3DSourceLayer(doc: CanvasDocument, nodeId: string | null): Scene3DSourceLayer | null {
  if (!nodeId) return null;
  const layer = findLayer(doc, nodeId);
  return layer?.kind === 'model' || layer?.kind === 'primitive' ? layer : null;
}

export async function renderScene3DGraphNode(node: GraphScene3DNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const sceneNode = node;
  const { doc, graph, W, H, options, renderDependency } = context;
  const modelLayer = findScene3DSourceLayer(doc, findIncomingSource(graph, nodeId, 'model'));
  const materialId = findIncomingSource(graph, nodeId, 'material');
  const environmentId = findIncomingSource(graph, nodeId, 'env');
  const backdropId = findIncomingSource(graph, nodeId, 'bg');
  const materialNode = materialId ? findGraphNodeOfKind(graph, 'material', materialId) : undefined;
  const materialShaderNode = materialId ? findGraphNodeOfKind(graph, 'shader', materialId) : undefined;
  const materialConfig = materialNode ?? (materialShaderNode ? shaderMaterialConfig(materialShaderNode.id) : undefined);
  const materialTextures = materialId ? await resolveMaterialTextureCanvases(materialId, context) : null;
  const environmentNode = environmentId ? findGraphNodeOfKind(graph, 'environment', environmentId) : undefined;
  const environmentNodeSourceId = environmentId ? findIncomingSource(graph, environmentId, 'in') : null;
  const environmentCanvas =
    environmentId && (!environmentNode || environmentNodeSourceId) ? await renderDependency(environmentId) : null;
  const backdropCanvas = backdropId ? await renderDependency(backdropId) : null;
  throwIfRenderAborted(options);
  if (!modelLayer) {
    const fallback = backdropCanvas ? cloneCanvas(backdropCanvas, W, H) : createCanvas(W, H);
    return fallback;
  }
  const { renderModelSceneToCanvas } = await import('../../modelRenderer');
  return renderModelSceneToCanvas(
    modelLayer,
    sceneNode,
    { width: W, height: H },
    options.primitiveViewStates?.[sceneNode.id],
    {
      forceFallback: options.draft,
      materialConfig,
      materialTextures,
      environmentCanvas,
      environmentSource: environmentNode?.environmentSrc ?? null,
      backdropCanvas,
    },
  );
}
