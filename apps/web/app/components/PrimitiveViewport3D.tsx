import { type MutableRefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PrimitiveLayer } from '../types/config';
import {
  addSceneLights,
  applyMeshTransform,
  applyViewStateToCamera,
  createPrimitiveCamera,
  createPrimitiveGeometry,
  createPrimitiveMaterial,
  disposeMesh,
  type MaterialTextureCanvases,
  type PrimitiveLightRig,
  type ResolvedMaterialConfig,
  updateSceneAccentLights,
} from '../utils/primitiveScene';
import {
  defaultPrimitiveViewportState,
  type PrimitiveRenderMode,
  type PrimitiveViewportState,
} from './PrimitiveViewportState';
import {
  applyKeyboardViewportState,
  createTransparentWebglRenderer,
  createViewportDragState,
  eventFromViewportControl,
  eventInsideViewport,
  findReactFlowPane,
  flushViewStateCommit,
  getWebglContext,
  matchingViewportDrag,
  nextViewportKeyboardState,
  resizeViewportRenderer,
  scheduleViewStateCommit,
  shouldStopViewportEvent,
  stopViewportEvent,
  type ViewportDragState,
  viewportDragViewState,
  wheelZoomViewState,
} from './viewport3DControls';

export interface PrimitiveViewport3DProps {
  layer: PrimitiveLayer;
  mode: 'node' | 'modal';
  renderMode: PrimitiveRenderMode;
  materialConfig?: ResolvedMaterialConfig;
  materialTextures?: MaterialTextureCanvases | null;
  viewState: PrimitiveViewportState;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
  onViewStateDraft?: (viewState: PrimitiveViewportState) => void;
  onHoverChange?: (hovered: boolean) => void;
  className?: string;
  interactive?: boolean;
}

function materialTextureCanvasSignature(textures: MaterialTextureCanvases) {
  return ['albedo', 'roughness', 'metalness', 'normal', 'alpha']
    .map((key) => {
      const canvas = textures[key as keyof MaterialTextureCanvases];
      return `${key}:${canvas?.width ?? 0}x${canvas?.height ?? 0}`;
    })
    .join('|');
}

function nextPrimitiveKeyboardState(
  current: PrimitiveViewportState,
  key: string,
  shiftKey: boolean,
  layer: PrimitiveLayer,
) {
  return nextViewportKeyboardState(current, key, shiftKey, defaultPrimitiveViewportState(layer));
}

function shouldStartPrimitiveDrag(root: HTMLElement, event: PointerEvent, interactive: boolean, locked: boolean) {
  return shouldStopViewportEvent(root, event, interactive, locked);
}

function applyPrimitiveViewStateToScene({
  next,
  mesh,
  camera,
  tiltZ,
  renderScene,
}: {
  next: PrimitiveViewportState;
  mesh: THREE.Mesh | null;
  camera: THREE.PerspectiveCamera | null;
  tiltZ: number;
  renderScene: (() => void) | null;
}) {
  if (!primitiveSceneHasTarget(mesh, camera)) return;
  applyPrimitiveMeshViewState(mesh, next, tiltZ);
  applyPrimitiveCameraViewState(camera, next);
  renderScene?.();
}

function primitiveSceneHasTarget(mesh: THREE.Mesh | null, camera: THREE.PerspectiveCamera | null) {
  return Boolean(mesh || camera);
}

function applyPrimitiveMeshViewState(mesh: THREE.Mesh | null, next: PrimitiveViewportState, tiltZ: number) {
  if (mesh) applyMeshTransform(mesh, next, tiltZ);
}

function applyPrimitiveCameraViewState(camera: THREE.PerspectiveCamera | null, next: PrimitiveViewportState) {
  if (camera) applyViewStateToCamera(camera, next);
}

function renderPrimitiveSceneFrame({
  renderer,
  scene,
  camera,
  mesh,
  hasRenderedFrameRef,
  setHasRenderedFrame,
}: {
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  mesh: THREE.Mesh | null;
  hasRenderedFrameRef: MutableRefObject<boolean>;
  setHasRenderedFrame: (value: boolean) => void;
}) {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
  markPrimitiveFrameRendered(mesh, hasRenderedFrameRef, setHasRenderedFrame);
}

