import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type { GraphScene3DNode, ModelLayer } from '../types/config';
import { resolveModelSource } from '../utils/modelAssetStore';
import {
  addModelSceneLights,
  applyModelFallbackMaterials,
  applyModelTransform,
  applySceneEnvironmentIntensity,
  applySceneMaterialMode,
  disposeObject3D,
  loadSceneEnvironmentMap,
  modelSourceToArrayBuffer,
  normalizeModelRoot,
  parseGltfScene,
  type SceneEnvironmentMap,
} from '../utils/modelRenderer';
import {
  applyViewStateToCamera,
  CAMERA_DISTANCE,
  CAMERA_FOV,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  clamp,
  createPrimitiveCamera,
} from '../utils/primitiveScene';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from './PrimitiveViewportState';

interface Props {
  layer: ModelLayer;
  sceneNode?: GraphScene3DNode;
  viewState: PrimitiveViewportState;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
  onViewStateDraft?: (viewState: PrimitiveViewportState) => void;
  className?: string;
  interactive?: boolean;
  environmentSource?: string | null;
}

type ModelDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startView: PrimitiveViewportState;
  mode: 'rotate' | 'pan';
};

const ROTATE_STEP = 8;
const PAN_STEP = 0.12;
const ZOOM_STEP = 0.14;

function stopViewportEvent(event: Event, preventDefault = false) {
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (preventDefault) event.preventDefault();
}

function eventFromCameraControl(event: Event) {
  return event.target instanceof Element && event.target.closest('[data-primitive-camera-control]') !== null;
}

function eventInside(root: HTMLElement, event: Event) {
  return root.contains(event.target as Node);
}

function modelGestureMode(event: PointerEvent): ModelDragState['mode'] {
  return event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'rotate';
}

function createModelDragState(event: PointerEvent, viewState: PrimitiveViewportState): ModelDragState {
  return {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startView: { ...viewState },
    mode: modelGestureMode(event),
  };
}

