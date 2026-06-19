/**
 * Shared Three.js scene recipe for primitive layers.
 *
 * Both PrimitiveViewport3D (live viewport) and primitiveRenderer (offscreen export)
 * must call the same helpers here. Preview/export parity depends on this invariant:
 * geometry, material, lights, camera, and mesh transforms are defined once.
 *
 * Renderer lifecycle is intentionally kept separate:
 * - PrimitiveViewport3D owns the live WebGLRenderer + ResizeObserver.
 * - primitiveRenderer owns the one-shot offscreen renderer.
 */
import * as THREE from 'three';
import { NODE_CANVAS_COLORS } from '../components/node-canvas/constants';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { MaterialConfig, PrimitiveLayer } from '../types/config';
import { DEFAULT_MATERIAL_CONFIG } from '../types/config';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const CAMERA_DISTANCE = 3.2;
export const CAMERA_FOV = 35;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 100;
export const CAMERA_ZOOM_MIN = 0.08;
export const CAMERA_ZOOM_MAX = 6;
const MATERIAL_TEXTURE_SIZE = 160;
const ENV_TEXTURE_WIDTH = 256;
const ENV_TEXTURE_HEIGHT = 128;

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

export type ResolvedMaterialConfig = MaterialConfig;

export interface MaterialTextureCanvases {
  albedo?: HTMLCanvasElement | null;
  roughness?: HTMLCanvasElement | null;
  metalness?: HTMLCanvasElement | null;
  normal?: HTMLCanvasElement | null;
  alpha?: HTMLCanvasElement | null;
}

export function primitiveLayerMaterialConfig(layer: PrimitiveLayer): ResolvedMaterialConfig {
  return {
    ...DEFAULT_MATERIAL_CONFIG,
    materialPreset: layer.materialPreset ?? DEFAULT_MATERIAL_CONFIG.materialPreset,
    materialBaseColor: layer.materialBaseColor ?? layer.color,
    materialAccentColor: layer.materialAccentColor ?? layer.accentColor,
    materialMetalness: layer.materialMetalness ?? DEFAULT_MATERIAL_CONFIG.materialMetalness,
    materialRoughness: layer.materialRoughness ?? DEFAULT_MATERIAL_CONFIG.materialRoughness,
    materialClearcoat: layer.materialClearcoat ?? DEFAULT_MATERIAL_CONFIG.materialClearcoat,
    materialRelief: layer.materialRelief ?? DEFAULT_MATERIAL_CONFIG.materialRelief,
    materialGrain: layer.materialGrain ?? DEFAULT_MATERIAL_CONFIG.materialGrain,
    materialAnisotropy: layer.materialAnisotropy ?? DEFAULT_MATERIAL_CONFIG.materialAnisotropy,
  };
}

