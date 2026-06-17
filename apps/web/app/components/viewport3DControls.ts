import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { CAMERA_DISTANCE, CAMERA_FOV, CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN, clamp } from '../utils/primitiveScene';
import type { PrimitiveViewportState } from './PrimitiveViewportState';

export type ViewportDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startView: PrimitiveViewportState;
  mode: 'rotate' | 'pan';
};

const ROTATE_STEP = 8;
const PAN_STEP = 0.12;
const ZOOM_STEP = 0.14;
const WHEEL_ZOOM_SPEED = 0.0016;
const COMMIT_DELAY_MS = 90;

type KeyboardAction = (next: PrimitiveViewportState, shiftKey: boolean) => void;

const KEYBOARD_ACTIONS: Record<string, KeyboardAction> = {
  ArrowUp: (next, shiftKey) => {
    if (shiftKey) next.panY -= PAN_STEP;
    else next.rotationX = clamp(next.rotationX - ROTATE_STEP, -85, 85);
  },
  ArrowDown: (next, shiftKey) => {
    if (shiftKey) next.panY += PAN_STEP;
    else next.rotationX = clamp(next.rotationX + ROTATE_STEP, -85, 85);
  },
  ArrowLeft: (next, shiftKey) => {
    if (shiftKey) next.panX -= PAN_STEP;
    else next.rotationY -= ROTATE_STEP;
  },
  ArrowRight: (next, shiftKey) => {
    if (shiftKey) next.panX += PAN_STEP;
    else next.rotationY += ROTATE_STEP;
  },
  '+': (next) => {
    next.zoom = clamp(next.zoom + ZOOM_STEP, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  },
  '=': (next) => {
    next.zoom = clamp(next.zoom + ZOOM_STEP, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  },
  '-': (next) => {
    next.zoom = clamp(next.zoom - ZOOM_STEP, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  },
  _: (next) => {
    next.zoom = clamp(next.zoom - ZOOM_STEP, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  },
};

export function stopViewportEvent(event: Event, preventDefault = false) {
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (preventDefault) event.preventDefault();
}

export function eventInsideViewport(root: HTMLElement, event: Event) {
  return root.contains(event.target as Node);
}

export function eventFromViewportControl(event: Event) {
  return event.target instanceof Element && event.target.closest('[data-primitive-camera-control]') !== null;
}

export function shouldStopViewportEvent(root: HTMLElement, event: Event, interactive: boolean, locked: boolean) {
  return interactive && eventInsideViewport(root, event) && !eventFromViewportControl(event) && !locked;
}

export function createViewportDragState(event: PointerEvent, viewState: PrimitiveViewportState): ViewportDragState {
  return {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startView: { ...viewState },
    mode: event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'rotate',
  };
}

export function matchingViewportDrag(
  event: PointerEvent,
  drag: ViewportDragState | null,
  interactive: boolean,
): ViewportDragState | null {
  if (!interactive) return null;
  if (!drag || drag.pointerId !== event.pointerId) return null;
  return drag;
}

export function viewportDragViewState(root: HTMLElement, drag: ViewportDragState, event: PointerEvent) {
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (drag.mode === 'pan') return pannedViewportState(root, drag.startView, dx, dy);
  return rotatedViewportState(drag.startView, dx, dy);
}

export function wheelZoomViewState(viewState: PrimitiveViewportState, deltaY: number): PrimitiveViewportState {
  return {
    ...viewState,
    zoom: clamp(viewState.zoom - deltaY * WHEEL_ZOOM_SPEED, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX),
  };
}

export function nextViewportKeyboardState(
  current: PrimitiveViewportState,
  key: string,
  shiftKey: boolean,
  resetState: PrimitiveViewportState,
) {
  if (key === 'Home') return { ...resetState, locked: current.locked };
  const action = KEYBOARD_ACTIONS[key];
  if (!action) return null;
  const next = { ...current };
  action(next, shiftKey);
  return next;
}

export function applyKeyboardViewportState(
  next: PrimitiveViewportState,
  applyState: (next: PrimitiveViewportState) => void,
  onViewStateChange: (viewState: PrimitiveViewportState) => void,
) {
  applyState(next);
  onViewStateChange({ ...next });
}

export function findReactFlowPane(root: HTMLElement | null) {
  return (root?.closest('.react-flow')?.querySelector('.react-flow__pane') as HTMLElement) ?? null;
}

export function getWebglContext(canvas: HTMLCanvasElement) {
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

export function createTransparentWebglRenderer(canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
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
  return renderer;
}

export function resizeViewportRenderer(
  root: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
) {
  const rect = root.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function scheduleViewStateCommit(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  viewStateRef: MutableRefObject<PrimitiveViewportState>,
  onViewStateChangeRef: MutableRefObject<(viewState: PrimitiveViewportState) => void>,
) {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    onViewStateChangeRef.current({ ...viewStateRef.current });
  }, COMMIT_DELAY_MS);
}

export function flushViewStateCommit(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  viewStateRef: MutableRefObject<PrimitiveViewportState>,
  onViewStateChangeRef: MutableRefObject<(viewState: PrimitiveViewportState) => void>,
) {
  if (!timerRef.current) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
  onViewStateChangeRef.current({ ...viewStateRef.current });
}

function pannedViewportState(
  root: HTMLElement,
  startView: PrimitiveViewportState,
  dx: number,
  dy: number,
): PrimitiveViewportState {
  const panDelta = viewportPanDelta(root, startView, dx, dy);
  return {
    ...startView,
    panX: startView.panX - panDelta.x,
    panY: startView.panY + panDelta.y,
  };
}

function rotatedViewportState(startView: PrimitiveViewportState, dx: number, dy: number): PrimitiveViewportState {
  return {
    ...startView,
    rotationX: clamp(startView.rotationX + dy * 0.35, -85, 85),
    rotationY: startView.rotationY + dx * 0.4,
  };
}

function viewportPanDelta(
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
