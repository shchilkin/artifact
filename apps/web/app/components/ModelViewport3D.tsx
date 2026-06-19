import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type { GraphScene3DNode, MaterialConfig, ModelLayer, PrimitiveLayer } from '../types/config';
import {
  addModelSceneLights,
  applyModelTransform,
  applySceneEnvironmentIntensity,
  applySceneEnvironmentRotation,
  disposeObject3D,
  loadScene3DSourceObject,
  loadSceneEnvironmentCanvas,
  loadSceneEnvironmentMap,
  normalizeModelRoot,
  type SceneEnvironmentMap,
  type SceneMaterialTextureCanvases,
} from '../utils/modelRenderer';
import {
  applyViewStateToCamera,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  clamp,
  createPrimitiveCamera,
} from '../utils/primitiveScene';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from './PrimitiveViewportState';
import {
  createTransparentWebglRenderer,
  createViewportDragState,
  eventFromViewportControl,
  eventInsideViewport,
  findReactFlowPane,
  flushViewStateCommit,
  getWebglContext,
  nextViewportKeyboardState,
  resizeViewportRenderer,
  scheduleViewStateCommit,
  shouldStopViewportEvent,
  stopViewportEvent,
  type ViewportDragState,
  viewportDragViewState,
  wheelZoomViewState,
} from './viewport3DControls';

export interface ModelViewport3DProps {
  layer: ModelLayer | PrimitiveLayer;
  sceneNode?: GraphScene3DNode;
  viewState: PrimitiveViewportState;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
  onViewStateDraft?: (viewState: PrimitiveViewportState) => void;
  className?: string;
  interactive?: boolean;
  materialConfig?: MaterialConfig;
  materialTextures?: SceneMaterialTextureCanvases | null;
  environmentCanvas?: HTMLCanvasElement | null;
  environmentSource?: string | null;
  autoRotatePreview?: boolean;
}

const AUTO_ROTATE_DEGREES_PER_MS = 0.018;
let nextEnvironmentCanvasId = 1;
const environmentCanvasIds = new WeakMap<HTMLCanvasElement, number>();

function modelViewportClassName(className: string | undefined, locked: boolean) {
  return ['node-interactive-viewport', className, locked ? 'node-interactive-viewport-locked' : 'nodrag nopan nowheel']
    .filter(Boolean)
    .join(' ');
}

function modelViewportAriaLabel(interactive: boolean, layerName: string) {
  return interactive
    ? `${layerName} 3D model preview. Drag rotates, right drag pans, wheel zooms, arrow keys rotate, plus or minus zoom, Home resets.`
    : undefined;
}

function materialSignature(
  sceneNode: GraphScene3DNode | undefined,
  materialConfig: MaterialConfig | undefined,
  materialTextures: SceneMaterialTextureCanvases | null | undefined,
) {
  return [
    materialConfig ? 'pbr' : (sceneNode?.materialMode ?? 'original'),
    materialConfig?.materialPreset ?? '',
    materialConfig?.materialBaseColor ?? '',
    materialConfig?.materialAccentColor ?? '',
    materialConfig?.materialMetalness ?? '',
    materialConfig?.materialRoughness ?? '',
    materialConfig?.materialClearcoat ?? '',
    materialConfig?.materialRelief ?? '',
    materialConfig?.materialGrain ?? '',
    materialConfig?.materialAnisotropy ?? '',
    materialConfig?.materialAlbedoSrc ?? '',
    materialConfig?.materialRoughnessSrc ?? '',
    materialConfig?.materialMetalnessSrc ?? '',
    materialConfig?.materialNormalSrc ?? '',
    materialConfig?.materialAlphaSrc ?? '',
    materialCanvasSignature(materialTextures?.albedo),
    materialCanvasSignature(materialTextures?.roughness),
    materialCanvasSignature(materialTextures?.metalness),
    materialCanvasSignature(materialTextures?.normal),
    materialCanvasSignature(materialTextures?.alpha),
  ].join(':');
}

function materialCanvasSignature(canvas: HTMLCanvasElement | null | undefined) {
  return canvas ? environmentCanvasSignature(canvas) : '';
}

