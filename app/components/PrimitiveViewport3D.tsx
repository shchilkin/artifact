import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PrimitiveLayer } from '../types/config';
import { defaultPrimitiveViewportState, type PrimitiveRenderMode, type PrimitiveViewportState } from './PrimitiveViewportState';
import {
  addSceneLights,
  addSceneShadow,
  applyMeshTransform,
  applyViewStateToCamera,
  clamp,
  createPrimitiveCamera,
  createPrimitiveGeometry,
  createPrimitiveMaterial,
  disposeMesh,
} from '../utils/primitiveScene';

interface Props {
  layer: PrimitiveLayer;
  mode: 'node' | 'modal';
  renderMode: PrimitiveRenderMode;
  viewState: PrimitiveViewportState;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
  onHoverChange?: (hovered: boolean) => void;
  className?: string;
}

export function PrimitiveViewport3D({
  layer,
  mode,
  renderMode,
  viewState,
  onViewStateChange,
  onHoverChange,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const objectGroupRef = useRef<THREE.Group | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewStateRef = useRef(viewState);
  const renderSceneRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startView: PrimitiveViewportState;
    mode: 'rotate' | 'pan';
  } | null>(null);

  // Stable refs so native listeners never close over stale props
  const modeRef = useRef(mode);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const layerTiltZRef = useRef(layer.tiltZ);
  const lockedRef = useRef(!!viewState.locked);

  // Hover lock: disable .react-flow__pane pointer-events while hovering so wheel events reach our canvas
  const rfPaneRef = useRef<HTMLElement | null>(null);
  const isHoveredRef = useRef(false);

  const lockRFPane = () => {
    if (lockedRef.current) return;
    if (!rfPaneRef.current) {
      rfPaneRef.current = rootRef.current?.closest('.react-flow')
        ?.querySelector('.react-flow__pane') as HTMLElement ?? null;
    }
    if (rfPaneRef.current) rfPaneRef.current.style.pointerEvents = 'none';
  };

  const unlockRFPane = () => {
    if (rfPaneRef.current && !dragStateRef.current) {
      rfPaneRef.current.style.pointerEvents = '';
    }
  };

  const applyViewState = useCallback((next: PrimitiveViewportState) => {
    viewStateRef.current = next;
    const mesh = meshRef.current;
    const camera = cameraRef.current;
    if (!mesh || !camera) return;
    applyMeshTransform(mesh, next, layerTiltZRef.current);
    applyViewStateToCamera(camera, next);
    renderSceneRef.current?.();
  }, []);

  useLayoutEffect(() => {
    viewStateRef.current = viewState;
    lockedRef.current = !!viewState.locked;
    if (viewState.locked) {
      unlockRFPane();
    } else if (isHoveredRef.current) {
      lockRFPane();
    }
  }, [viewState]);

  useLayoutEffect(() => {
    modeRef.current = mode;
    onViewStateChangeRef.current = onViewStateChange;
    layerTiltZRef.current = layer.tiltZ;
  }, [mode, onViewStateChange, layer.tiltZ]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = createPrimitiveCamera();
    cameraRef.current = camera;

    addSceneLights(scene, layer.accentColor);
    addSceneShadow(scene);

    const objectGroup = new THREE.Group();
    objectGroupRef.current = objectGroup;
    scene.add(objectGroup);

    const renderScene = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };
    renderSceneRef.current = renderScene;

    const resize = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      const rect = root.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      rendererRef.current.setSize(width, height, false);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      renderScene();
    };

    resize();
    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(root);
    renderScene();

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      renderSceneRef.current = null;
      dragStateRef.current = null;
      if (meshRef.current) disposeMesh(meshRef.current);
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      objectGroupRef.current = null;
      meshRef.current = null;
    };
  }, [layer.accentColor]); // intentional: only rebuild scene when accent color changes, not on every layer field update

  useEffect(() => {
    const objectGroup = objectGroupRef.current;
    if (!objectGroup) return;
    const existingMesh = meshRef.current;
    if (existingMesh) {
      objectGroup.remove(existingMesh);
      disposeMesh(existingMesh);
    }

    const mesh = new THREE.Mesh(createPrimitiveGeometry(layer), createPrimitiveMaterial(layer, renderMode));
    mesh.rotation.z = 0; // full transform applied via applyMeshTransform in applyViewState
    objectGroup.add(mesh);
    meshRef.current = mesh;
    renderSceneRef.current?.();
  }, [layer, renderMode]);

  useEffect(() => {
    applyViewState(viewState);
  }, [applyViewState, viewState]);

  // Document-level capture listeners — fire before ReactFlow, d3-zoom, and all framework listeners.
  // Hover-locking the RF pane is the actual isolation mechanism: while pane has pointer-events:none,
  // wheel events target our canvas instead of the pane.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const inside = (e: Event) => root.contains(e.target as Node);
    const fromControl = (e: Event) => (
      e.target instanceof Element
      && e.target.closest('[data-primitive-camera-control]') !== null
    );

    const commit = () => onViewStateChangeRef.current({ ...viewStateRef.current });

    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e)) return;
      if (fromControl(e) || lockedRef.current) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      const gestureMode = e.button === 1 || e.button === 2 || e.shiftKey
        ? 'pan'
        : 'rotate';
      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startView: { ...viewStateRef.current },
        mode: gestureMode,
      };
      root.setPointerCapture(e.pointerId);
      // Hover already locked the pane; ensure it's locked even if mouseenter was missed
      lockRFPane();
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!inside(e) && !drag) return;
      if (!drag && lockedRef.current) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (drag.mode === 'pan') {
        applyViewState({
          ...drag.startView,
          panX: drag.startView.panX - dx * 0.006,
          panY: drag.startView.panY + dy * 0.006,
        });
        return;
      }
      applyViewState({
        ...drag.startView,
        rotationX: clamp(drag.startView.rotationX + dy * 0.35, -85, 85),
        rotationY: drag.startView.rotationY + dx * 0.4,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!inside(e) && !drag) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragStateRef.current = null;
      // Only release the pane if the cursor is no longer hovering
      if (!isHoveredRef.current) unlockRFPane();
      commit();
    };

    const onWheel = (e: WheelEvent) => {
      if (!inside(e)) return;
      if (fromControl(e) || lockedRef.current) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      const next = {
        ...viewStateRef.current,
        zoom: clamp(viewStateRef.current.zoom - (e.deltaY * 0.0016), 0.6, 2.6),
      };
      applyViewState(next);
      onViewStateChangeRef.current({ ...next });
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!inside(e)) return;
      if (fromControl(e)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const stopIfInside = (e: Event) => {
      if (!inside(e)) return;
      if (fromControl(e) || lockedRef.current) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const controller = new AbortController();
    const sig = controller.signal;
    const cap: AddEventListenerOptions = { capture: true, signal: sig };
    const capPassive: AddEventListenerOptions = { capture: true, passive: false, signal: sig };

    document.addEventListener('pointerdown', onPointerDown, cap);
    document.addEventListener('pointermove', onPointerMove, cap);
    document.addEventListener('pointerup', onPointerUp, cap);
    document.addEventListener('pointercancel', onPointerUp, cap);
    document.addEventListener('wheel', onWheel, capPassive);
    document.addEventListener('contextmenu', onContextMenu, cap);
    document.addEventListener('click', stopIfInside, cap);
    document.addEventListener('dblclick', stopIfInside, cap);

    // Hover-lock: disable RF pane pointer-events while hovering so events reach our canvas
    root.addEventListener('mouseenter', () => { isHoveredRef.current = true; if (!lockedRef.current) lockRFPane(); }, { signal: sig });
    root.addEventListener('mouseleave', () => { isHoveredRef.current = false; unlockRFPane(); }, { signal: sig });

    return () => {
      controller.abort();
      isHoveredRef.current = false;
      dragStateRef.current = null;
      unlockRFPane();
    };
  }, [applyViewState]); // stable, all live values accessed via refs

  const locked = !!viewState.locked;

  return (
    <div
      ref={rootRef}
      className={['node-interactive-viewport', className, locked ? 'node-interactive-viewport-locked' : 'nodrag nopan nowheel'].filter(Boolean).join(' ')}
      tabIndex={0}
      role="group"
      aria-roledescription="interactive viewport"
      aria-label={`${layer.name} 3D preview. Drag rotates, right drag pans, wheel zooms, arrow keys rotate, plus or minus zoom, Home resets.`}
      onKeyDown={(event) => {
        if (locked) return;
        const next = { ...viewStateRef.current };
        const rotateStep = 8;
        const panStep = 0.12;
        const zoomStep = 0.14;
        let changed = false;
        let rotated = false;

        switch (event.key) {
          case 'ArrowUp':
            if (event.shiftKey) next.panY -= panStep;
            else {
              next.rotationX = clamp(next.rotationX - rotateStep, -85, 85);
              rotated = true;
            }
            changed = true;
            break;
          case 'ArrowDown':
            if (event.shiftKey) next.panY += panStep;
            else {
              next.rotationX = clamp(next.rotationX + rotateStep, -85, 85);
              rotated = true;
            }
            changed = true;
            break;
          case 'ArrowLeft':
            if (event.shiftKey) next.panX -= panStep;
            else {
              next.rotationY -= rotateStep;
              rotated = true;
            }
            changed = true;
            break;
          case 'ArrowRight':
            if (event.shiftKey) next.panX += panStep;
            else {
              next.rotationY += rotateStep;
              rotated = true;
            }
            changed = true;
            break;
          case '+':
          case '=':
            next.zoom = clamp(next.zoom + zoomStep, 0.6, 2.6);
            changed = true;
            break;
          case '-':
          case '_':
            next.zoom = clamp(next.zoom - zoomStep, 0.6, 2.6);
            changed = true;
            break;
          case 'Home':
            Object.assign(next, defaultPrimitiveViewportState(layer), { locked: next.locked });
            changed = true;
            rotated = true;
            break;
          default:
            break;
        }

        if (!changed) return;
        event.preventDefault();
        event.stopPropagation();
        applyKeyboardState(next, applyViewState, onViewStateChangeRef.current);
        void rotated;
      }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: locked ? 'auto' : 'none' }}
      >
      <canvas
        ref={canvasRef}
        className={locked ? undefined : 'nodrag nopan nowheel'}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}

function applyKeyboardState(
  next: PrimitiveViewportState,
  applyState: (next: PrimitiveViewportState) => void,
  onViewStateChange: (viewState: PrimitiveViewportState) => void,
) {
  applyState(next);
  onViewStateChange({ ...next });
}
