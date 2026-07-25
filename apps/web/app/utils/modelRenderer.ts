import { hashStringToUint32 } from '@artifact/shared/hash';
import * as THREE from 'three';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import {
  DEFAULT_MATERIAL_CONFIG,
  type GraphScene3DNode,
  type MaterialConfig,
  type ModelLayer,
  type PrimitiveLayer,
} from '../types/config';
import { resolveImageSource } from './assetStore';
import {
  canvasHasVisibleContent as canvasHasModelContent,
  createSizedCanvas,
  rgbaFromHex as rgba,
} from './canvasRendering';
import { resolveEnvironmentSource } from './envAssetStore';
import { resolveModelSource } from './modelAssetStore';
import {
  applyPhysicalMaterialTextures,
  applyViewStateToCamera,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  canvasMaterialTexture,
  clamp,
  createCanvasTexture,
  createMaterialEnvironmentMap,
  createMaterialPatternCanvas,
  createPrimitiveCamera,
  createPrimitiveGeometry,
  createPrimitiveMaterial,
  degToRad,
  materialValue,
} from './primitiveScene';

export class ModelAssetUnavailableError extends Error {
  constructor() {
    super('Model asset is unavailable');
    this.name = 'ModelAssetUnavailableError';
  }
}

const MODEL_FIT_SIZE = 1.9;
const MODEL_FIT_RADIUS = 0.92;

interface ModelRenderOptions {
  forceFallback?: boolean;
}

interface ModelSceneRenderOptions extends ModelRenderOptions {
  backdropCanvas?: HTMLCanvasElement | null;
  environmentCanvas?: HTMLCanvasElement | null;
  environmentSource?: string | null;
  materialConfig?: MaterialConfig;
  materialTextures?: SceneMaterialTextureCanvases | null;
}

export type Scene3DSourceLayer = ModelLayer | PrimitiveLayer;

export interface SceneMaterialTextureCanvases {
  albedo?: HTMLCanvasElement | null;
  roughness?: HTMLCanvasElement | null;
  metalness?: HTMLCanvasElement | null;
  normal?: HTMLCanvasElement | null;
  alpha?: HTMLCanvasElement | null;
}

export type SceneEnvironmentMap = {
  environment: THREE.Texture;
  background: THREE.Texture;
  dispose: () => void;
};

type SceneEnvironmentLightSource = HTMLCanvasElement | THREE.Texture | null | undefined;

function isThreeMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh & { isMesh?: boolean }).isMesh === true;
}

