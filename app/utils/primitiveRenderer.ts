import * as THREE from 'three';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { PrimitiveLayer } from '../types/config';
import {
  addSceneLights,
  addSceneShadow,
  applyMeshTransform,
  applyViewStateToCamera,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  createPrimitiveCamera,
  createPrimitiveGeometry,
  createPrimitiveMaterial,
  degToRad,
  disposeMesh,
} from './primitiveScene';

const SOURCE_OVERSCAN = 1.22;

/**
 * Render a primitive layer to an offscreen HTMLCanvasElement using Three.js WebGL.
 * The source renderer keeps a bit of overscan so tilted or deeper primitives
 * don't clip against the layer canvas when composited into the document.
 */
export async function renderPrimitiveToCanvas(
  layer: PrimitiveLayer,
  size: number,
  viewState?: PrimitiveViewportState,
): Promise<HTMLCanvasElement> {
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;

  const effectiveViewState: PrimitiveViewportState = viewState ?? {
    rotationX: layer.tiltX,
    rotationY: layer.tiltY,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  const renderSize = viewState ? size : Math.max(size, Math.round(size * SOURCE_OVERSCAN));
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = renderSize;
  renderCanvas.height = renderSize;

  const renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(renderSize, renderSize, false);

  const scene = new THREE.Scene();

  const camera = createPrimitiveCamera();
  applyViewStateToCamera(camera, {
    ...effectiveViewState,
    zoom: Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, effectiveViewState.zoom)),
  });

  addSceneLights(scene, layer.accentColor);
  const shadowMesh = addSceneShadow(scene);

  const geometry = createPrimitiveGeometry(layer);
  // Export always uses 'shaded' mode — renderMode is a live viewport concept.
  const material = createPrimitiveMaterial(layer, 'shaded');
  const mesh = new THREE.Mesh(geometry, material);
  applyMeshTransform(mesh, effectiveViewState, layer.tiltZ);
  scene.add(mesh);

  renderer.render(scene, camera);

  const outCtx = offscreen.getContext('2d');
  if (outCtx) {
    outCtx.clearRect(0, 0, size, size);
    outCtx.drawImage(renderCanvas, 0, 0, renderSize, renderSize, 0, 0, size, size);
  }

  disposeMesh(mesh);
  disposeMesh(shadowMesh);
  renderer.forceContextLoss();
  renderer.dispose();
  renderCanvas.width = 0;
  renderCanvas.height = 0;

  return offscreen;
}

// Re-export so callers that used to import degToRad from here continue to work.
export { degToRad };