function getViewportPanDelta(
  root: HTMLElement,
  viewState: PrimitiveViewportState,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const rect = root.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const zoom = clamp(viewState.zoom, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  const cameraZ = CAMERA_DISTANCE / zoom;
  const visibleHeight = 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * cameraZ;
  const visibleWidth = visibleHeight * (width / height);
  return {
    x: (dx / width) * visibleWidth,
    y: (dy / height) * visibleHeight,
  };
}

function modelDragViewState(root: HTMLElement, drag: ModelDragState, event: PointerEvent) {
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (drag.mode === 'pan') {
    const panDelta = getViewportPanDelta(root, drag.startView, dx, dy);
    return {
      ...drag.startView,
      panX: drag.startView.panX - panDelta.x,
      panY: drag.startView.panY + panDelta.y,
    };
  }
  return {
    ...drag.startView,
    rotationX: clamp(drag.startView.rotationX + dy * 0.35, -85, 85),
    rotationY: drag.startView.rotationY + dx * 0.4,
  };
}

function findReactFlowPane(root: HTMLElement | null) {
  return (root?.closest('.react-flow')?.querySelector('.react-flow__pane') as HTMLElement) ?? null;
}

function modelViewportClassName(className: string | undefined, locked: boolean) {
  return ['node-interactive-viewport', className, locked ? 'node-interactive-viewport-locked' : 'nodrag nopan nowheel']
    .filter(Boolean)
    .join(' ');
}

function resizeRenderer(root: HTMLElement, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const rect = root.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function getWebglContext(canvas: HTMLCanvasElement) {
  try {
    return canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
}

function shouldStopViewportEvent(root: HTMLElement, event: Event, interactive: boolean, locked: boolean) {
  return interactive && eventInside(root, event) && !eventFromCameraControl(event) && !locked;
}

function nextKeyboardState(current: PrimitiveViewportState, key: string, shiftKey: boolean, layer: ModelLayer) {
  const next = { ...current };
  if (key === 'ArrowUp') {
    if (shiftKey) next.panY -= PAN_STEP;
    else next.rotationX = clamp(next.rotationX - ROTATE_STEP, -85, 85);
  } else if (key === 'ArrowDown') {
    if (shiftKey) next.panY += PAN_STEP;
    else next.rotationX = clamp(next.rotationX + ROTATE_STEP, -85, 85);
  } else if (key === 'ArrowLeft') {
    if (shiftKey) next.panX -= PAN_STEP;
    else next.rotationY -= ROTATE_STEP;
  } else if (key === 'ArrowRight') {
    if (shiftKey) next.panX += PAN_STEP;
    else next.rotationY += ROTATE_STEP;
  } else if (key === '+' || key === '=') {
    next.zoom = clamp(next.zoom + ZOOM_STEP, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  } else if (key === '-' || key === '_') {
    next.zoom = clamp(next.zoom - ZOOM_STEP, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  } else if (key === 'Home') {
    Object.assign(next, defaultPrimitiveViewportState(layer), { locked: next.locked });
  } else {
    return null;
  }
  return next;
}

function modelViewportAriaLabel(interactive: boolean, layerName: string) {
  return interactive
    ? `${layerName} 3D model preview. Drag rotates, right drag pans, wheel zooms, arrow keys rotate, plus or minus zoom, Home resets.`
    : undefined;
}

function materialSignature(sceneNode: GraphScene3DNode | undefined) {
  return sceneNode?.materialMode ?? 'original';
}

function environmentSignature(sceneNode: GraphScene3DNode | undefined, environmentSource: string | null | undefined) {
  return environmentSource ?? sceneNode?.environmentSrc ?? '';
}

function replaceSceneLights(
  scene: THREE.Scene,
  previousLights: THREE.Group | null,
  layer: ModelLayer,
  sceneNode?: GraphScene3DNode,
) {
  if (previousLights) scene.remove(previousLights);
  const lights = new THREE.Group();
  addModelSceneLights(lights, layer, sceneNode);
  scene.add(lights);
  return lights;
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
  if (modelRoot) applySceneEnvironmentIntensity(modelRoot, sceneNode);
}

export function ModelViewport3D({
  layer,
  sceneNode,
  viewState,
  onViewStateChange,
  onViewStateDraft,
  className,
  interactive = true,
  environmentSource = null,
}: Props) {
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
  const dragStateRef = useRef<ModelDragState | null>(null);
  const viewStateRef = useRef(viewState);
  const layerRef = useRef(layer);
  const sceneNodeRef = useRef(sceneNode);
  const environmentSourceRef = useRef(environmentSource);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const onViewStateDraftRef = useRef(onViewStateDraft);
  const interactiveRef = useRef(interactive);
  const lockedRef = useRef(!!viewState.locked);
  const rfPaneRef = useRef<HTMLElement | null>(null);
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const modelSignature = [layer.modelSrc, layer.color, layer.accentColor].join(':');
  const sceneMaterialSignature = materialSignature(sceneNode);
  const sceneEnvironmentSignature = environmentSignature(sceneNode, environmentSource);

  const renderScene = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    setHasRenderedFrame(true);
  }, []);

  const applyViewState = useCallback(
    (next: PrimitiveViewportState) => {
      viewStateRef.current = next;
      const camera = cameraRef.current;
      if (camera) applyViewStateToCamera(camera, { ...next, zoom: clamp(next.zoom, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX) });
      const group = modelGroupRef.current;
      if (group) applyModelTransform(group, next, layerRef.current.tiltZ);
      renderScene();
    },
    [renderScene],
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
    if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = setTimeout(() => {
      wheelCommitTimerRef.current = null;
      onViewStateChangeRef.current({ ...viewStateRef.current });
    }, 90);
  }, []);

  const flushPendingWheelCommit = useCallback(() => {
    if (!wheelCommitTimerRef.current) return;
    clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = null;
    onViewStateChangeRef.current({ ...viewStateRef.current });
  }, []);

  useLayoutEffect(() => {
    layerRef.current = layer;
    sceneNodeRef.current = sceneNode;
    environmentSourceRef.current = environmentSource;
    viewStateRef.current = viewState;
    onViewStateChangeRef.current = onViewStateChange;
    onViewStateDraftRef.current = onViewStateDraft;
    interactiveRef.current = interactive;
    lockedRef.current = !!viewState.locked;
    if (viewState.locked) unlockRFPane();
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (renderer && scene) {
      sceneLightsRef.current = replaceSceneLights(scene, sceneLightsRef.current, layer, sceneNode);
      applyLiveSceneSettings(renderer, scene, modelRootRef.current, sceneNode, environmentMapRef.current);
    }
    applyViewState(viewState);
  }, [
    applyViewState,
    environmentSource,
    interactive,
    layer,
    onViewStateChange,
    onViewStateDraft,
    sceneNode,
    unlockRFPane,
    viewState,
  ]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const context = getWebglContext(canvas);
    if (!context) {
      setWebglUnavailable(true);
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const currentLayer = layerRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    cameraRef.current = createPrimitiveCamera();
    sceneLightsRef.current = replaceSceneLights(scene, null, currentLayer, sceneNodeRef.current);
    applyLiveSceneSettings(renderer, scene, null, sceneNodeRef.current, null);
    const resize = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      resizeRenderer(root, rendererRef.current, cameraRef.current);
      applyViewState(viewStateRef.current);
    };
    resize();
    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(root);

    let cancelled = false;
    setWebglUnavailable(false);
    setLoadFailed(false);
    setHasRenderedFrame(false);
    loadSceneEnvironmentMap(renderer, environmentSourceRef.current ?? sceneNodeRef.current?.environmentSrc)
      .then((environmentMap) => {
        if (cancelled) {
          disposeSceneEnvironment(environmentMap);
          return;
        }
        environmentMapRef.current = environmentMap;
        applyLiveSceneSettings(renderer, scene, modelRootRef.current, sceneNodeRef.current, environmentMap);
        renderScene();
      })
      .catch(() => {
        if (!cancelled) renderScene();
      });
    resolveModelSource(currentLayer.modelSrc)
      .then((source) => {
        if (!source) throw new Error('Model asset is unavailable');
        return modelSourceToArrayBuffer(source);
      })
      .then(parseGltfScene)
      .then((rootObject) => {
        if (cancelled) {
          disposeObject3D(rootObject);
          return;
        }
        applyModelFallbackMaterials(rootObject, layerRef.current);
        applySceneMaterialMode(rootObject, layerRef.current, sceneNodeRef.current);
        applySceneEnvironmentIntensity(rootObject, sceneNodeRef.current);
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
  }, [
    applyViewState,
    flushPendingWheelCommit,
    modelSignature,
    sceneEnvironmentSignature,
    sceneMaterialSignature,
    unlockRFPane,
    renderScene,
  ]);

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
      dragStateRef.current = createModelDragState(event, viewStateRef.current);
      root.setPointerCapture(event.pointerId);
      lockRFPane();
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      stopViewportEvent(event, true);
      applyDraft(modelDragViewState(root, drag, event));
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
      applyDraft({
        ...viewStateRef.current,
        zoom: clamp(viewStateRef.current.zoom - event.deltaY * 0.0016, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX),
      });
      scheduleWheelCommit();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!eventInside(root, event) || eventFromCameraControl(event)) return;
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
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive || locked) return;
    const next = nextKeyboardState(viewStateRef.current, event.key, event.shiftKey, layer);
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
      {(webglUnavailable || loadFailed) && (
        <div className="node-primitive-webgl-fallback" aria-live="polite">
          {webglUnavailable ? '3D preview unavailable' : 'Model preview unavailable'}
        </div>
      )}
    </div>
  );
}