function materialValue(value: number, fallback: number): number {
  return clamp(Number.isFinite(value) ? value : fallback, 0, 1);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextNoise(seed: { value: number }) {
  seed.value = (seed.value * 1664525 + 1013904223) >>> 0;
  return seed.value / 0xffffffff;
}

function colorMix(a: THREE.Color, b: THREE.Color, amount: number) {
  return a.clone().lerp(b, clamp(amount, 0, 1));
}

function colorStyle(color: THREE.Color, alpha = 1) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createCanvasTexture(canvas: HTMLCanvasElement, colorSpace?: THREE.ColorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function canvasMaterialTexture(canvas: HTMLCanvasElement | null | undefined, colorSpace?: THREE.ColorSpace) {
  return canvas ? createCanvasTexture(canvas, colorSpace) : undefined;
}

function drawMaterialPattern(
  ctx: CanvasRenderingContext2D,
  config: ResolvedMaterialConfig,
  seed: { value: number },
  base: THREE.Color,
  accent: THREE.Color,
) {
  const grain = materialValue(config.materialGrain, 0);
  const relief = materialValue(config.materialRelief, 0);
  const anisotropy = materialValue(config.materialAnisotropy, 0);
  const size = MATERIAL_TEXTURE_SIZE;

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, colorStyle(colorMix(base, accent, 0.14 + relief * 0.22)));
  gradient.addColorStop(0.48, colorStyle(base));
  gradient.addColorStop(1, colorStyle(colorMix(base, accent, 0.36 + grain * 0.16)));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  if (anisotropy > 0.04) {
    ctx.globalAlpha = 0.08 + anisotropy * 0.24;
    ctx.strokeStyle = colorStyle(accent);
    ctx.lineWidth = 1;
    const step = Math.max(3, Math.round(12 - anisotropy * 8));
    for (let y = -size; y < size * 2; y += step) {
      const drift = (nextNoise(seed) - 0.5) * 18;
      ctx.beginPath();
      ctx.moveTo(-16, y + drift);
      ctx.lineTo(size + 16, y + size * anisotropy * 0.18 + drift);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (config.materialPreset === 'fabric') {
    ctx.globalAlpha = 0.18 + grain * 0.18;
    ctx.strokeStyle = colorStyle(colorMix(base, accent, 0.45));
    for (let i = 0; i < size; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 18, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i + 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (grain > 0.02) {
    const speckles = Math.round(420 + grain * 900);
    for (let i = 0; i < speckles; i += 1) {
      const x = nextNoise(seed) * size;
      const y = nextNoise(seed) * size;
      const alpha = (0.025 + nextNoise(seed) * 0.12) * grain;
      const light = nextNoise(seed) > 0.5 ? accent : base;
      ctx.fillStyle = colorStyle(light, alpha);
      ctx.fillRect(x, y, 1 + nextNoise(seed) * 2, 1 + nextNoise(seed) * 2);
    }
  }
}

function drawScalarPattern(
  ctx: CanvasRenderingContext2D,
  config: ResolvedMaterialConfig,
  seed: { value: number },
  mode: 'roughness' | 'bump',
) {
  const roughness = materialValue(config.materialRoughness, DEFAULT_MATERIAL_CONFIG.materialRoughness);
  const grain = materialValue(config.materialGrain, 0);
  const relief = materialValue(config.materialRelief, 0);
  const anisotropy = materialValue(config.materialAnisotropy, 0);
  const size = MATERIAL_TEXTURE_SIZE;
  const base = mode === 'roughness' ? 40 + roughness * 180 : 112 + relief * 62;

  ctx.fillStyle = `rgb(${base}, ${base}, ${base})`;
  ctx.fillRect(0, 0, size, size);

  if (grain > 0.01 || relief > 0.01) {
    const image = ctx.getImageData(0, 0, size, size);
    for (let index = 0; index < image.data.length; index += 4) {
      const x = (index / 4) % size;
      const y = Math.floor(index / 4 / size);
      const band = Math.sin((y + x * anisotropy * 0.24) * (0.12 + anisotropy * 0.2));
      const noise = nextNoise(seed) - 0.5;
      const amount = mode === 'roughness' ? grain * 72 + anisotropy * band * 18 : relief * 90 + grain * noise * 56;
      const value = clamp(base + noise * amount + band * anisotropy * 26, 0, 255);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
}

function createMaterialTextureSet(
  layer: PrimitiveLayer,
  config: ResolvedMaterialConfig,
  materialTextures?: MaterialTextureCanvases | null,
) {
  if (typeof document === 'undefined') return {};
  const base = new THREE.Color(config.materialBaseColor);
  const accent = new THREE.Color(config.materialAccentColor);
  const seed = {
    value: hashString(`${layer.id}:${config.materialPreset}:${config.materialBaseColor}:${config.materialAccentColor}`),
  };

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = MATERIAL_TEXTURE_SIZE;
  mapCanvas.height = MATERIAL_TEXTURE_SIZE;
  drawMaterialPattern(mapCanvas.getContext('2d')!, config, seed, base, accent);

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = MATERIAL_TEXTURE_SIZE;
  roughnessCanvas.height = MATERIAL_TEXTURE_SIZE;
  drawScalarPattern(roughnessCanvas.getContext('2d')!, config, seed, 'roughness');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = MATERIAL_TEXTURE_SIZE;
  bumpCanvas.height = MATERIAL_TEXTURE_SIZE;
  drawScalarPattern(bumpCanvas.getContext('2d')!, config, seed, 'bump');

  return {
    map:
      canvasMaterialTexture(materialTextures?.albedo, THREE.SRGBColorSpace) ??
      createCanvasTexture(mapCanvas, THREE.SRGBColorSpace),
    roughnessMap: canvasMaterialTexture(materialTextures?.roughness) ?? createCanvasTexture(roughnessCanvas),
    metalnessMap: canvasMaterialTexture(materialTextures?.metalness),
    normalMap: canvasMaterialTexture(materialTextures?.normal),
    alphaMap: canvasMaterialTexture(materialTextures?.alpha),
    bumpMap: materialTextures?.normal ? undefined : createCanvasTexture(bumpCanvas),
  };
}

function createMaterialEnvironmentMap(config: ResolvedMaterialConfig) {
  if (typeof document === 'undefined') return undefined;
  const metalness = materialValue(config.materialMetalness, DEFAULT_MATERIAL_CONFIG.materialMetalness);
  const clearcoat = materialValue(config.materialClearcoat, DEFAULT_MATERIAL_CONFIG.materialClearcoat);
  if (metalness < 0.08 && clearcoat < 0.18) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = ENV_TEXTURE_WIDTH;
  canvas.height = ENV_TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const base = new THREE.Color(config.materialBaseColor);
  const accent = new THREE.Color(config.materialAccentColor);
  const sky = colorMix(accent, new THREE.Color('#ffffff'), 0.46);
  const shadow = colorMix(base, new THREE.Color('#060608'), 0.72);
  const gradient = ctx.createLinearGradient(0, 0, 0, ENV_TEXTURE_HEIGHT);
  gradient.addColorStop(0, colorStyle(sky));
  gradient.addColorStop(0.42, '#20252f');
  gradient.addColorStop(0.58, '#f4f1e5');
  gradient.addColorStop(1, colorStyle(shadow));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ENV_TEXTURE_WIDTH, ENV_TEXTURE_HEIGHT);

  ctx.globalAlpha = 0.55 + metalness * 0.28;
  for (const band of [
    { x: 18, w: 24, a: 0.9 },
    { x: 82, w: 12, a: 0.58 },
    { x: 150, w: 36, a: 0.68 },
    { x: 218, w: 16, a: 0.82 },
  ]) {
    const bandGradient = ctx.createLinearGradient(band.x, 0, band.x + band.w, 0);
    bandGradient.addColorStop(0, 'rgba(255,255,255,0)');
    bandGradient.addColorStop(0.5, `rgba(255,255,255,${band.a})`);
    bandGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bandGradient;
    ctx.fillRect(band.x, 0, band.w, ENV_TEXTURE_HEIGHT);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.artifactGeneratedMaterialEnvMap = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create a material for a primitive layer.
 * renderMode defaults to 'shaded' when omitted (used by offscreen renderer).
 */
export function createPrimitiveMaterial(
  layer: PrimitiveLayer,
  materialConfig: ResolvedMaterialConfig | undefined,
  renderMode: PrimitiveRenderMode = 'shaded',
  materialTextures?: MaterialTextureCanvases | null,
): THREE.Material {
  const config = materialConfig ?? primitiveLayerMaterialConfig(layer);
  const color = new THREE.Color(config.materialBaseColor);
  const textureSet = createMaterialTextureSet(layer, config, materialTextures);
  if (renderMode === 'unlit') {
    const params: THREE.MeshBasicMaterialParameters = {
      color: textureSet.map ? 0xffffff : color,
      map: textureSet.map,
      transparent: Boolean(textureSet.alphaMap),
      alphaTest: textureSet.alphaMap ? 0.02 : 0,
      wireframe: false,
    };
    if (textureSet.alphaMap) params.alphaMap = textureSet.alphaMap;
    return new THREE.MeshBasicMaterial(params);
  }
  const accent = new THREE.Color(config.materialAccentColor);
  const params: THREE.MeshPhysicalMaterialParameters = {
    color: textureSet.map ? 0xffffff : color,
    map: textureSet.map,
    emissive:
      renderMode === 'wireframe'
        ? accent.multiplyScalar(0.08)
        : accent.clone().multiplyScalar(materialValue(config.materialRelief, 0) * 0.08),
    metalness: materialValue(config.materialMetalness, DEFAULT_MATERIAL_CONFIG.materialMetalness),
    roughness:
      renderMode === 'wireframe'
        ? 0.9
        : materialValue(config.materialRoughness, DEFAULT_MATERIAL_CONFIG.materialRoughness),
    clearcoat: materialValue(config.materialClearcoat, DEFAULT_MATERIAL_CONFIG.materialClearcoat),
    clearcoatRoughness: Math.max(
      0.03,
      materialValue(config.materialRoughness, DEFAULT_MATERIAL_CONFIG.materialRoughness) * 0.7,
    ),
    roughnessMap: textureSet.roughnessMap,
    transparent: Boolean(textureSet.alphaMap),
    alphaTest: textureSet.alphaMap ? 0.02 : 0,
    envMap: createMaterialEnvironmentMap(config),
    envMapIntensity:
      0.24 +
      materialValue(config.materialMetalness, DEFAULT_MATERIAL_CONFIG.materialMetalness) * 1.15 +
      materialValue(config.materialClearcoat, DEFAULT_MATERIAL_CONFIG.materialClearcoat) * 0.45,
    wireframe: renderMode === 'wireframe',
    flatShading: layer.primitiveShading === 'flat',
  };
  if (textureSet.metalnessMap) params.metalnessMap = textureSet.metalnessMap;
  if (textureSet.normalMap) {
    params.normalMap = textureSet.normalMap;
    params.normalScale = new THREE.Vector2(1, 1);
  }
  if (textureSet.alphaMap) params.alphaMap = textureSet.alphaMap;
  if (textureSet.bumpMap) {
    params.bumpMap = textureSet.bumpMap;
    params.bumpScale = renderMode === 'wireframe' ? 0 : materialValue(config.materialRelief, 0) * 0.075;
  }
  return new THREE.MeshPhysicalMaterial(params);
}

// ---------------------------------------------------------------------------
// Scene lighting
// ---------------------------------------------------------------------------

/**
 * Add the shared light rig to a scene.
 * Accent-colored key and rim lights derive from accentColor.
 */
export interface PrimitiveLightRig {
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
}

export function addSceneLights(scene: THREE.Scene, accentColor: string): PrimitiveLightRig {
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

  return { keyLight, rimLight: rim };
}

export function updateSceneAccentLights(lightRig: PrimitiveLightRig, accentColor: string): void {
  const accent = new THREE.Color(accentColor);
  lightRig.keyLight.color.copy(accent);
  lightRig.rimLight.color.copy(accent);
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
    mesh.material.forEach(disposeMaterial);
  } else {
    disposeMaterial(mesh.material);
  }
}

function disposeMaterial(material: THREE.Material): void {
  const textureFields = [
    'map',
    'roughnessMap',
    'bumpMap',
    'envMap',
    'normalMap',
    'clearcoatMap',
    'clearcoatRoughnessMap',
  ] as const;
  for (const field of textureFields) {
    const texture = (material as THREE.Material & Partial<Record<(typeof textureFields)[number], THREE.Texture>>)[
      field
    ];
    texture?.dispose();
  }
  material.dispose();
}
