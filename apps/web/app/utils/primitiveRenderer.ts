import * as THREE from 'three';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { PrimitiveLayer } from '../types/config';
import {
  addSceneLights,
  applyMeshTransform,
  applyViewStateToCamera,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  createPrimitiveCamera,
  createPrimitiveGeometry,
  createPrimitiveMaterial,
  degToRad,
  disposeMesh,
  primitiveLayerMaterialConfig,
  type ResolvedMaterialConfig,
} from './primitiveScene';

const SOURCE_OVERSCAN = 1.22;

interface PrimitiveRenderOptions {
  forceFallback?: boolean;
}

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

function canvasHasPrimitiveContent(canvas: HTMLCanvasElement): boolean {
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

export const primitiveRendererTestInternals = {
  canvasHasPrimitiveContent,
};

function drawFallbackPrimitive(
  canvas: HTMLCanvasElement,
  layer: PrimitiveLayer,
  materialConfig?: ResolvedMaterialConfig,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const material = materialConfig ?? primitiveLayerMaterialConfig(layer);
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size * 0.34;
  ctx.clearRect(0, 0, width, height);

  if (layer.primitiveShape === 'cube') {
    const r = radius;
    const top = [
      [cx - r * 0.82, cy - r * 0.32],
      [cx + r * 0.02, cy - r * 0.68],
      [cx + r * 0.88, cy - r * 0.42],
      [cx + r * 0.04, cy - r * 0.04],
    ];
    const left = [top[0], top[3], [cx + r * 0.04, cy + r * 0.88], [cx - r * 0.76, cy + r * 0.48]];
    const right = [top[3], top[2], [cx + r * 0.8, cy + r * 0.42], [cx + r * 0.04, cy + r * 0.88]];
    const drawPoly = (points: number[][], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
    };
    drawPoly(top, rgba(material.materialAccentColor, 0.84));
    drawPoly(left, rgba(material.materialBaseColor, 0.78));
    drawPoly(right, rgba(material.materialBaseColor, 0.62));
    return;
  }

  if (layer.primitiveShape === 'cylinder') {
    const r = radius;
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, rgba(material.materialBaseColor, 0.6));
    grad.addColorStop(0.5, rgba(material.materialBaseColor, 0.95));
    grad.addColorStop(1, rgba(material.materialAccentColor, 0.65));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r * 0.58, r * 2, r * 1.18);
    ctx.fillStyle = rgba(material.materialAccentColor, 0.85);
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.58, r, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(material.materialBaseColor, 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.6, r, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const grad = ctx.createRadialGradient(cx - radius * 0.36, cy - radius * 0.42, radius * 0.08, cx, cy, radius);
  grad.addColorStop(0, rgba(material.materialAccentColor, 0.95));
  grad.addColorStop(0.42, rgba(material.materialBaseColor, 0.86));
  grad.addColorStop(1, rgba(material.materialBaseColor, 0.36));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Render a primitive layer to an offscreen HTMLCanvasElement using Three.js WebGL.
 * The source renderer keeps a bit of overscan so tilted or deeper primitives
 * don't clip against the layer canvas when composited into the document.
 */
export async function renderPrimitiveToCanvas(
  layer: PrimitiveLayer,
  size: number | { width: number; height: number },
  viewState?: PrimitiveViewportState,
  options: PrimitiveRenderOptions = {},
  materialConfig?: ResolvedMaterialConfig,
): Promise<HTMLCanvasElement> {
  const targetWidth = typeof size === 'number' ? size : size.width;
  const targetHeight = typeof size === 'number' ? size : size.height;
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.max(1, Math.round(targetWidth));
  offscreen.height = Math.max(1, Math.round(targetHeight));
  if (options.forceFallback) {
    drawFallbackPrimitive(offscreen, layer, materialConfig);
    return offscreen;
  }

  const effectiveViewState: PrimitiveViewportState = viewState ?? {
    rotationX: layer.tiltX,
    rotationY: layer.tiltY,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  const renderWidth = viewState
    ? offscreen.width
    : Math.max(offscreen.width, Math.round(offscreen.width * SOURCE_OVERSCAN));
  const renderHeight = viewState
    ? offscreen.height
    : Math.max(offscreen.height, Math.round(offscreen.height * SOURCE_OVERSCAN));
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = renderWidth;
  renderCanvas.height = renderHeight;

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
    drawFallbackPrimitive(offscreen, layer, materialConfig);
    return offscreen;
  }

  let renderer: THREE.WebGLRenderer | null = null;
  let mesh: THREE.Mesh | null = null;

  try {
    renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, context, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(renderWidth, renderHeight, false);

    const scene = new THREE.Scene();

    const camera = createPrimitiveCamera(renderWidth / renderHeight);
    applyViewStateToCamera(camera, {
      ...effectiveViewState,
      zoom: Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, effectiveViewState.zoom)),
    });

    addSceneLights(scene, layer.accentColor);

    const geometry = createPrimitiveGeometry(layer);
    // Export always uses 'shaded' mode — renderMode is a live viewport concept.
    const material = createPrimitiveMaterial(layer, materialConfig, 'shaded');
    mesh = new THREE.Mesh(geometry, material);
    applyMeshTransform(mesh, effectiveViewState, layer.tiltZ);
    scene.add(mesh);

    renderer.render(scene, camera);

    const outCtx = offscreen.getContext('2d');
    if (outCtx) {
      outCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      outCtx.drawImage(renderCanvas, 0, 0, renderWidth, renderHeight, 0, 0, offscreen.width, offscreen.height);
    }
  } catch {
    drawFallbackPrimitive(offscreen, layer, materialConfig);
  } finally {
    if (mesh) disposeMesh(mesh);
    if (renderer) {
      renderer.dispose();
    }
    renderCanvas.width = 0;
    renderCanvas.height = 0;
  }

  if (!canvasHasPrimitiveContent(offscreen)) drawFallbackPrimitive(offscreen, layer, materialConfig);

  return offscreen;
}

// Re-export so callers that used to import degToRad from here continue to work.
// fallow-ignore-next-line unused-export
export { degToRad };
