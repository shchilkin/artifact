/**
 * Shared Three.js scene recipe for primitive layers.
 *
 * Both PrimitiveViewport3D (live viewport) and primitiveRenderer (offscreen export)
 * must call the same helpers here. Preview/export parity depends on this invariant:
 * geometry, material, lights, shadow, camera, and mesh transforms are defined once.
 *
 * Renderer lifecycle is intentionally kept separate:
 * - PrimitiveViewport3D owns the live WebGLRenderer + ResizeObserver.
 * - primitiveRenderer owns the one-shot offscreen renderer.
 */
import * as THREE from 'three';
import { NODE_CANVAS_COLORS } from '../components/node-canvas/constants';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { PrimitiveLayer } from '../types/config';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const CAMERA_DISTANCE = 3.2;
export const CAMERA_FOV = 35;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100;
export const CAMERA_ZOOM_MIN = 0.6;
export const CAMERA_ZOOM_MAX = 2.6;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function createPrimitiveGeometry(layer: PrimitiveLayer): THREE.BufferGeometry {
  if (layer.primitiveShape === 'cube') {
    return new THREE.BoxGeometry(1.8, 1.8, 0.65 + layer.primitiveDepth / 80);
  }
  if (layer.primitiveShape === 'cylinder') {
    return new THREE.CylinderGeometry(0.92, 0.92, 1.1 + layer.primitiveDepth / 110, 32);
  }
  return new THREE.SphereGeometry(1, 32, 24);
}

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

/**
 * Create a material for a primitive layer.
 * renderMode defaults to 'shaded' when omitted (used by offscreen renderer).
 */
export function createPrimitiveMaterial(
  layer: PrimitiveLayer,
  renderMode: PrimitiveRenderMode = 'shaded',
): THREE.Material {
  const color = new THREE.Color(layer.color);
  if (renderMode === 'unlit') {
    return new THREE.MeshBasicMaterial({ color, wireframe: false });
  }
  return new THREE.MeshStandardMaterial({
    color,
    emissive:
      renderMode === 'wireframe'
        ? new THREE.Color(layer.accentColor).multiplyScalar(0.08)
        : new THREE.Color(NODE_CANVAS_COLORS.sceneShadow),
    metalness: 0.18,
    roughness: renderMode === 'wireframe' ? 0.9 : 0.38,
    wireframe: renderMode === 'wireframe',
    flatShading: layer.primitiveShading === 'flat',
  });
}

// ---------------------------------------------------------------------------
// Scene lighting + shadow
// ---------------------------------------------------------------------------

/**
 * Add the shared light rig to a scene.
 * Accent-colored key and rim lights derive from accentColor.
 */
export function addSceneLights(scene: THREE.Scene, accentColor: string): void {
  const accent = new THREE.Color(accentColor);

  scene.add(new THREE.AmbientLight(NODE_CANVAS_COLORS.sceneAmbient, 1.15));

  const keyLight = new THREE.DirectionalLight(accent, 1.45);
  keyLight.position.set(2.4, 2.8, 3.4);
  scene.add(keyLight);

  const fill = new THREE.DirectionalLight(NODE_CANVAS_COLORS.sceneFill, 0.65);
  fill.position.set(-2.8, -1.2, 1.5);
  scene.add(fill);

  const rim = new THREE.PointLight(accent, 0.55, 8);
  rim.position.set(-2.1, 1.6, 2.4);
  scene.add(rim);
}

/** Add the soft circular drop-shadow mesh to a scene. */
export function addSceneShadow(scene: THREE.Scene): THREE.Mesh {
  const geom = new THREE.CircleGeometry(1.35, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: NODE_CANVAS_COLORS.sceneShadow,
    transparent: true,
    opacity: 0.18,
  });
  const shadow = new THREE.Mesh(geom, mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -1.18, 0);
  shadow.scale.set(1.15, 0.6, 1);
  scene.add(shadow);
  return shadow;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Create a perspective camera at the default position. */
export function createPrimitiveCamera(aspect = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  return camera;
}

/** Position a camera according to a PrimitiveViewportState. */
export function applyViewStateToCamera(camera: THREE.PerspectiveCamera, viewState: PrimitiveViewportState): void {
  const z = CAMERA_DISTANCE / clamp(viewState.zoom, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  camera.position.set(viewState.panX, viewState.panY, z);
  camera.lookAt(viewState.panX, viewState.panY, 0);
}

// ---------------------------------------------------------------------------
// Mesh transforms
// ---------------------------------------------------------------------------

/**
 * Apply rotation from a PrimitiveViewportState + the layer's durable tiltZ to a mesh.
 * rotationX and rotationY come from the live camera state; tiltZ is the document value.
 */
export function applyMeshTransform(mesh: THREE.Mesh, viewState: PrimitiveViewportState, tiltZ: number): void {
  mesh.rotation.x = degToRad(viewState.rotationX);
  mesh.rotation.y = degToRad(viewState.rotationY);
  mesh.rotation.z = degToRad(tiltZ);
}

// ---------------------------------------------------------------------------
// Disposal helpers
// ---------------------------------------------------------------------------

/** Dispose geometry and material(s) of a mesh. */
export function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material.dispose();
  }
}
