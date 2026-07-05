import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeGraphMaterialNode, makeSourceLayer } from '../types/config';
import { primitiveRendererTestInternals, renderPrimitiveToCanvas } from './primitiveRenderer';
import { createPrimitiveMaterial } from './primitiveScene';
import { measureAlphaBounds } from './render/alphaBounds';

function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8 && Math.max(data[i], data[i + 1], data[i + 2]) > 16) return true;
  }
  return false;
}

function visibleBounds(canvas: HTMLCanvasElement): { width: number; height: number } | null {
  return measureAlphaBounds(canvas);
}

describe('renderPrimitiveToCanvas', () => {
  it('returns visible fallback pixels when WebGL is unavailable', async () => {
    const canvas = await renderPrimitiveToCanvas(makeSourceLayer('primitive'), 64);

    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('can bypass WebGL for draft preview fallback rendering', async () => {
    const canvas = await renderPrimitiveToCanvas(
      makeSourceLayer('primitive', { primitiveShape: 'cube' }),
      64,
      undefined,
      {
        forceFallback: true,
      },
    );

    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('supports rectangular primitive render targets for aspect-aware previews', async () => {
    const canvas = await renderPrimitiveToCanvas(
      makeSourceLayer('primitive', { primitiveShape: 'sphere' }),
      { width: 96, height: 54 },
      undefined,
      { forceFallback: true },
    );

    expect(canvas.width).toBe(96);
    expect(canvas.height).toBe(54);
    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('keeps the offscreen WebGL render clamp aspect-aware for large exports', () => {
    expect(primitiveRendererTestInternals.fitPrimitiveRenderSize(1920, 1080)).toEqual({
      width: 1024,
      height: 576,
    });
    expect(primitiveRendererTestInternals.fitPrimitiveRenderSize(1080, 1920)).toEqual({
      width: 576,
      height: 1024,
    });
  });

  it('detects tiny off-grid primitive content so low zoom does not trigger fallback rendering', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 48, 32, 1)';
    ctx.fillRect(123, 117, 3, 3);

    const bounds = visibleBounds(canvas);

    expect(bounds).not.toBeNull();
    expect(bounds?.width).toBe(3);
    expect(bounds?.height).toBe(3);
    expect(primitiveRendererTestInternals.canvasHasPrimitiveContent(canvas)).toBe(true);
  });

  it('applies connected PBR texture canvases to every primitive material map slot', () => {
    const makeTextureCanvas = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      canvas.getContext('2d')!.fillRect(0, 0, 8, 8);
      return canvas;
    };
    const albedo = makeTextureCanvas();
    const roughness = makeTextureCanvas();
    const metalness = makeTextureCanvas();
    const normal = makeTextureCanvas();
    const alpha = makeTextureCanvas();

    const material = createPrimitiveMaterial(makeSourceLayer('primitive'), makeGraphMaterialNode(), 'shaded', {
      albedo,
      roughness,
      metalness,
      normal,
      alpha,
    }) as THREE.MeshPhysicalMaterial;

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.map?.image).toBe(albedo);
    expect(material.roughnessMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.roughnessMap?.image).toBe(roughness);
    expect(material.metalnessMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.metalnessMap?.image).toBe(metalness);
    expect(material.normalMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.normalMap?.image).toBe(normal);
    expect(material.alphaMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.alphaMap?.image).toBe(alpha);
    expect(material.transparent).toBe(true);
    expect(material.bumpMap).toBeNull();
    material.dispose();
  });
});
