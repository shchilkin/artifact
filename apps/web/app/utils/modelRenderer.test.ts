import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeGraphMaterialNode, makeGraphScene3DNode, makeSourceLayer } from '../types/config';
import {
  addModelSceneLights,
  applySceneEnvironmentIntensity,
  applySceneMaterialConfig,
  applySceneMaterialMode,
  disposeObject3D,
  loadScene3DSourceObject,
  modelRendererTestInternals,
  normalizeModelRoot,
  renderModelToCanvas,
} from './modelRenderer';

function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8 && Math.max(data[i], data[i + 1], data[i + 2]) > 16) return true;
  }
  return false;
}

describe('renderModelToCanvas', () => {
  it('applies scene material settings to GLTF mesh-like objects', async () => {
    const root = new THREE.Group();
    const foreignMesh = new THREE.Object3D() as THREE.Object3D & {
      geometry: THREE.BufferGeometry;
      isMesh: true;
      material: THREE.Material;
    };
    foreignMesh.geometry = new THREE.BufferGeometry();
    foreignMesh.isMesh = true;
    foreignMesh.material = new THREE.MeshBasicMaterial({ color: '#221100' });
    root.add(foreignMesh);

    expect(foreignMesh instanceof THREE.Mesh).toBe(false);

    applySceneMaterialMode(
      root,
      makeSourceLayer('model', { color: '#f1d2a4' }),
      makeGraphScene3DNode({ materialMode: 'clay' }),
    );
    expect(foreignMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);

    await applySceneMaterialConfig(root, makeGraphMaterialNode({ materialPreset: 'goldFoil' }));
    expect(foreignMesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('applies connected PBR material texture canvases to scene materials', async () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(mesh);
    const albedo = document.createElement('canvas');
    albedo.width = 8;
    albedo.height = 8;
    albedo.getContext('2d')!.fillRect(0, 0, 8, 8);
    const normal = document.createElement('canvas');
    normal.width = 8;
    normal.height = 8;
    normal.getContext('2d')!.fillRect(0, 0, 8, 8);

    await applySceneMaterialConfig(root, makeGraphMaterialNode({ materialPreset: 'chrome' }), {
      albedo,
      normal,
    });

    expect(mesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.map?.image).toBe(albedo);
    expect(material.normalMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.normalMap?.image).toBe(normal);
    expect(material.bumpMap).toBeNull();
    disposeObject3D(root);
  });

  it('creates primitive scene sources that accept PBR material nodes', async () => {
    const root = await loadScene3DSourceObject(
      makeSourceLayer('primitive', { primitiveShape: 'sphere' }),
      makeGraphScene3DNode({ materialMode: 'original' }),
      makeGraphMaterialNode({ materialPreset: 'chrome' }),
    );
    let material: THREE.Material | null = null;
    root.traverse((object) => {
      if ((object as THREE.Mesh & { isMesh?: boolean }).isMesh === true) material = (object as THREE.Mesh).material;
    });

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    disposeObject3D(root);
  });

  it('lets connected PBR material nodes override scene material modes', async () => {
    const root = await loadScene3DSourceObject(
      makeSourceLayer('primitive', { primitiveShape: 'sphere' }),
      makeGraphScene3DNode({ materialMode: 'unlit' }),
      makeGraphMaterialNode({ materialPreset: 'chrome' }),
    );
    let material: THREE.Material | null = null;
    root.traverse((object) => {
      if ((object as THREE.Mesh & { isMesh?: boolean }).isMesh === true) material = (object as THREE.Mesh).material;
    });

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material).not.toBeInstanceOf(THREE.MeshBasicMaterial);
    disposeObject3D(root);
  });

  it('lets connected scene environments override generated material environment maps', async () => {
    const root = await loadScene3DSourceObject(
      makeSourceLayer('primitive', { primitiveShape: 'sphere' }),
      makeGraphScene3DNode({ materialMode: 'original' }),
      makeGraphMaterialNode({ materialPreset: 'chrome' }),
    );
    let material: THREE.MeshPhysicalMaterial | null = null;
    root.traverse((object) => {
      if ((object as THREE.Mesh & { isMesh?: boolean }).isMesh === true) {
        const nextMaterial = (object as THREE.Mesh).material;
        if (nextMaterial instanceof THREE.MeshPhysicalMaterial) material = nextMaterial;
      }
    });

    expect(material?.envMap).toBeInstanceOf(THREE.Texture);
    const baseIntensity = material?.envMapIntensity ?? 0;

    applySceneEnvironmentIntensity(root, makeGraphScene3DNode({ environmentStrength: 150 }), true);

    expect(material?.envMap).toBeNull();
    expect(material?.envMapIntensity).toBeCloseTo(baseIntensity * 1.5);
    disposeObject3D(root);
  });

  it('fits elongated model roots by bounding radius so auto-spin stays framed', () => {
    const root = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), new THREE.MeshBasicMaterial());

    const group = normalizeModelRoot(root);
    const radius = group ? new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere()).radius : 0;

    expect(group).toBeInstanceOf(THREE.Group);
    expect(radius).toBeLessThanOrEqual(0.93);
    disposeObject3D(group ?? root);
  });

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