function markPrimitiveFrameRendered(
  mesh: THREE.Mesh | null,
  hasRenderedFrameRef: MutableRefObject<boolean>,
  setHasRenderedFrame: (value: boolean) => void,
) {
  if (!mesh || hasRenderedFrameRef.current) return;
  hasRenderedFrameRef.current = true;
  setHasRenderedFrame(true);
}

interface PrimitiveSceneRefs {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  lightRigRef: MutableRefObject<PrimitiveLightRig | null>;
  objectGroupRef: MutableRefObject<THREE.Group | null>;
  meshRef: MutableRefObject<THREE.Mesh | null>;
  resizeObserverRef: MutableRefObject<ResizeObserver | null>;
  renderSceneRef: MutableRefObject<(() => void) | null>;
  dragStateRef: MutableRefObject<ViewportDragState | null>;
  layerRef: MutableRefObject<PrimitiveLayer>;
  viewStateRef: MutableRefObject<PrimitiveViewportState>;
  hasRenderedFrameRef: MutableRefObject<boolean>;
}

function resetPrimitiveSceneRefs(refs: PrimitiveSceneRefs) {
  refs.rendererRef.current = null;
  refs.sceneRef.current = null;
  refs.cameraRef.current = null;
  refs.lightRigRef.current = null;
  refs.objectGroupRef.current = null;
  refs.meshRef.current = null;
}

function cleanupPrimitiveScene(
  refs: PrimitiveSceneRefs,
  renderer: THREE.WebGLRenderer,
  flushPendingWheelCommit: () => void,
) {
  refs.resizeObserverRef.current?.disconnect();
  refs.resizeObserverRef.current = null;
  flushPendingWheelCommit();
  refs.renderSceneRef.current = null;
  refs.dragStateRef.current = null;
  if (refs.meshRef.current) disposeMesh(refs.meshRef.current);
  renderer.dispose();
  resetPrimitiveSceneRefs(refs);
}

function markPrimitiveWebglUnavailable(
  refs: PrimitiveSceneRefs,
  setWebglUnavailable: (value: boolean) => void,
  setHasRenderedFrame: (value: boolean) => void,
) {
  setWebglUnavailable(true);
  refs.hasRenderedFrameRef.current = true;
  setHasRenderedFrame(true);
}

function usePrimitiveSceneLifecycle({
  refs,
  applyViewState,
  flushPendingWheelCommit,
  setHasRenderedFrame,
  setWebglUnavailable,
}: {
  refs: PrimitiveSceneRefs;
  applyViewState: (next: PrimitiveViewportState) => void;
  flushPendingWheelCommit: () => void;
  setHasRenderedFrame: (value: boolean) => void;
  setWebglUnavailable: (value: boolean) => void;
}) {
  const {
    rootRef,
    canvasRef,
    rendererRef,
    sceneRef,
    cameraRef,
    lightRigRef,
    objectGroupRef,
    meshRef,
    resizeObserverRef,
    renderSceneRef,
    dragStateRef,
    layerRef,
    viewStateRef,
    hasRenderedFrameRef,
  } = refs;

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const context = getWebglContext(canvas);
    if (!context) {
      markPrimitiveWebglUnavailable(refs, setWebglUnavailable, setHasRenderedFrame);
      return () => {
        flushPendingWheelCommit();
        dragStateRef.current = null;
      };
    }

    setWebglUnavailable(false);
    const renderer = createTransparentWebglRenderer(canvas, context);
    rendererRef.current = renderer;
    hasRenderedFrameRef.current = false;
    setHasRenderedFrame(false);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    cameraRef.current = createPrimitiveCamera();
    lightRigRef.current = addSceneLights(scene, layerRef.current.accentColor);

    const objectGroup = new THREE.Group();
    objectGroupRef.current = objectGroup;
    scene.add(objectGroup);

    const renderScene = () =>
      renderPrimitiveSceneFrame({
        renderer: rendererRef.current,
        scene: sceneRef.current,
        camera: cameraRef.current,
        mesh: meshRef.current,
        hasRenderedFrameRef,
        setHasRenderedFrame,
      });
    renderSceneRef.current = renderScene;

    const resize = () => resizePrimitiveRenderer(root, refs, renderScene);
    resize();
    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(root);
    applyViewState(viewStateRef.current);

    return () => cleanupPrimitiveScene(refs, renderer, flushPendingWheelCommit);
  }, [
    applyViewState,
    cameraRef,
    canvasRef,
    dragStateRef,
    flushPendingWheelCommit,
    hasRenderedFrameRef,
    layerRef,
    lightRigRef,
    meshRef,
    objectGroupRef,
    refs,
    renderSceneRef,
    rendererRef,
    resizeObserverRef,
    rootRef,
    sceneRef,
    setHasRenderedFrame,
    setWebglUnavailable,
    viewStateRef,
  ]);
}

