import type { Object3DLayer } from '../../types/config';
import type { Scene3DSettings } from '../../types/scene3d';
import { findGraphNodeOfKind } from '../nodeGraph';
import { findIncomingSource } from './graphInputs';
import {
  type GraphNodeRenderContext,
  resolveMaterialTextureCanvases,
  shaderMaterialConfig,
  throwIfRenderAborted,
} from './nodeKinds';

export const ENVIRONMENT_RENDER_MAX = 1024;

/** The 2:1 size a branch on an `env` port renders at, up to `ENVIRONMENT_RENDER_MAX` wide. */
export function environmentRenderSize(width: number, height: number) {
  const requestedWidth = Math.max(2, width);
  const widthFromHeight = Math.max(2, height * 2);
  const envWidth = Math.min(ENVIRONMENT_RENDER_MAX, Math.max(requestedWidth, widthFromHeight));
  const evenWidth = Math.max(2, Math.round(envWidth / 2) * 2);
  return { width: evenWidth, height: Math.max(1, Math.round(evenWidth / 2)) };
}

/**
 * A 3D Object layer with scene lighting: rendered full-frame by the scene renderer over the layer's input, with the
 * material on its `material` port and the environment from its settings or the branch on its `env` port.
 */
export async function renderScene3DLayer(
  layer: Object3DLayer & { scene: Scene3DSettings },
  context: GraphNodeRenderContext,
) {
  const { graph, W, H, options, renderDependency } = context;
  const inputId = findIncomingSource(graph, layer.id, 'bg');
  const materialId = findIncomingSource(graph, layer.id, 'material');
  const environmentId = findIncomingSource(graph, layer.id, 'env');
  const materialNode = materialId ? findGraphNodeOfKind(graph, 'material', materialId) : undefined;
  const materialShaderNode = materialId ? findGraphNodeOfKind(graph, 'shader', materialId) : undefined;
  const materialConfig = materialNode ?? (materialShaderNode ? shaderMaterialConfig(materialShaderNode.id) : undefined);
  const materialTextures = materialId ? await resolveMaterialTextureCanvases(materialId, context) : null;
  const environmentCanvas = environmentId ? await renderDependency(environmentId, environmentRenderSize(W, H)) : null;
  const backdropCanvas = inputId ? await renderDependency(inputId) : null;
  throwIfRenderAborted(options);
  const { renderModelSceneToCanvas } = await import('../modelRenderer');
  return renderModelSceneToCanvas(
    layer,
    layer.scene,
    { width: W, height: H },
    options.primitiveViewStates?.[layer.id],
    {
      forceFallback: options.draft,
      materialConfig,
      materialTextures,
      environmentCanvas,
      environmentSource: layer.scene.environmentSrc || null,
      backdropCanvas,
    },
  );
}
