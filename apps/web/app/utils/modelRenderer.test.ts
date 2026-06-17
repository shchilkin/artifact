import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeGraphScene3DNode, makeSourceLayer } from '../types/config';
import { addModelSceneLights, modelRendererTestInternals, renderModelToCanvas } from './modelRenderer';

function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8 && Math.max(data[i], data[i + 1], data[i + 2]) > 16) return true;
  }
  return false;
}

describe('renderModelToCanvas', () => {
  it('returns visible fallback pixels when draft rendering bypasses GLB parsing', async () => {
    const canvas = await renderModelToCanvas(
      makeSourceLayer('model', {
        modelName: 'skull.glb',
        modelSrc: 'artifact-model://missing',
      }),
      { width: 96, height: 54 },
      undefined,
      { forceFallback: true },
    );

    expect(canvas.width).toBe(96);
    expect(canvas.height).toBe(54);
    expect(hasVisiblePixels(canvas)).toBe(true);
    expect(modelRendererTestInternals.canvasHasModelContent(canvas)).toBe(true);
  });

  it('decodes base64 model data URLs to array buffers', () => {
    const buffer = modelRendererTestInternals.dataUrlToArrayBuffer('data:model/gltf-binary;base64,AQIDBA==');

    expect(Array.from(new Uint8Array(buffer ?? new ArrayBuffer(0)))).toEqual([1, 2, 3, 4]);
  });

  it('uses HDR texture color as environment light when strength is enabled', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.DataTexture(
      new Float32Array([4, 0.1, 0.05, 1, 3, 0.1, 0.05, 1, 2, 0.1, 0.05, 1, 4, 0.1, 0.05, 1]),
      2,
      2,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    const layer = makeSourceLayer('model', { color: '#d7a66a', accentColor: '#ff6b48' });

    addModelSceneLights(scene, layer, makeGraphScene3DNode({ environmentStrength: 150 }), texture);

    const environmentLight = scene.children.find(
      (child): child is THREE.HemisphereLight => child instanceof THREE.HemisphereLight,
    );
    expect(environmentLight).toBeDefined();
    expect(environmentLight?.color.r).toBeGreaterThan(environmentLight?.color.g ?? 1);
    expect(environmentLight?.intensity).toBeGreaterThan(1);
  });
});