function resizePrimitiveRenderer(root: HTMLElement, refs: PrimitiveSceneRefs, renderScene: () => void) {
  if (!refs.rendererRef.current || !refs.cameraRef.current) return;
  resizeViewportRenderer(root, refs.rendererRef.current, refs.cameraRef.current);
  renderScene();
}

function commitPrimitiveGesture(
  viewStateRef: MutableRefObject<PrimitiveViewportState>,
  onViewStateDraftRef: MutableRefObject<Props['onViewStateDraft']>,
  onViewStateChangeRef: MutableRefObject<Props['onViewStateChange']>,
) {
  const next = { ...viewStateRef.current };
  onViewStateDraftRef.current?.(next);
  onViewStateChangeRef.current(next);
}

function usePrimitiveGestureListeners({
  rootRef,
  viewStateRef,
  interactive,
  interactiveRef,
  lockedRef,
  dragStateRef,
  isHoveredRef,
  onViewStateDraftRef,
  onViewStateChangeRef,
  applyDraftViewState,
  flushPendingWheelCommit,
  scheduleWheelCommit,
  lockRFPane,
  unlockRFPane,
}: {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  viewStateRef: MutableRefObject<PrimitiveViewportState>;
  interactive: boolean;
  interactiveRef: MutableRefObject<boolean>;
  lockedRef: MutableRefObject<boolean>;
  dragStateRef: MutableRefObject<ViewportDragState | null>;
  isHoveredRef: MutableRefObject<boolean>;
  onViewStateDraftRef: MutableRefObject<Props['onViewStateDraft']>;
  onViewStateChangeRef: MutableRefObject<Props['onViewStateChange']>;
  applyDraftViewState: (next: PrimitiveViewportState) => void;
  flushPendingWheelCommit: () => void;
  scheduleWheelCommit: () => void;
  lockRFPane: () => void;
  unlockRFPane: () => void;
}) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !interactive) return;

    const commit = () => commitPrimitiveGesture(viewStateRef, onViewStateDraftRef, onViewStateChangeRef);
    const onPointerDown = (event: PointerEvent) => {
      if (!shouldStartPrimitiveDrag(root, event, interactiveRef.current, lockedRef.current)) return;
      stopViewportEvent(event, true);
      dragStateRef.current = createViewportDragState(event, viewStateRef.current);
      root.setPointerCapture(event.pointerId);
      lockRFPane();
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = matchingViewportDrag(event, dragStateRef.current, interactiveRef.current);
      if (!drag) return;
      stopViewportEvent(event);
      event.preventDefault();
      applyDraftViewState(viewportDragViewState(root, drag, event));
    };
    const onPointerUp = (event: PointerEvent) => {
      const drag = matchingViewportDrag(event, dragStateRef.current, interactiveRef.current);
      if (!drag) return;
      stopViewportEvent(event);
      dragStateRef.current = null;
      if (!isHoveredRef.current) unlockRFPane();
      commit();
    };
    const onWheel = (event: WheelEvent) => {
      if (!shouldStopViewportEvent(root, event, interactiveRef.current, lockedRef.current)) return;
      stopViewportEvent(event, true);
      applyDraftViewState(wheelZoomViewState(viewStateRef.current, event.deltaY));
      scheduleWheelCommit();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!interactiveRef.current) return;
      if (!eventInsideViewport(root, event)) return;
      if (eventFromViewportControl(event)) return;
      stopViewportEvent(event, true);
    };
    const stopIfInside = (event: Event) => {
      if (shouldStopViewportEvent(root, event, interactiveRef.current, lockedRef.current)) stopViewportEvent(event);
    };

    const controller = new AbortController();
    const signal = controller.signal;
    const captureOptions: AddEventListenerOptions = { capture: true, signal };
    const wheelOptions: AddEventListenerOptions = { capture: true, passive: false, signal };

    document.addEventListener('pointerdown', onPointerDown, captureOptions);
    document.addEventListener('pointermove', onPointerMove, captureOptions);
    document.addEventListener('pointerup', onPointerUp, captureOptions);
    document.addEventListener('pointercancel', onPointerUp, captureOptions);
    window.addEventListener('wheel', onWheel, wheelOptions);
    document.addEventListener('wheel', onWheel, wheelOptions);
    document.addEventListener('contextmenu', onContextMenu, captureOptions);
    document.addEventListener('click', stopIfInside, captureOptions);
    document.addEventListener('dblclick', stopIfInside, captureOptions);
    root.addEventListener('mouseenter', () => startPrimitiveHover(isHoveredRef, lockedRef, lockRFPane), { signal });
    root.addEventListener('mouseleave', () => endPrimitiveHover(isHoveredRef, unlockRFPane), { signal });

    return () => {
      controller.abort();
      flushPendingWheelCommit();
      isHoveredRef.current = false;
      dragStateRef.current = null;
      unlockRFPane();
    };
  }, [
    applyDraftViewState,
    dragStateRef,
    flushPendingWheelCommit,
    interactive,
    interactiveRef,
    isHoveredRef,
    lockRFPane,
    lockedRef,
    onViewStateChangeRef,
    onViewStateDraftRef,
    rootRef,
    scheduleWheelCommit,
    unlockRFPane,
    viewStateRef,
  ]);
}

