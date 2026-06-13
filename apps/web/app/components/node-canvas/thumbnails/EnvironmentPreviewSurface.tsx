import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import type { GraphEnvironmentNode } from '../../../types/config';
import { resolveEnvironmentSource } from '../../../utils/envAssetStore';
import { loadEquirectangularTexture } from '../../../utils/modelRenderer';

const PREVIEW_WIDTH = 512;
const PREVIEW_HEIGHT = 256;
const previewCache = new Map<string, HTMLCanvasElement>();

type PreviewStatus = 'idle' | 'loading' | 'ready' | 'failed';
type PreviewState = { key: string; status: Extract<PreviewStatus, 'ready' | 'failed'> } | null;

export function EnvironmentPreviewSurface({ environmentNode }: { environmentNode: GraphEnvironmentNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewState, setPreviewState] = useState<PreviewState>(null);
  const cacheKey = environmentPreviewKey(environmentNode);
  const status = environmentNode.environmentSrc
    ? previewState?.key === cacheKey
      ? previewState.status
      : 'loading'
    : 'idle';

  useEffect(() => {
    const target = canvasRef.current;
    if (!target) return;
    if (!environmentNode.environmentSrc) {
      clearPreviewCanvas(target);
      return;
    }

    let cancelled = false;
    const cached = previewCache.get(cacheKey);
    if (cached && drawPreviewCanvas(target, cached)) {
      queueMicrotask(() => {
        if (!cancelled) setPreviewState({ key: cacheKey, status: 'ready' });
      });
      return () => {
        cancelled = true;
      };
    }

    renderEnvironmentPreview(environmentNode.environmentSrc)
      .then((preview) => {
        if (cancelled) return;
        rememberEnvironmentPreview(cacheKey, preview);
        if (drawPreviewCanvas(target, preview)) setPreviewState({ key: cacheKey, status: 'ready' });
        else setPreviewState({ key: cacheKey, status: 'failed' });
      })
      .catch(() => {
        if (!cancelled) {
          clearPreviewCanvas(target);
          setPreviewState({ key: cacheKey, status: 'failed' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, environmentNode.environmentSrc]);

  return (
    <div className={`node-preview-surface node-environment-preview node-environment-preview-${status}`}>
      <canvas
        ref={canvasRef}
        className="node-environment-preview-canvas"
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
      />
      <div className="node-environment-preview-meta">
        <span>{environmentNode.environmentName || statusLabel(status)}</span>
        <strong>{environmentNode.environmentMime || 'EXR / HDR'}</strong>
        {environmentNode.environmentBytes > 0 && (
          <small>{Math.round(environmentNode.environmentBytes / 1024)} KB</small>
        )}
      </div>
    </div>
  );
}

function environmentPreviewKey(node: GraphEnvironmentNode) {
  return [node.environmentSrc, node.environmentMime, node.environmentBytes].join(':');
}

function statusLabel(status: PreviewStatus) {
  if (status === 'loading') return 'Loading environment';
  if (status === 'failed') return 'Preview unavailable';
  return 'No environment loaded';
}

function clearPreviewCanvas(canvas: HTMLCanvasElement) {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

function drawPreviewCanvas(target: HTMLCanvasElement, source: HTMLCanvasElement) {
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return true;
}

function rememberEnvironmentPreview(key: string, preview: HTMLCanvasElement) {
  previewCache.delete(key);
  previewCache.set(key, preview);
  while (previewCache.size > 24) {
    const oldest = previewCache.keys().next().value;
    if (!oldest) break;
    previewCache.delete(oldest);
  }
}

async function renderEnvironmentPreview(environmentSrc: string): Promise<HTMLCanvasElement> {
  const source = await resolveEnvironmentSource(environmentSrc);
  if (!source) throw new Error('Environment asset is unavailable');

  const texture = await loadEquirectangularTexture(source);
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = PREVIEW_WIDTH;
  renderCanvas.height = PREVIEW_HEIGHT;

  const renderer = new THREE.WebGLRenderer({
    canvas: renderCanvas,
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PREVIEW_WIDTH, PREVIEW_HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0, 2);
  camera.position.z = 1;
  const geometry = new THREE.PlaneGeometry(2, 1);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: true });
  scene.add(new THREE.Mesh(geometry, material));

  try {
    renderer.render(scene, camera);
    const preview = document.createElement('canvas');
    preview.width = PREVIEW_WIDTH;
    preview.height = PREVIEW_HEIGHT;
    if (!drawPreviewCanvas(preview, renderCanvas)) throw new Error('Unable to copy environment preview');
    return preview;
  } finally {
    material.dispose();
    geometry.dispose();
    texture.dispose();
    renderer.dispose();
  }
}