function sourceLayerSignature(layer: ModelLayer | PrimitiveLayer) {
  if (layer.kind === 'model') return ['model', layer.modelSrc, layer.color, layer.accentColor].join(':');
  return [
    'primitive',
    layer.primitiveShape,
    layer.primitiveDepth,
    layer.primitiveShading,
    layer.color,
    layer.accentColor,
    layer.materialPreset,
    layer.materialBaseColor,
    layer.materialAccentColor,
    layer.materialMetalness,
    layer.materialRoughness,
    layer.materialClearcoat,
    layer.materialRelief,
    layer.materialGrain,
    layer.materialAnisotropy,
  ].join(':');
}

function environmentSignature(
  sceneNode: GraphScene3DNode | undefined,
  environmentSource: string | null | undefined,
  environmentCanvas: HTMLCanvasElement | null | undefined,
) {
  if (environmentSource) return environmentSource;
  if (sceneNode?.environmentSrc) return sceneNode.environmentSrc;
  if (environmentCanvas) return environmentCanvasSignature(environmentCanvas);
  return '';
}

function environmentCanvasSignature(environmentCanvas: HTMLCanvasElement) {
  let id = environmentCanvasIds.get(environmentCanvas);
  if (!id) {
    id = nextEnvironmentCanvasId;
    nextEnvironmentCanvasId += 1;
    environmentCanvasIds.set(environmentCanvas, id);
  }
  return `canvas:${id}:${environmentCanvas.width}x${environmentCanvas.height}`;
}

function replaceSceneLights(
  scene: THREE.Scene,
  previousLights: THREE.Group | null,
  layer: ModelLayer | PrimitiveLayer,
  sceneNode?: GraphScene3DNode,
  environmentMap?: SceneEnvironmentMap | null,
) {
  if (previousLights) scene.remove(previousLights);
  const lights = new THREE.Group();
  addModelSceneLights(lights, layer, sceneNode, environmentMap?.background ?? null);
  scene.add(lights);
  return lights;
}

function sourceLoadStatus(layer: ModelLayer | PrimitiveLayer) {
  if (layer.kind === 'primitive') return 'Primitive load failed';
  return layer.modelSrc ? 'Model load failed' : 'Missing model';
}

function disposeSceneEnvironment(environmentMap: SceneEnvironmentMap | null) {
  environmentMap?.dispose();
}

function applyLiveSceneSettings(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  modelRoot: THREE.Object3D | null,
  sceneNode: GraphScene3DNode | undefined,
  environmentMap: SceneEnvironmentMap | null,
) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Math.max(0, (sceneNode?.exposure ?? 100) / 100);
  scene.environment = environmentMap?.environment ?? null;
  scene.background = environmentMap && sceneNode && !sceneNode.transparent ? environmentMap.background : null;
  applySceneEnvironmentRotation(scene, sceneNode);
  if (modelRoot) applySceneEnvironmentIntensity(modelRoot, sceneNode, Boolean(environmentMap));
}