function startPrimitiveHover(
  isHoveredRef: MutableRefObject<boolean>,
  lockedRef: MutableRefObject<boolean>,
  lockRFPane: () => void,
) {
  isHoveredRef.current = true;
  if (!lockedRef.current) lockRFPane();
}

function endPrimitiveHover(isHoveredRef: MutableRefObject<boolean>, unlockRFPane: () => void) {
  isHoveredRef.current = false;
  unlockRFPane();
}

function primitiveViewportClassName(className: string | undefined, locked: boolean) {
  return ['node-interactive-viewport', className, locked ? 'node-interactive-viewport-locked' : 'nodrag nopan nowheel']
    .filter(Boolean)
    .join(' ');
}

function primitiveCanvasClassName(locked: boolean, interactive: boolean) {
  return locked || !interactive ? undefined : 'nodrag nopan nowheel';
}

function primitiveViewportAriaLabel(interactive: boolean, layerName: string) {
  return interactive
    ? `${layerName} 3D preview. Drag rotates, right drag pans, wheel zooms, arrow keys rotate, plus or minus zoom, Home resets.`
    : undefined;
}

function primitiveTabIndex(interactive: boolean) {
  return interactive ? 0 : -1;
}

function primitiveRole(interactive: boolean) {
  return interactive ? 'group' : undefined;
}

function primitiveAriaHidden(interactive: boolean) {
  return interactive ? undefined : true;
}

function primitiveRoleDescription(interactive: boolean) {
  return interactive ? 'interactive viewport' : undefined;
}

function primitiveTouchAction(locked: boolean, interactive: boolean) {
  return locked || !interactive ? 'auto' : 'none';
}

function primitiveCanvasOpacity(hasRenderedFrame: boolean) {
  return hasRenderedFrame ? 1 : 0;
}

function handlePrimitiveKeyDown({
  event,
  interactive,
  locked,
  viewStateRef,
  layer,
  applyViewState,
  onViewStateChange,
}: {
  event: React.KeyboardEvent<HTMLDivElement>;
  interactive: boolean;
  locked: boolean;
  viewStateRef: MutableRefObject<PrimitiveViewportState>;
  layer: PrimitiveLayer;
  applyViewState: (next: PrimitiveViewportState) => void;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
}) {
  if (!interactive || locked) return;
  const next = nextPrimitiveKeyboardState(viewStateRef.current, event.key, event.shiftKey, layer);
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  applyKeyboardViewportState(next, applyViewState, onViewStateChange);
}

function notifyPrimitiveHover(interactive: boolean, onHoverChange: Props['onHoverChange'], hovered: boolean) {
  if (interactive) onHoverChange?.(hovered);
}

function PrimitiveWebglFallback({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="node-primitive-webgl-fallback"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--muted)',
        fontSize: 11,
        letterSpacing: 0,
        textTransform: 'uppercase',
      }}
    >
      3D preview unavailable
    </div>
  );
}