function drawFallbackModel(canvas: HTMLCanvasElement, layer: Scene3DSourceLayer): void {
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

async function modelSourceToArrayBuffer(source: string): Promise<ArrayBuffer> {
  const dataBuffer = dataUrlToArrayBuffer(source);
  if (dataBuffer) return dataBuffer;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to load model source: ${response.status}`);
  return response.arrayBuffer();
}

async function parseGltfScene(buffer: ArrayBuffer): Promise<THREE.Object3D> {
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
  return createSceneEnvironmentMap(renderer, background);
}

function createSceneEnvironmentMap(renderer: THREE.WebGLRenderer, background: THREE.Texture): SceneEnvironmentMap {
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

export function loadSceneEnvironmentCanvas(
  renderer: THREE.WebGLRenderer,
  environmentCanvas: HTMLCanvasElement | null | undefined,
) {
  if (!environmentCanvas) return null;
  const background = new THREE.CanvasTexture(environmentCanvas);
  background.colorSpace = THREE.SRGBColorSpace;
  background.needsUpdate = true;
  return createSceneEnvironmentMap(renderer, background);
}

function applyModelFallbackMaterials(root: THREE.Object3D, layer: Scene3DSourceLayer): void {
  const fallbackMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.color),
    roughness: 0.52,
    metalness: 0.08,
  });
  let usedFallback = false;

  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
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
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : maxDimension / 2;
  const group = new THREE.Group();
  root.position.sub(center);
  group.add(root);
  group.scale.setScalar(Math.min(MODEL_FIT_SIZE / maxDimension, MODEL_FIT_RADIUS / radius));
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

function replaceMeshMaterials(root: THREE.Object3D, createMaterial: () => THREE.Material) {
  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else if (object.material) disposeMaterial(object.material);
    object.material = createMaterial();
  });
}

async function loadSceneMaterialTexture(source: string | undefined, colorSpace?: THREE.ColorSpace) {
  if (!source) return undefined;
  const resolvedSource = await resolveImageSource(source);
  if (!resolvedSource) return undefined;
  const texture = await new THREE.TextureLoader().loadAsync(resolvedSource);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function firstTexture(...textures: Array<THREE.Texture | undefined>) {
  return textures.find((texture) => texture !== undefined);
}

function fallbackBumpMap(normalMap: THREE.Texture | undefined, canvas: HTMLCanvasElement) {
  return normalMap ? undefined : createCanvasTexture(canvas);
}

function textureOrCanvas(texture: THREE.Texture | undefined, canvas: HTMLCanvasElement, colorSpace?: THREE.ColorSpace) {
  return texture ?? createCanvasTexture(canvas, colorSpace);
}

async function createSceneMaterialTextureSet(
  config: MaterialConfig,
  materialTextures?: SceneMaterialTextureCanvases | null,
) {
  if (typeof document === 'undefined') return {};
  const supplied = materialTextures ?? {};
  const seed = {
    value: hashStringToUint32(`${config.materialPreset}:${config.materialBaseColor}:${config.materialAccentColor}`),
  };
  const mapCanvas = createMaterialPatternCanvas(config, seed, 'albedo');
  const bumpCanvas = createMaterialPatternCanvas(config, seed, 'scene-bump');

  const [albedoMap, roughnessMap, metalnessMap, normalMap, alphaMap] = await Promise.all([
    loadSceneMaterialTexture(config.materialAlbedoSrc, THREE.SRGBColorSpace).catch(() => undefined),
    loadSceneMaterialTexture(config.materialRoughnessSrc).catch(() => undefined),
    loadSceneMaterialTexture(config.materialMetalnessSrc).catch(() => undefined),
    loadSceneMaterialTexture(config.materialNormalSrc).catch(() => undefined),
    loadSceneMaterialTexture(config.materialAlphaSrc).catch(() => undefined),
  ]);
  const resolvedAlbedoMap = firstTexture(canvasMaterialTexture(supplied.albedo, THREE.SRGBColorSpace), albedoMap);
  const resolvedRoughnessMap = firstTexture(canvasMaterialTexture(supplied.roughness), roughnessMap);
  const resolvedMetalnessMap = firstTexture(canvasMaterialTexture(supplied.metalness), metalnessMap);
  const resolvedNormalMap = firstTexture(canvasMaterialTexture(supplied.normal), normalMap);
  const resolvedAlphaMap = firstTexture(canvasMaterialTexture(supplied.alpha), alphaMap);

  return {
    map: textureOrCanvas(resolvedAlbedoMap, mapCanvas, THREE.SRGBColorSpace),
    roughnessMap: resolvedRoughnessMap,
    metalnessMap: resolvedMetalnessMap,
    normalMap: resolvedNormalMap,
    alphaMap: resolvedAlphaMap,
    bumpMap: fallbackBumpMap(resolvedNormalMap, bumpCanvas),
  };
}

async function createSceneMaterial(
  config: MaterialConfig,
  materialTextures?: SceneMaterialTextureCanvases | null,
): Promise<THREE.Material> {
  const metalness = materialValue(config.materialMetalness, DEFAULT_MATERIAL_CONFIG.materialMetalness);
  const roughness = materialValue(config.materialRoughness, DEFAULT_MATERIAL_CONFIG.materialRoughness);
  const clearcoat = materialValue(config.materialClearcoat, DEFAULT_MATERIAL_CONFIG.materialClearcoat);
  const relief = materialValue(config.materialRelief, DEFAULT_MATERIAL_CONFIG.materialRelief);
  const textureSet = await createSceneMaterialTextureSet(config, materialTextures);
  const params: THREE.MeshPhysicalMaterialParameters = {
    color: textureSet.map ? 0xffffff : new THREE.Color(config.materialBaseColor),
    emissive: new THREE.Color(config.materialAccentColor).multiplyScalar(relief * 0.06),
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: Math.max(0.03, roughness * 0.7),
    envMapIntensity: 0.24 + metalness * 1.15 + clearcoat * 0.45,
  };
  applyPhysicalMaterialTextures(params, textureSet, relief * 0.075);
  const environmentMap = createMaterialEnvironmentMap(config);
  if (environmentMap) params.envMap = environmentMap;

  const material = new THREE.MeshPhysicalMaterial(params);
  material.needsUpdate = true;
  return material;
}

export async function applySceneMaterialConfig(
  root: THREE.Object3D,
  materialConfig?: MaterialConfig,
  materialTextures?: SceneMaterialTextureCanvases | null,
): Promise<void> {
  if (!materialConfig) return;
  const material = await createSceneMaterial(materialConfig, materialTextures);
  replaceMeshMaterials(root, () => material.clone());
  material.dispose();
}

export function applySceneMaterialMode(
  root: THREE.Object3D,
  layer: Scene3DSourceLayer,
  sceneNode?: GraphScene3DNode,
): void {
  const mode = sceneNode?.materialMode ?? 'original';
  if (mode === 'original') return;
  replaceMeshMaterials(root, () =>
    mode === 'unlit'
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(layer.color) })
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(layer.color),
          roughness: 0.72,
          metalness: 0.02,
          flatShading: true,
        }),
  );
}

function createPrimitiveSceneObject(layer: PrimitiveLayer): THREE.Object3D {
  return new THREE.Mesh(createPrimitiveGeometry(layer), createPrimitiveMaterial(layer, undefined, 'shaded'));
}

export async function loadScene3DSourceObject(
  layer: Scene3DSourceLayer,
  sceneNode?: GraphScene3DNode,
  materialConfig?: MaterialConfig,
  materialTextures?: SceneMaterialTextureCanvases | null,
): Promise<THREE.Object3D> {
  let root: THREE.Object3D;
  if (layer.kind === 'primitive') {
    root = createPrimitiveSceneObject(layer);
  } else {
    const resolvedSource = await resolveModelSource(layer.modelSrc);
    if (!resolvedSource) throw new ModelAssetUnavailableError();
    const buffer = await modelSourceToArrayBuffer(resolvedSource);
    root = await parseGltfScene(buffer);
    applyModelFallbackMaterials(root, layer);
  }
  if (!materialConfig) applySceneMaterialMode(root, layer, sceneNode);
  await applySceneMaterialConfig(root, materialConfig, materialTextures);
  return root;
}

function generatedMaterialEnvironmentMap(texture: THREE.Texture | null | undefined): texture is THREE.Texture {
  return texture?.userData.artifactGeneratedMaterialEnvMap === true;
}

function materialBaseEnvironmentIntensity(material: THREE.Material & { envMapIntensity?: number }) {
  const stored = material.userData.artifactBaseEnvMapIntensity;
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  const base = Number.isFinite(material.envMapIntensity) ? (material.envMapIntensity ?? 1) : 1;
  material.userData.artifactBaseEnvMapIntensity = base;
  return base;
}

export function applySceneEnvironmentIntensity(
  root: THREE.Object3D,
  sceneNode?: GraphScene3DNode,
  useSceneEnvironment = false,
): void {
  const intensity = Math.max(0, (sceneNode?.environmentStrength ?? 0) / 100);
  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material && 'envMapIntensity' in material) {
        material.envMapIntensity = materialBaseEnvironmentIntensity(material) * intensity;
        if (useSceneEnvironment && 'envMap' in material && generatedMaterialEnvironmentMap(material.envMap)) {
          material.envMap.dispose();
          material.envMap = null;
        }
        material.needsUpdate = true;
      }
    });
  });
}

export function applySceneEnvironmentRotation(scene: THREE.Scene, sceneNode?: GraphScene3DNode): void {
  const yaw = degToRad(sceneNode?.environmentRotation ?? 0);
  scene.environmentRotation.set(0, yaw, 0);
  scene.backgroundRotation.set(0, yaw, 0);
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

function textureChannelValue(data: ArrayLike<number>, index: number, texture: THREE.Texture): number {
  const raw = data[index] ?? 0;
  if (texture.type === THREE.HalfFloatType) return THREE.DataUtils.fromHalfFloat(raw) || 0;
  if (texture.type === THREE.FloatType) return raw;
  return raw / 255;
}

function tonemapEnvironmentChannel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / (value + 1);
}

interface TextureSamplingPlan {
  data: ArrayLike<number>;
  width: number;
  height: number;
  stride: number;
  stepX: number;
  stepY: number;
}

function textureSamplingPlan(texture: THREE.Texture): TextureSamplingPlan | null {
  const image = texture.image as { data?: ArrayLike<number>; width?: number; height?: number } | undefined;
  const data = image?.data;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!data || width <= 0 || height <= 0) return null;
  const stride = data.length / (width * height);
  if (!Number.isFinite(stride) || stride < 3) return null;
  return {
    data,
    width,
    height,
    stride,
    stepX: Math.max(1, Math.floor(width / 48)),
    stepY: Math.max(1, Math.floor(height / 24)),
  };
}

function averageTextureChannels(texture: THREE.Texture, plan: TextureSamplingPlan) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = 0; y < plan.height; y += plan.stepY) {
    for (let x = 0; x < plan.width; x += plan.stepX) {
      const index = Math.floor((y * plan.width + x) * plan.stride);
      r += tonemapEnvironmentChannel(textureChannelValue(plan.data, index, texture));
      g += tonemapEnvironmentChannel(textureChannelValue(plan.data, index + 1, texture));
      b += tonemapEnvironmentChannel(textureChannelValue(plan.data, index + 2, texture));
      count += 1;
    }
  }
  return { r, g, b, count };
}

function averageTextureColor(texture: THREE.Texture): THREE.Color | null {
  const plan = textureSamplingPlan(texture);
  if (!plan) return null;
  const { r, g, b, count } = averageTextureChannels(texture, plan);
  return count > 0 ? new THREE.Color(r / count, g / count, b / count) : null;
}

function averageEnvironmentLightColor(source: SceneEnvironmentLightSource): THREE.Color | null {
  if (!source) return null;
  return typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement
    ? averageCanvasColor(source)
    : averageTextureColor(source as THREE.Texture);
}

export function addModelSceneLights(
  scene: THREE.Object3D,
  layer: Scene3DSourceLayer,
  sceneNode?: GraphScene3DNode,
  environmentSource?: SceneEnvironmentLightSource,
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
  const environmentColor = averageEnvironmentLightColor(environmentSource);
  if (environmentColor && environmentStrength > 0) {
    scene.add(new THREE.HemisphereLight(environmentColor, 0x1b1118, environmentStrength * 0.85));
    scene.add(new THREE.AmbientLight(environmentColor, environmentStrength * 0.45));
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

function drawSceneBackdrop(target: HTMLCanvasElement, backdropCanvas: HTMLCanvasElement | null | undefined): void {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  if (!backdropCanvas) return;
  ctx.drawImage(backdropCanvas, 0, 0, target.width, target.height);
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
  drawSceneBackdrop(target, options.backdropCanvas);
  outCtx.save();
  outCtx.globalAlpha = Math.max(0, (sceneNode?.exposure ?? 100) / 100);
  outCtx.drawImage(renderCanvas, 0, 0, target.width, target.height);
  outCtx.restore();
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
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
  layer: Scene3DSourceLayer,
  sceneNode: GraphScene3DNode | undefined,
  size: number | { width: number; height: number },
  viewState?: PrimitiveViewportState,
  options: ModelSceneRenderOptions = {},
): Promise<HTMLCanvasElement> {
  const offscreen = createSizedCanvas(size);
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
    modelRoot = await loadScene3DSourceObject(layer, sceneNode, options.materialConfig, options.materialTextures);
    const group = normalizeModelRoot(modelRoot);
    if (!group) throw new Error('Model has no renderable bounds');

    renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, context, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(renderCanvas.width, renderCanvas.height, false);

    const scene = new THREE.Scene();
    environmentMap =
      (await loadSceneEnvironmentMap(renderer, options.environmentSource ?? sceneNode?.environmentSrc)) ??
      loadSceneEnvironmentCanvas(renderer, options.environmentCanvas);
    if (environmentMap) {
      scene.environment = environmentMap.environment;
      if (sceneNode && !sceneNode.transparent) scene.background = environmentMap.background;
    }
    applySceneEnvironmentRotation(scene, sceneNode);
    applySceneEnvironmentIntensity(modelRoot, sceneNode, Boolean(environmentMap));
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
    addModelSceneLights(scene, layer, sceneNode, environmentMap?.background ?? options.environmentCanvas);
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
