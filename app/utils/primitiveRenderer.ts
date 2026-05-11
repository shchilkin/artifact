import * as THREE from 'three';
import type { PrimitiveLayer } from '../types/config';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import { NODE_CANVAS_COLORS } from '../components/node-canvas/constants';

const CAMERA_DISTANCE = 3.2;
const SOURCE_OVERSCAN = 1.22;

function degToRad(v: number) { return (v * Math.PI) / 180; }

function makeGeometry(layer: PrimitiveLayer): THREE.BufferGeometry {
  if (layer.primitiveShape === 'cube') {
    return new THREE.BoxGeometry(1.8, 1.8, 0.65 + layer.primitiveDepth / 80);
  }
  if (layer.primitiveShape === 'cylinder') {
    return new THREE.CylinderGeometry(0.92, 0.92, 1.1 + layer.primitiveDepth / 110, 32);
  }
  return new THREE.SphereGeometry(1, 32, 24);
}

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

  const effectiveViewState = viewState ?? {
    rotationX: layer.tiltX,
    rotationY: layer.tiltY,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  const renderSize = viewState
    ? size
    : Math.max(size, Math.round(size * SOURCE_OVERSCAN));
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = renderSize;
  renderCanvas.height = renderSize;

  const renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(renderSize, renderSize, false);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(
    effectiveViewState.panX,
    effectiveViewState.panY,
    CAMERA_DISTANCE / Math.min(2.6, Math.max(0.6, effectiveViewState.zoom)),
  );
  camera.lookAt(effectiveViewState.panX, effectiveViewState.panY, 0);

  const accentColor = new THREE.Color(layer.accentColor);

  scene.add(new THREE.AmbientLight(NODE_CANVAS_COLORS.sceneAmbient, 1.15));

  const keyLight = new THREE.DirectionalLight(accentColor, 1.45);
  keyLight.position.set(2.4, 2.8, 3.4);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(NODE_CANVAS_COLORS.sceneFill, 0.65);
  fillLight.position.set(-2.8, -1.2, 1.5);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(accentColor, 0.55, 8);
  rimLight.position.set(-2.1, 1.6, 2.4);
  scene.add(rimLight);

  const shadowGeom = new THREE.CircleGeometry(1.35, 48);
  const shadowMat = new THREE.MeshBasicMaterial({ color: NODE_CANVAS_COLORS.sceneShadow, transparent: true, opacity: 0.18 });
  const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, -1.18, 0);
  shadowMesh.scale.set(1.15, 0.6, 1);
  scene.add(shadowMesh);

  const geometry = makeGeometry(layer);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.color),
    emissive: new THREE.Color(NODE_CANVAS_COLORS.sceneShadow),
    metalness: 0.18,
    roughness: 0.38,
    flatShading: layer.primitiveShading === 'flat',
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = degToRad(effectiveViewState.rotationX);
  mesh.rotation.y = degToRad(effectiveViewState.rotationY);
  mesh.rotation.z = degToRad(layer.tiltZ);
  scene.add(mesh);

  renderer.render(scene, camera);

  const outCtx = offscreen.getContext('2d');
  if (outCtx) {
    outCtx.clearRect(0, 0, size, size);
    outCtx.drawImage(renderCanvas, 0, 0, renderSize, renderSize, 0, 0, size, size);
  }

  geometry.dispose();
  material.dispose();
  shadowGeom.dispose();
  shadowMat.dispose();
  renderer.forceContextLoss();
  renderer.dispose();
  renderCanvas.width = 0;
  renderCanvas.height = 0;

  return offscreen;
}