function PrimitiveViewportShell({
  rootRef,
  canvasRef,
  className,
  locked,
  interactive,
  layerName,
  hasRenderedFrame,
  webglUnavailable,
  onKeyDown,
  onHoverChange,
}: {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  className?: string;
  locked: boolean;
  interactive: boolean;
  layerName: string;
  hasRenderedFrame: boolean;
  webglUnavailable: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onHoverChange?: Props['onHoverChange'];
}) {
  return (
    <div
      ref={rootRef}
      className={primitiveViewportClassName(className, locked)}
      tabIndex={primitiveTabIndex(interactive)}
      role={primitiveRole(interactive)}
      aria-hidden={primitiveAriaHidden(interactive)}
      aria-roledescription={primitiveRoleDescription(interactive)}
      aria-label={primitiveViewportAriaLabel(interactive, layerName)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => notifyPrimitiveHover(interactive, onHoverChange, true)}
      onMouseLeave={() => notifyPrimitiveHover(interactive, onHoverChange, false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        touchAction: primitiveTouchAction(locked, interactive),
      }}
    >
      <canvas
        ref={canvasRef}
        className={primitiveCanvasClassName(locked, interactive)}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: primitiveCanvasOpacity(hasRenderedFrame),
          transition: 'opacity 80ms ease-out',
        }}
      />
      <PrimitiveWebglFallback visible={webglUnavailable} />
    </div>
  );
}

