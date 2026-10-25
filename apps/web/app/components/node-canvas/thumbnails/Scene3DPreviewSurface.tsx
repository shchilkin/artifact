import { useEffect, useMemo, useState } from 'react';
import {
  type CanvasGraph,
  DEFAULT_MATERIAL_CONFIG,
  type MaterialConfig,
  type Object3DLayer,
  type Scene3DSettings,
} from '../../../types/config';
import { findGraphNodeOfKind, graphNodesOfKind } from '../../../utils/nodeGraph';
import type { GraphMaterialNode } from '../../../utils/nodeKinds';
import { renderGraphTarget } from '../../../utils/renderer';
import { Viewport3DControlStrip } from '../../canvas-chrome/Viewport3DChrome';
import { LazyModelViewport3D } from '../../LazyViewport3D';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { useGeneratedMaterialTextureCanvases } from './materialTextureCanvases';
import { NodeThumbnail } from './NodeThumbnail';

interface Scene3DPreviewSurfaceProps {
  layer: Object3DLayer & { scene: Scene3DSettings };
  selected: boolean;
  previewTargetId: string;
  sceneViewState?: PrimitiveViewportState;
}

/**
 * The live preview of a 3D Object layer with scene lighting: its backdrop (or environment) under an orbitable 3D
 * viewport lit by the layer's scene settings, environment, and material inputs.
 */
export function Scene3DPreviewSurface({
  layer,
  selected,
  previewTargetId,
  sceneViewState,
}: Scene3DPreviewSurfaceProps) {
  if (!selected) return <NodeThumbnail previewTargetId={previewTargetId} />;
  return <SelectedScene3DPreviewSurface layer={layer} sceneViewState={sceneViewState} />;
}

function incomingId(graph: Pick<CanvasGraph, 'edges'>, toId: string, port: string): string | null {
  return graph.edges.find((edge) => edge.toId === toId && edge.toPort === port)?.fromId ?? null;
}

function SelectedScene3DPreviewSurface({
  layer,
  sceneViewState,
}: {
  layer: Object3DLayer & { scene: Scene3DSettings };
  sceneViewState?: PrimitiveViewportState;
}) {
  const { doc, graph, imageCache, primitiveViewStates } = useNodeCanvasPreview();
  const { updatePrimitiveView, setPrimitiveViewportActive } = useNodeCanvasActions();
  const scene = layer.scene;
  const backdropPreviewTargetId = incomingId(graph, layer.id, 'bg');
  const environmentPreviewTargetId = incomingId(graph, layer.id, 'env');
  const materialSourceId = incomingId(graph, layer.id, 'material');
  const materialNode = materialSourceId ? (findGraphNodeOfKind(graph, 'material', materialSourceId) ?? null) : null;
  const materialSource = useMemo(
    () => sceneMaterialSource(graph, layer.id, materialNode),
    [graph, materialNode, layer.id],
  );
  const generatedEnvironmentCanvas = useGeneratedEnvironmentCanvas({
    enabled: !scene.environmentSrc && Boolean(environmentPreviewTargetId),
    previewTargetId: environmentPreviewTargetId,
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  });
  const materialTextures = useGeneratedMaterialTextureCanvases({
    materialNode: materialSource.materialNode,
    directTextureSourceId: materialSource.shaderNode?.id ?? null,
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  });
  const [draftViewState, setDraftViewState] = useState<{ baseKey: string; value: PrimitiveViewportState } | null>(null);
  const committedViewState = useMemo(
    () => sceneViewState ?? defaultPrimitiveViewportState(layer),
    [layer, sceneViewState],
  );
  const committedViewStateKey = sceneViewStateKey(committedViewState);
  const effectiveViewState = activeSceneViewState(draftViewState, committedViewStateKey, committedViewState);
  const locked = !!effectiveViewState.locked;
  const underlayPreviewTargetId = backdropPreviewTargetId ?? environmentPreviewTargetId;

  useEffect(() => {
    return () => setPrimitiveViewportActive(layer.id, false);
  }, [layer.id, setPrimitiveViewportActive]);

  const setLocked = (nextLocked: boolean) => {
    const next = { ...effectiveViewState, locked: nextLocked };
    setDraftViewState(null);
    updatePrimitiveView(layer.id, next, 'snapshot');
    setPrimitiveViewportActive(layer.id, !nextLocked);
  };

  const resetCamera = () => {
    setDraftViewState(null);
    updatePrimitiveView(
      layer.id,
      {
        ...defaultPrimitiveViewportState(layer),
        locked,
      },
      'snapshot',
    );
  };

  return (
    <div
      className={scenePreviewSurfaceClassName(locked)}
      data-viewport-3d-workspace="scene"
      data-viewport-3d-workspace-state={locked ? 'locked' : 'active'}
      onMouseEnter={() => {
        if (!locked) setPrimitiveViewportActive(layer.id, true);
      }}
      onMouseLeave={() => setPrimitiveViewportActive(layer.id, false)}
    >
      <div
        className="node-primitive-live-frame artifact-viewport3d-frame"
        data-viewport-3d-frame="scene"
        data-viewport-3d-frame-state={locked ? 'locked' : 'active'}
      >
        {underlayPreviewTargetId ? (
          <NodeThumbnail previewTargetId={underlayPreviewTargetId} />
        ) : (
          <EmptyThumbnailFrame />
        )}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <LazyModelViewport3D
            layer={layer}
            sceneNode={scene}
            materialConfig={materialSource.config}
            materialTextures={materialTextures}
            environmentCanvas={generatedEnvironmentCanvas}
            environmentSource={scene.environmentSrc || null}
            viewState={effectiveViewState}
            onViewStateDraft={(next) => setDraftViewState({ baseKey: committedViewStateKey, value: next })}
            onViewStateChange={(next) => {
              setDraftViewState(null);
              updatePrimitiveView(layer.id, next, 'snapshot');
            }}
            className="node-primitive-preview node-primitive-preview-transparent"
          />
        </div>
      </div>
      <Viewport3DControlStrip
        scope="scene"
        locked={locked}
        zoom={effectiveViewState.zoom}
        onReset={resetCamera}
        onToggleLocked={setLocked}
      />
    </div>
  );
}

