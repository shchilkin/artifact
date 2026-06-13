import * as THREE from 'three';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { GraphScene3DNode, ModelLayer } from '../types/config';
import { resolveEnvironmentSource } from './envAssetStore';
import { resolveModelSource } from './modelAssetStore';
import {
  applyViewStateToCamera,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  clamp,
  createPrimitiveCamera,
  degToRad,
} from './primitiveScene';

const MODEL_FIT_SIZE = 1.9;

interface ModelRenderOptions {
  forceFallback?: boolean;
}

interface ModelSceneRenderOptions extends ModelRenderOptions {
  backdropCanvas?: HTMLCanvasElement | null;
  environmentCanvas?: HTMLCanvasElement | null;
  environmentSource?: string | null;
}

export type SceneEnvironmentMap = {
  environment: THREE.Texture;
  background: THREE.Texture;
  dispose: () => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized.length === 3 ? normalized.replace(/(.)/g, '$1$1') : normalized, 16);
  if (!Number.isFinite(value)) return [255, 90, 54];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function canvasHasModelContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    if (a > 8 && Math.max(r, g, b) > 16) return true;
  }
  return false;
}

function drawFallbackModel(canvas: HTMLCanvasElement, layer: ModelLayer): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const r = size * 0.32;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = rgba(layer.color, 0.82);
  ctx.strokeStyle = rgba(layer.accentColor, 0.78);
  ctx.lineWidth = Math.max(1, size / 96);
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.46);
  ctx.lineTo(r * 0.12, -r * 0.78);
  ctx.lineTo(r * 0.74, -r * 0.38);
  ctx.lineTo(r * 0.62, r * 0.52);
  ctx.lineTo(-r * 0.34, r * 0.78);
  ctx.lineTo(-r * 0.78, r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rgba(layer.accentColor, 0.45);
  ctx.lineWidth = Math.max(1, size / 150);
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.46);
  ctx.lineTo(-r * 0.34, r * 0.78);
  ctx.moveTo(r * 0.12, -r * 0.78);
  ctx.lineTo(r * 0.62, r * 0.52);
  ctx.moveTo(r * 0.74, -r * 0.38);
  ctx.lineTo(-r * 0.78, r * 0.12);
  ctx.stroke();
  ctx.restore();
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  const commaIndex = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || commaIndex < 0) return null;
  const header = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const binary = header.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function modelSourceToArrayBuffer(source: string): Promise<ArrayBuffer> {
  const dataBuffer = dataUrlToArrayBuffer(source);
  if (dataBuffer) return dataBuffer;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to load model source: ${response.status}`);
  return response.arrayBuffer();
}

export async function parseGltfScene(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf) => resolve(gltf.scene),
      (error) => reject(error instanceof Error ? error : new Error('Unable to parse GLB model')),
    );
  });
}

export async function loadEquirectangularTexture(source: string): Promise<THREE.Texture> {
  if (/\.hdr(?:[?#].*)?$/i.test(source) || source.startsWith('data:image/vnd.radiance')) {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
    return new RGBELoader().loadAsync(source);
  }
  const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
  return new EXRLoader().loadAsync(source);
}

export async function loadSceneEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  environmentSource: string | null | undefined,
): Promise<SceneEnvironmentMap | null> {
  if (!environmentSource) return null;
  const source = await resolveEnvironmentSource(environmentSource);
  if (!source) return null;
  const background = await loadEquirectangularTexture(source);
  background.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(background);
  pmrem.dispose();
  return {
    environment: target.texture,
    background,
    dispose: () => {
      target.dispose();
      background.dispose();
    },
  };
}

export function applyModelFallbackMaterials(root: THREE.Object3D, layer: ModelLayer): void {
  const fallbackMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.color),
    roughness: 0.52,
    metalness: 0.08,
  });
  let usedFallback = false;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.material) return;
    object.material = fallbackMaterial;
    usedFallback = true;
  });

  if (!usedFallback) fallbackMaterial.dispose();
}

export function normalizeModelRoot(root: THREE.Object3D): THREE.Group | null {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return null;

  const center = box.getCenter(new THREE.Vector3());
  const group = new THREE.Group();
  root.position.sub(center);
  group.add(root);
  group.scale.setScalar(MODEL_FIT_SIZE / maxDimension);
  return group;
}

export function applyModelTransform(group: THREE.Group, viewState: PrimitiveViewportState, tiltZ: number): void {
  group.rotation.x = degToRad(viewState.rotationX);
  group.rotation.y = degToRad(viewState.rotationY);
  group.rotation.z = degToRad(tiltZ);
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

export function applySceneMaterialMode(root: THREE.Object3D, layer: ModelLayer, sceneNode?: GraphScene3DNode): void {
  const mode = sceneNode?.materialMode ?? 'original';
  if (mode === 'original') return;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else if (object.material) disposeMaterial(object.material);
    object.material =
      mode === 'unlit'
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color(layer.color) })
        : new THREE.MeshStandardMaterial({
            color: new THREE.Color(layer.color),
            roughness: 0.72,
            metalness: 0.02,
            flatShading: true,
          });
  });
}

export function applySceneEnvironmentIntensity(root: THREE.Object3D, sceneNode?: GraphScene3DNode): void {
  const intensity = Math.max(0, (sceneNode?.environmentStrength ?? 0) / 100);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material && 'envMapIntensity' in material) {
        material.envMapIntensity = intensity;
        material.needsUpdate = true;
      }
    });
  });
}

function averageCanvasColor(canvas: HTMLCanvasElement): THREE.Color | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const sampleW = Math.min(32, canvas.width);
  const sampleH = Math.min(16, canvas.height);
  if (sampleW <= 0 || sampleH <= 0) return null;
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0.02) continue;
    r += data[index] * alpha;
    g += data[index + 1] * alpha;
    b += data[index + 2] * alpha;
    count += alpha;
  }
  if (count <= 0) return null;
  return new THREE.Color(r / count / 255, g / count / 255, b / count / 255);
}

export function addModelSceneLights(
  scene: THREE.Object3D,
  layer: ModelLayer,
  sceneNode?: GraphScene3DNode,
  environmentCanvas?: HTMLCanvasElement | null,
): void {
  const accent = new THREE.Color(layer.accentColor);
  const ambientIntensity = (sceneNode?.ambientIntensity ?? 115) / 100;
  const environmentStrength = (sceneNode?.environmentStrength ?? 0) / 100;
  const keyIntensity = (sceneNode?.keyIntensity ?? 145) / 100;
  const fillIntensity = (sceneNode?.fillIntensity ?? 65) / 100;
  const rimIntensity = (sceneNode?.rimIntensity ?? 55) / 100;
  const azimuth = degToRad(sceneNode?.keyAzimuth ?? 38);
  const elevation = degToRad(sceneNode?.keyElevation ?? 42);
  const radius = 4.2;
  const keyX = Math.cos(elevation) * Math.sin(azimuth) * radius;
  const keyY = Math.sin(elevation) * radius;
  const keyZ = Math.cos(elevation) * Math.cos(azimuth) * radius;

  scene.add(new THREE.AmbientLight(0xf4ece4, ambientIntensity));
  const environmentColor = environmentCanvas ? averageCanvasColor(environmentCanvas) : null;
  if (environmentColor && environmentStrength > 0) {
    scene.add(new THREE.AmbientLight(environmentColor, environmentStrength));
  }

  const keyLight = new THREE.DirectionalLight(accent, keyIntensity);
  keyLight.position.set(keyX, keyY, keyZ);
  scene.add(keyLight);

  const fill = new THREE.DirectionalLight(0x7f91a8, fillIntensity);
  fill.position.set(-keyX * 0.75, Math.max(-1.2, keyY * -0.35), Math.max(1.2, keyZ * 0.45));
  scene.add(fill);

  const rim = new THREE.PointLight(accent, rimIntensity, 8);
  rim.position.set(-keyX * 0.65, Math.max(1.2, keyY * 0.45), -Math.max(1.8, keyZ * 0.5));
  scene.add(rim);
}

function drawSceneBackdrop(
  target: HTMLCanvasElement,
  backdropCanvas: HTMLCanvasElement | null | undefined,
  environmentCanvas: HTMLCanvasElement | null | undefined,
): void {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const backdrop = backdropCanvas ?? environmentCanvas;
  if (!backdrop) return;
  ctx.drawImage(backdrop, 0, 0, target.width, target.height);
}

function drawRenderedScene(
  target: HTMLCanvasElement,
  renderCanvas: HTMLCanvasElement,
  sceneNode: GraphScene3DNode | undefined,
  options: ModelSceneRenderOptions,
): void {
  const outCtx = target.getContext('2d');
  if (!outCtx) return;
  outCtx.clearRect(0, 0, target.width, target.height);
  drawSceneBackdrop(target, options.backdropCanvas, options.environmentCanvas);
  outCtx.save();
  outCtx.globalAlpha = Math.max(0, (sceneNode?.exposure ?? 100) / 100);
  outCtx.drawImage(renderCanvas, 0, 0, target.width, target.height);
  outCtx.restore();
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else if (object.material) disposeMaterial(object.material);
  });
}

export const modelRendererTestInternals = {
  canvasHasModelContent,
  dataUrlToArrayBuffer,
};

export async function renderModelToCanvas(
  layer: ModelLayer,
  size: number | { width: number; height: number },
  viewState?: PrimitiveViewportState,
  options: ModelRenderOptions = {},
): Promise<HTMLCanvasElement> {
  return renderModelSceneToCanvas(layer, undefined, size, viewState, options);
}

export async function renderModelSceneToCanvas(
  layer: ModelLayer,
  sceneNode: GraphScene3DNode | undefined,
  size: number | { width: number; height: number },
  viewState?: PrimitiveViewportState,
  options: ModelSceneRenderOptions = {},
): Promise<HTMLCanvasElement> {
  const targetWidth = typeof size === 'number' ? size : size.width;
  const targetHeight = typeof size === 'number' ? size : size.height;
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.max(1, Math.round(targetWidth));
  offscreen.height = Math.max(1, Math.round(targetHeight));
  if (options.forceFallback) {
    drawFallbackModel(offscreen, layer);
    return offscreen;
  }

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = offscreen.width;
  renderCanvas.height = offscreen.height;

  const context = (() => {
    try {
      return renderCanvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
      });
    } catch {
      return null;
    }
  })();
  if (!context) {
    drawFallbackModel(offscreen, layer);
    return offscreen;
  }

  let renderer: THREE.WebGLRenderer | null = null;
  let modelRoot: THREE.Object3D | null = null;
  let environmentMap: SceneEnvironmentMap | null = null;

  try {
    const resolvedSource = await resolveModelSource(layer.modelSrc);
    if (!resolvedSource) throw new Error('Model asset is unavailable');
    const buffer = await modelSourceToArrayBuffer(resolvedSource);
    modelRoot = await parseGltfScene(buffer);
    applyModelFallbackMaterials(modelRoot, layer);
    applySceneMaterialMode(modelRoot, layer, sceneNode);
    const group = normalizeModelRoot(modelRoot);
    if (!group) throw new Error('Model has no renderable bounds');

    renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, context, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(renderCanvas.width, renderCanvas.height, false);

    const scene = new THREE.Scene();
    environmentMap = await loadSceneEnvironmentMap(renderer, options.environmentSource ?? sceneNode?.environmentSrc);
    if (environmentMap) {
      scene.environment = environmentMap.environment;
      if (sceneNode && !sceneNode.transparent) scene.background = environmentMap.background;
    }
    applySceneEnvironmentIntensity(modelRoot, sceneNode);
    const camera = createPrimitiveCamera(renderCanvas.width / renderCanvas.height);
    const effectiveViewState: PrimitiveViewportState = viewState ?? {
      rotationX: layer.tiltX,
      rotationY: layer.tiltY,
      zoom: 1,
      panX: 0,
      panY: 0,
    };
    applyViewStateToCamera(camera, {
      ...effectiveViewState,
      zoom: clamp(effectiveViewState.zoom, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX),
    });
    addModelSceneLights(scene, layer, sceneNode, options.environmentCanvas);
    applyModelTransform(group, effectiveViewState, layer.tiltZ);
    scene.add(group);

    renderer.render(scene, camera);
    drawRenderedScene(offscreen, renderCanvas, sceneNode, options);
  } catch {
    drawFallbackModel(offscreen, layer);
  } finally {
    environmentMap?.dispose();
    if (modelRoot) disposeObject3D(modelRoot);
    if (renderer) renderer.dispose();
    renderCanvas.width = 0;
    renderCanvas.height = 0;
  }

  if (!canvasHasModelContent(offscreen)) drawFallbackModel(offscreen, layer);

  return offscreen;
}
