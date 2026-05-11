import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PrimitiveLayer } from '../types/config';
import { NODE_CANVAS_COLORS } from './node-canvas/constants';
import { defaultPrimitiveViewportState, type PrimitiveRenderMode, type PrimitiveViewportState } from './PrimitiveViewportState';

interface Props {
  layer: PrimitiveLayer;
  mode: 'node' | 'modal';
  renderMode: PrimitiveRenderMode;
  viewState: PrimitiveViewportState;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
  onRotationCommit?: (rotationX: number, rotationY: number) => void;
  onHoverChange?: (hovered: boolean) => void;
  className?: string;
}

const CAMERA_DISTANCE = 3.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function hexToColor(hex: string) {
  return new THREE.Color(hex);
}

function createGeometry(layer: PrimitiveLayer) {
  if (layer.primitiveShape === 'cube') {
    return new THREE.BoxGeometry(1.8, 1.8, 0.65 + layer.primitiveDepth / 80);
  }
  if (layer.primitiveShape === 'cylinder') {
    return new THREE.CylinderGeometry(0.92, 0.92, 1.1 + layer.primitiveDepth / 110, 32);
  }
  return new THREE.SphereGeometry(1, 32, 24);
}

function createMaterial(layer: PrimitiveLayer, renderMode: PrimitiveRenderMode) {
  const color = hexToColor(layer.color);
  if (renderMode === 'unlit') {
    return new THREE.MeshBasicMaterial({ color, wireframe: false });
  }
  return new THREE.MeshStandardMaterial({
    color,
    emissive: renderMode === 'wireframe'
      ? hexToColor(layer.accentColor).multiplyScalar(0.08)
      : new THREE.Color(NODE_CANVAS_COLORS.sceneShadow),
    metalness: 0.18,
    roughness: renderMode === 'wireframe' ? 0.9 : 0.38,
    wireframe: renderMode === 'wireframe',
    flatShading: layer.primitiveShading === 'flat',
  });
}

export function PrimitiveViewport3D({
  layer,
  mode,
  renderMode,
  viewState,
  onViewStateChange,
  onRotationCommit,
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
  const onRotationCommitRef = useRef(onRotationCommit);
  const layerTiltZRef = useRef(layer.tiltZ);

  // Hover lock: disable .react-flow__pane pointer-events while hovering so wheel events reach our canvas
  const rfPaneRef = useRef<HTMLElement | null>(null);
  const isHoveredRef = useRef(false);

  const lockRFPane = () => {
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
    mesh.rotation.x = degToRad(next.rotationX);
    mesh.rotation.y = degToRad(next.rotationY);
    mesh.rotation.z = degToRad(layerTiltZRef.current);
    camera.position.set(next.panX, next.panY, CAMERA_DISTANCE / clamp(next.zoom, 0.6, 2.6));
    camera.lookAt(next.panX, next.panY, 0);
    renderSceneRef.current?.();
  }, []);

  useLayoutEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useLayoutEffect(() => {
    modeRef.current = mode;
    onViewStateChangeRef.current = onViewStateChange;
    onRotationCommitRef.current = onRotationCommit;
    layerTiltZRef.current = layer.tiltZ;
  }, [mode, onViewStateChange, onRotationCommit, layer.tiltZ]);

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

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    cameraRef.current = camera;

    const ambient = new THREE.AmbientLight(NODE_CANVAS_COLORS.sceneAmbient, 1.15);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(hexToColor(layer.accentColor), 1.45);
    keyLight.position.set(2.4, 2.8, 3.4);
    scene.add(keyLight);

    const fill = new THREE.DirectionalLight(NODE_CANVAS_COLORS.sceneFill, 0.65);
    fill.position.set(-2.8, -1.2, 1.5);
    scene.add(fill);

    const rim = new THREE.PointLight(hexToColor(layer.accentColor), 0.55, 8);
    rim.position.set(-2.1, 1.6, 2.4);
    scene.add(rim);

    const objectGroup = new THREE.Group();
    objectGroupRef.current = objectGroup;
    scene.add(objectGroup);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 48),
      new THREE.MeshBasicMaterial({ color: NODE_CANVAS_COLORS.sceneShadow, transparent: true, opacity: 0.18 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -1.18, 0);
    shadow.scale.set(1.15, 0.6, 1);
    scene.add(shadow);

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
      meshRef.current?.geometry.dispose();
      if (Array.isArray(meshRef.current?.material)) {
        meshRef.current?.material.forEach((material) => material.dispose());
      } else {
        meshRef.current?.material.dispose();
      }
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      objectGroupRef.current = null;
      meshRef.current = null;
    };
  }, [layer.accentColor]);

  useEffect(() => {
    const objectGroup = objectGroupRef.current;
    if (!objectGroup) return;
    const existingMesh = meshRef.current;
    if (existingMesh) {
      objectGroup.remove(existingMesh);
      existingMesh.geometry.dispose();
      if (Array.isArray(existingMesh.material)) {
        existingMesh.material.forEach((material) => material.dispose());
      } else {
        existingMesh.material.dispose();
      }
    }

    const mesh = new THREE.Mesh(createGeometry(layer), createMaterial(layer, renderMode));
    mesh.rotation.z = degToRad(layer.tiltZ);
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

    const commit = () => onViewStateChangeRef.current({ ...viewStateRef.current });

    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      const gestureMode = modeRef.current === 'modal' && (e.button === 1 || e.button === 2 || e.shiftKey)
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
      if (drag.mode === 'rotate') {
        onRotationCommitRef.current?.(viewStateRef.current.rotationX, viewStateRef.current.rotationY);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!inside(e)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      if (modeRef.current === 'node' && e.ctrlKey) return;
      // scroll up (deltaY < 0) → zoom out; scroll down (deltaY > 0) → zoom in
      const next = {
        ...viewStateRef.current,
        zoom: clamp(viewStateRef.current.zoom + (e.deltaY * 0.0016), 0.6, 2.6),
      };
      applyViewState(next);
      onViewStateChangeRef.current({ ...next });
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!inside(e)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (modeRef.current === 'modal') e.preventDefault();
    };

    const stopIfInside = (e: Event) => {
      if (!inside(e)) return;
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
    root.addEventListener('mouseenter', () => { isHoveredRef.current = true; lockRFPane(); }, { signal: sig });
    root.addEventListener('mouseleave', () => { isHoveredRef.current = false; unlockRFPane(); }, { signal: sig });

    return () => {
      controller.abort();
      isHoveredRef.current = false;
      dragStateRef.current = null;
      unlockRFPane();
    };
  }, [applyViewState]); // stable — all live values accessed via refs

  return (
    <div
      ref={rootRef}
      className={['node-interactive-viewport', className, 'nodrag', 'nopan', 'nowheel'].filter(Boolean).join(' ')}
      tabIndex={0}
      role="group"
      aria-roledescription="interactive viewport"
      aria-label={`${layer.name} 3D preview. Arrow keys rotate, Shift plus arrow keys pan, plus or minus zoom, Home resets.`}
      onKeyDown={(event) => {
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
            Object.assign(next, defaultPrimitiveViewportState(layer));
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
        if (rotated) {
          onRotationCommitRef.current?.(next.rotationX, next.rotationY);
        }
      }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="nodrag nopan nowheel" style={{ display: 'block', width: '100%', height: '100%' }} />
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