export function PrimitiveViewport3D({
  layer,
  mode,
  renderMode,
  materialConfig,
  materialTextures,
  viewState,
  onViewStateChange,
  onViewStateDraft,
  onHoverChange,
  className,
  interactive = true,
}: PrimitiveViewport3DProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const lightRigRef = useRef<PrimitiveLightRig | null>(null);
  const objectGroupRef = useRef<THREE.Group | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewStateRef = useRef(viewState);
  const renderSceneRef = useRef<(() => void) | null>(null);
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRenderedFrameRef = useRef(false);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const dragStateRef = useRef<ViewportDragState | null>(null);

  // Stable refs so native listeners never close over stale props
  const modeRef = useRef(mode);
  const interactiveRef = useRef(interactive);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const onViewStateDraftRef = useRef(onViewStateDraft);
  const layerRef = useRef(layer);
  const layerTiltZRef = useRef(layer.tiltZ);
  const lockedRef = useRef(!!viewState.locked);

  // Hover lock: disable .react-flow__pane pointer-events while hovering so wheel events reach our canvas
  const rfPaneRef = useRef<HTMLElement | null>(null);
  const isHoveredRef = useRef(false);
  const sceneRefs = useMemo<PrimitiveSceneRefs>(
    () => ({
      rootRef,
      canvasRef,
      rendererRef,
      sceneRef,
      cameraRef,
      lightRigRef,
      objectGroupRef,
      meshRef,
      resizeObserverRef,
      renderSceneRef,
      dragStateRef,
      layerRef,
      viewStateRef,
      hasRenderedFrameRef,
    }),
    [],
  );

  const lockRFPane = useCallback(() => {
    if (lockedRef.current) return;
    if (!rfPaneRef.current) {
      rfPaneRef.current = findReactFlowPane(rootRef.current);
    }
    if (rfPaneRef.current) rfPaneRef.current.style.pointerEvents = 'none';
  }, []);

  const unlockRFPane = useCallback(() => {
    if (rfPaneRef.current && !dragStateRef.current) {
      rfPaneRef.current.style.pointerEvents = '';
    }
  }, []);

  const applyViewState = useCallback((next: PrimitiveViewportState) => {
    viewStateRef.current = next;
    applyPrimitiveViewStateToScene({
      next,
      mesh: meshRef.current,
      camera: cameraRef.current,
      tiltZ: layerTiltZRef.current,
      renderScene: renderSceneRef.current,
    });
  }, []);

  const applyDraftViewState = useCallback(
    (next: PrimitiveViewportState) => {
      applyViewState(next);
      onViewStateDraftRef.current?.({ ...next });
    },
    [applyViewState],
  );

  const scheduleWheelCommit = useCallback(() => {
    scheduleViewStateCommit(wheelCommitTimerRef, viewStateRef, onViewStateChangeRef);
  }, []);

  const flushPendingWheelCommit = useCallback(() => {
    flushViewStateCommit(wheelCommitTimerRef, viewStateRef, onViewStateChangeRef);
  }, []);

  const primitiveMeshKey = useMemo(
    () =>
      [
        layer.primitiveShape,
        layer.primitiveDepth,
        layer.primitiveShading,
        layer.color,
        layer.accentColor,
        materialConfig ? JSON.stringify(materialConfig) : 'layer-material',
        materialTextures ? materialTextureCanvasSignature(materialTextures) : 'no-material-textures',
        renderMode,
      ].join(':'),
    [
      layer.accentColor,
      layer.color,
      layer.primitiveDepth,
      layer.primitiveShading,
      layer.primitiveShape,
      materialConfig,
      materialTextures,
      renderMode,
    ],
  );

  useLayoutEffect(() => {
    viewStateRef.current = viewState;
    lockedRef.current = !!viewState.locked;
    if (viewState.locked) {
      unlockRFPane();
    } else if (isHoveredRef.current) {
      lockRFPane();
    }
  }, [lockRFPane, unlockRFPane, viewState]);

  useLayoutEffect(() => {
    modeRef.current = mode;
    interactiveRef.current = interactive;
    onViewStateChangeRef.current = onViewStateChange;
    onViewStateDraftRef.current = onViewStateDraft;
    if (!interactive) {
      isHoveredRef.current = false;
      dragStateRef.current = null;
      unlockRFPane();
    }
  }, [interactive, mode, onViewStateChange, onViewStateDraft, unlockRFPane]);

  useLayoutEffect(() => {
    layerRef.current = layer;
    layerTiltZRef.current = layer.tiltZ;
  }, [layer]);

  usePrimitiveSceneLifecycle({
    refs: sceneRefs,
    applyViewState,
    flushPendingWheelCommit,
    setHasRenderedFrame,
    setWebglUnavailable,
  });

  useEffect(() => {
    if (!lightRigRef.current) return;
    updateSceneAccentLights(lightRigRef.current, layer.accentColor);
    renderSceneRef.current?.();
  }, [layer.accentColor]);

  useEffect(() => {
    const objectGroup = objectGroupRef.current;
    if (!objectGroup) return;
    const existingMesh = meshRef.current;
    if (existingMesh) {
      objectGroup.remove(existingMesh);
      disposeMesh(existingMesh);
    }

    const currentLayer = layerRef.current;
    const mesh = new THREE.Mesh(
      createPrimitiveGeometry(currentLayer),
      createPrimitiveMaterial(currentLayer, materialConfig, renderMode, materialTextures),
    );
    mesh.rotation.z = 0; // full transform applied via applyMeshTransform in applyViewState
    objectGroup.add(mesh);
    meshRef.current = mesh;
    applyViewState(viewStateRef.current);
  }, [applyViewState, materialConfig, materialTextures, primitiveMeshKey, renderMode]);

  useEffect(() => {
    applyViewState(viewStateRef.current);
  }, [applyViewState, layer.tiltZ]);

  useEffect(() => {
    applyViewState(viewState);
  }, [applyViewState, viewState]);

  usePrimitiveGestureListeners({
    rootRef,
    viewStateRef,
    interactive,
    interactiveRef,
    lockedRef,
    dragStateRef,
    isHoveredRef,
    onViewStateDraftRef,
    onViewStateChangeRef,
    applyDraftViewState,
    flushPendingWheelCommit,
    scheduleWheelCommit,
    lockRFPane,
    unlockRFPane,
  });

  const locked = !!viewState.locked;
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) =>
      handlePrimitiveKeyDown({
        event,
        interactive,
        locked,
        viewStateRef,
        layer,
        applyViewState,
        onViewStateChange: onViewStateChangeRef.current,
      }),
    [applyViewState, interactive, layer, locked],
  );

  return (
    <PrimitiveViewportShell
      rootRef={rootRef}
      canvasRef={canvasRef}
      className={className}
      locked={locked}
      interactive={interactive}
      layerName={layer.name}
      hasRenderedFrame={hasRenderedFrame}
      webglUnavailable={webglUnavailable}
      onKeyDown={handleKeyDown}
      onHoverChange={onHoverChange}
    />
  );
}