function sceneMaterialSource(
  graph: Pick<CanvasGraph, 'edges' | 'nodes'>,
  sceneId: string,
  materialNode: GraphMaterialNode | null,
) {
  const materialSourceId = graph.edges.find((edge) => edge.toId === sceneId && edge.toPort === 'material')?.fromId;
  const shaderNode = materialSourceId
    ? graphNodesOfKind(graph, 'shader').find((node) => node.id === materialSourceId)
    : undefined;
  return {
    materialNode,
    shaderNode: shaderNode ?? null,
    config: materialNode ?? (shaderNode ? shaderMaterialConfig(shaderNode.id) : undefined),
  };
}

function shaderMaterialConfig(shaderId: string): MaterialConfig {
  return {
    ...DEFAULT_MATERIAL_CONFIG,
    materialPreset: 'matte',
    materialBaseColor: '#ffffff',
    materialAccentColor: '#ffffff',
    materialRoughness: 0.32,
    materialGrain: 0,
    materialRelief: 0,
    materialAlbedoName: shaderId,
  };
}

function useGeneratedEnvironmentCanvas({
  enabled,
  previewTargetId,
  doc,
  graph,
  imageCache,
  primitiveViewStates,
}: {
  enabled: boolean;
  previewTargetId: string | null;
  doc: Parameters<typeof renderGraphTarget>[0];
  graph: Parameters<typeof renderGraphTarget>[1];
  imageCache: Map<string, HTMLImageElement>;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
}) {
  const renderKey = enabled && previewTargetId ? previewTargetId : null;
  const [renderedCanvas, setRenderedCanvas] = useState<{ key: string; canvas: HTMLCanvasElement | null } | null>(null);
  useEffect(() => {
    if (!renderKey) return;
    let cancelled = false;
    renderGraphTarget(doc, graph, renderKey, 512, 256, imageCache, {
      primitiveViewStates,
    })
      .then((nextCanvas) => {
        if (!cancelled) setRenderedCanvas({ key: renderKey, canvas: nextCanvas });
      })
      .catch(() => {
        if (!cancelled) setRenderedCanvas({ key: renderKey, canvas: null });
      });
    return () => {
      cancelled = true;
    };
  }, [doc, graph, imageCache, primitiveViewStates, renderKey]);
  return renderedCanvas?.key === renderKey ? renderedCanvas.canvas : null;
}

function activeSceneViewState(
  draft: { baseKey: string; value: PrimitiveViewportState } | null,
  committedKey: string,
  committed: PrimitiveViewportState,
) {
  if (!draft) return committed;
  return draft.baseKey === committedKey ? draft.value : committed;
}

function scenePreviewSurfaceClassName(locked: boolean) {
  return locked
    ? 'node-preview-surface primitive-preview-surface primitive-preview-surface-locked'
    : 'node-preview-surface primitive-preview-surface nodrag nopan nowheel';
}

function sceneViewStateKey(viewState: PrimitiveViewportState): string {
  return [
    viewState.rotationX,
    viewState.rotationY,
    viewState.zoom,
    viewState.panX,
    viewState.panY,
    viewState.locked ? 1 : 0,
  ].join(':');
}