export function ModelViewport3D({
  layer,
  sceneNode,
  viewState,
  onViewStateChange,
  onViewStateDraft,
  className,
  interactive = true,
  materialConfig,
  materialTextures = null,
  environmentCanvas = null,
  environmentSource = null,
  autoRotatePreview = false,
}: ModelViewport3DProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelRootRef = useRef<THREE.Object3D | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const sceneLightsRef = useRef<THREE.Group | null>(null);
  const environmentMapRef = useRef<SceneEnvironmentMap | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const dragStateRef = useRef<ViewportDragState | null>(null);
  const viewStateRef = useRef(viewState);
  const autoRotateOffsetRef = useRef(0);
  const layerRef = useRef(layer);
  const sceneNodeRef = useRef(sceneNode);
  const materialConfigRef = useRef(materialConfig);
  const materialTexturesRef = useRef(materialTextures);
  const environmentCanvasRef = useRef(environmentCanvas);
  const environmentSourceRef = useRef(environmentSource);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const onViewStateDraftRef = useRef(onViewStateDraft);
  const interactiveRef = useRef(interactive);
  const autoRotatePreviewRef = useRef(autoRotatePreview);
  const sceneRevisionRef = useRef(0);
  const lockedRef = useRef(!!viewState.locked);
  const rfPaneRef = useRef<HTMLElement | null>(null);
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRenderedFrameRef = useRef(false);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [environmentFailed, setEnvironmentFailed] = useState(false);
  const [autoRotateVisible, setAutoRotateVisible] = useState(false);
  const modelSignature = sourceLayerSignature(layer);
  const sceneMaterialSignature = materialSignature(sceneNode, materialConfig, materialTextures);
  const sceneEnvironmentSignature = environmentSignature(sceneNode, environmentSource, environmentCanvas);
  const autoRotateShouldRun =
    autoRotatePreview && (autoRotateVisible || (typeof window !== 'undefined' && !('IntersectionObserver' in window)));

  const renderScene = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    if (!hasRenderedFrameRef.current) {
      hasRenderedFrameRef.current = true;
      setHasRenderedFrame(true);
    }
  }, []);

  const renderViewState = useCallback(
    (next: PrimitiveViewportState, updateRef = true) => {
      if (updateRef) viewStateRef.current = next;
      const camera = cameraRef.current;
      if (camera) applyViewStateToCamera(camera, { ...next, zoom: clamp(next.zoom, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX) });
      const group = modelGroupRef.current;
      if (group) applyModelTransform(group, next, layerRef.current.tiltZ);
      renderScene();
    },
    [renderScene],
  );

  const applyViewState = useCallback(
    (next: PrimitiveViewportState) => {
      renderViewState(next, true);
    },
    [renderViewState],
  );

  const lockRFPane = useCallback(() => {
    if (lockedRef.current) return;
    if (!rfPaneRef.current) rfPaneRef.current = findReactFlowPane(rootRef.current);
    if (rfPaneRef.current) rfPaneRef.current.style.pointerEvents = 'none';
  }, []);

  const unlockRFPane = useCallback(() => {
    if (rfPaneRef.current && !dragStateRef.current) rfPaneRef.current.style.pointerEvents = '';
  }, []);

  const commit = useCallback(() => {
    const next = { ...viewStateRef.current };
    onViewStateDraftRef.current?.(next);
    onViewStateChangeRef.current(next);
  }, []);

  const scheduleWheelCommit = useCallback(() => {
    scheduleViewStateCommit(wheelCommitTimerRef, viewStateRef, onViewStateChangeRef);
  }, []);

  const flushPendingWheelCommit = useCallback(() => {
    flushViewStateCommit(wheelCommitTimerRef, viewStateRef, onViewStateChangeRef);
  }, []);

  useLayoutEffect(() => {
    layerRef.current = layer;
    sceneNodeRef.current = sceneNode;
    materialConfigRef.current = materialConfig;
    materialTexturesRef.current = materialTextures;
    environmentCanvasRef.current = environmentCanvas;
    environmentSourceRef.current = environmentSource;
    viewStateRef.current = viewState;
    onViewStateChangeRef.current = onViewStateChange;
    onViewStateDraftRef.current = onViewStateDraft;
    interactiveRef.current = interactive;
    autoRotatePreviewRef.current = autoRotatePreview;
    lockedRef.current = !!viewState.locked;
    if (viewState.locked) unlockRFPane();
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (renderer && scene) {
      sceneLightsRef.current = replaceSceneLights(
        scene,
        sceneLightsRef.current,
        layer,
        sceneNode,
        environmentMapRef.current,
      );
      applyLiveSceneSettings(renderer, scene, modelRootRef.current, sceneNode, environmentMapRef.current);
    }
    applyViewState(viewState);
  }, [
    applyViewState,
    autoRotatePreview,
    environmentCanvas,
    environmentSource,
    interactive,
    layer,
    materialConfig,
    materialTextures,
    onViewStateChange,
    onViewStateDraft,
    sceneNode,
    unlockRFPane,
    viewState,
  ]);

  useEffect(() => {
    if (!autoRotatePreview) return;
    const root = rootRef.current;
    if (!root) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setAutoRotateVisible(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.01 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [autoRotatePreview]);

  useEffect(() => {
    if (!autoRotateShouldRun) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let frameId = 0;
    let previousFrameTime = performance.now();
    const renderAutoRotateFrame = (time: number) => {
      const delta = Math.min(48, Math.max(0, time - previousFrameTime));
      previousFrameTime = time;
      if (
        autoRotatePreviewRef.current &&
        !document.hidden &&
        !dragStateRef.current &&
        rendererRef.current &&
        sceneRef.current &&
        cameraRef.current &&
        modelGroupRef.current
      ) {
        autoRotateOffsetRef.current = (autoRotateOffsetRef.current + delta * AUTO_ROTATE_DEGREES_PER_MS) % 360;
        renderViewState(
          {
            ...viewStateRef.current,
            rotationY: viewStateRef.current.rotationY + autoRotateOffsetRef.current,
          },
          false,
        );
      }
      frameId = window.requestAnimationFrame(renderAutoRotateFrame);
    };
    frameId = window.requestAnimationFrame(renderAutoRotateFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [autoRotateShouldRun, renderViewState]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const context = getWebglContext(canvas);
    if (!context) {
      setWebglUnavailable(true);
      return;
    }

    const renderer = createTransparentWebglRenderer(canvas, context);
    rendererRef.current = renderer;

    const currentLayer = layerRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    cameraRef.current = createPrimitiveCamera();
    sceneLightsRef.current = replaceSceneLights(scene, null, currentLayer, sceneNodeRef.current, null);
    applyLiveSceneSettings(renderer, scene, null, sceneNodeRef.current, null);
    sceneRevisionRef.current += 1;
    setSceneRevision(sceneRevisionRef.current);
    const resize = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      resizeViewportRenderer(root, rendererRef.current, cameraRef.current);
      applyViewState(viewStateRef.current);
    };
    resize();
    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(root);

    let cancelled = false;
    setWebglUnavailable(false);
    setLoadFailed(false);
    setEnvironmentFailed(false);
    hasRenderedFrameRef.current = false;
    setHasRenderedFrame(false);
    loadScene3DSourceObject(currentLayer, sceneNodeRef.current, materialConfigRef.current, materialTexturesRef.current)
      .then((rootObject) => {
        if (cancelled) {
          disposeObject3D(rootObject);
          return;
        }
        applySceneEnvironmentIntensity(rootObject, sceneNodeRef.current, Boolean(environmentMapRef.current));
        const group = normalizeModelRoot(rootObject);
        if (!group) throw new Error('Model has no renderable bounds');
        modelRootRef.current = rootObject;
        modelGroupRef.current = group;
        scene.add(group);
        applyLiveSceneSettings(renderer, scene, rootObject, sceneNodeRef.current, environmentMapRef.current);
        applyViewState(viewStateRef.current);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      flushPendingWheelCommit();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      dragStateRef.current = null;
      unlockRFPane();
      if (modelRootRef.current) disposeObject3D(modelRootRef.current);
      disposeSceneEnvironment(environmentMapRef.current);
      modelRootRef.current = null;
      modelGroupRef.current = null;
      sceneLightsRef.current = null;
      environmentMapRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [applyViewState, flushPendingWheelCommit, modelSignature, sceneMaterialSignature, unlockRFPane, renderScene]);

  useEffect(() => {
    if (sceneRevision === 0) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    let cancelled = false;
    const nextEnvironmentSource = environmentSourceRef.current ?? sceneNodeRef.current?.environmentSrc;
    const nextEnvironmentCanvas = environmentCanvasRef.current;
    setEnvironmentFailed(false);
    (nextEnvironmentSource
      ? loadSceneEnvironmentMap(renderer, nextEnvironmentSource)
      : Promise.resolve(loadSceneEnvironmentCanvas(renderer, nextEnvironmentCanvas))
    )
      .then((environmentMap) => {
        if (cancelled) {
          disposeSceneEnvironment(environmentMap);
          return;
        }
        const previousEnvironmentMap = environmentMapRef.current;
        environmentMapRef.current = environmentMap;
        if (previousEnvironmentMap) disposeSceneEnvironment(previousEnvironmentMap);
        sceneLightsRef.current = replaceSceneLights(
          scene,
          sceneLightsRef.current,
          layerRef.current,
          sceneNodeRef.current,
          environmentMap,
        );
        applyLiveSceneSettings(renderer, scene, modelRootRef.current, sceneNodeRef.current, environmentMap);
        renderScene();
      })
      .catch(() => {
        if (!cancelled) {
          if (nextEnvironmentSource) setEnvironmentFailed(true);
          renderScene();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sceneEnvironmentSignature, sceneRevision, renderScene]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !interactive) return;

    const applyDraft = (next: PrimitiveViewportState) => {
      applyViewState(next);
      onViewStateDraftRef.current?.({ ...next });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!shouldStopViewportEvent(root, event, interactiveRef.current, lockedRef.current)) return;
      stopViewportEvent(event, true);
      dragStateRef.current = createViewportDragState(event, viewStateRef.current);
      root.setPointerCapture(event.pointerId);
      lockRFPane();
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      stopViewportEvent(event, true);
      applyDraft(viewportDragViewState(root, drag, event));
    };
    const onPointerUp = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      stopViewportEvent(event);
      dragStateRef.current = null;
      unlockRFPane();
      commit();
    };
    const onWheel = (event: WheelEvent) => {
      if (!shouldStopViewportEvent(root, event, interactiveRef.current, lockedRef.current)) return;
      stopViewportEvent(event, true);
      applyDraft(wheelZoomViewState(viewStateRef.current, event.deltaY));
      scheduleWheelCommit();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!eventInsideViewport(root, event) || eventFromViewportControl(event)) return;
      stopViewportEvent(event, true);
    };

    const controller = new AbortController();
    const signal = controller.signal;
    const captureOptions: AddEventListenerOptions = { capture: true, signal };
    const wheelOptions: AddEventListenerOptions = { capture: true, passive: false, signal };
    document.addEventListener('pointerdown', onPointerDown, captureOptions);
    document.addEventListener('pointermove', onPointerMove, captureOptions);
    document.addEventListener('pointerup', onPointerUp, captureOptions);
    document.addEventListener('pointercancel', onPointerUp, captureOptions);
    document.addEventListener('contextmenu', onContextMenu, captureOptions);
    window.addEventListener('wheel', onWheel, wheelOptions);
    document.addEventListener('wheel', onWheel, wheelOptions);
    root.addEventListener('mouseenter', lockRFPane, { signal });
    root.addEventListener('mouseleave', unlockRFPane, { signal });
    return () => {
      controller.abort();
      flushPendingWheelCommit();
      dragStateRef.current = null;
      unlockRFPane();
    };
  }, [applyViewState, commit, flushPendingWheelCommit, interactive, lockRFPane, scheduleWheelCommit, unlockRFPane]);

  const locked = !!viewState.locked;
  const viewportStatus = webglUnavailable
    ? 'WebGL unavailable'
    : loadFailed
      ? sourceLoadStatus(layer)
      : !hasRenderedFrame
        ? 'Loading 3D model'
        : null;
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive || locked) return;
    const next = nextViewportKeyboardState(
      viewStateRef.current,
      event.key,
      event.shiftKey,
      defaultPrimitiveViewportState(layer),
    );
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    applyViewState(next);
    onViewStateChangeRef.current({ ...next });
  };

  return (
    <div
      ref={rootRef}
      className={modelViewportClassName(className, locked)}
      tabIndex={interactive ? 0 : -1}
      role={interactive ? 'group' : undefined}
      aria-hidden={interactive ? undefined : true}
      aria-roledescription={interactive ? 'interactive viewport' : undefined}
      aria-label={modelViewportAriaLabel(interactive, layer.name)}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        touchAction: locked || !interactive ? 'auto' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        className={locked || !interactive ? undefined : 'nodrag nopan nowheel'}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: hasRenderedFrame ? 1 : 0,
          transition: 'opacity 80ms ease-out',
        }}
      />
      {(viewportStatus || environmentFailed) && (
        <div className="model-viewport-status" aria-live="polite">
          {viewportStatus && <span className="model-viewport-status-badge">{viewportStatus}</span>}
          {environmentFailed && <span className="model-viewport-status-badge">Env map unavailable</span>}
        </div>
      )}
      {(webglUnavailable || loadFailed) && (
        <div className="node-primitive-webgl-fallback" aria-live="polite">
          {webglUnavailable ? '3D preview unavailable' : '3D source preview unavailable'}
        </div>
      )}
    </div>
  );
}
