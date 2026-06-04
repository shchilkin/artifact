import { useEffect, useMemo, useState } from 'react';
import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../../types/config';
import { makeArrayPresetLayer } from '../../utils/arrayPresets';
import { renderEffectThumb } from '../../utils/effectInfo';
import { makeNoisePresetLayer } from '../../utils/noisePresets';
import { renderDocument } from '../../utils/renderer';
import { makeTextPresetLayer } from '../../utils/textPresets';
import { PreviewFrame } from '../ui/PreviewFrame';
import type { AddLibraryItem } from './addLibraryModel';

const PREVIEW_SIZE = 200;
const SAMPLE_IMAGE_SRC = '/girl_image_landing.png';
const renderedPreviewCache = new Map<string, string>();
const imageElementCache = new Map<string, Promise<HTMLImageElement>>();

export function AddLibraryPreview({ item }: { item: AddLibraryItem }) {
  const [thumb, setThumb] = useState<{ itemId: string; url: string } | null>(null);
  const previewKind = useMemo(() => previewKindForItem(item), [item]);
  const thumbUrl = thumb?.itemId === item.id ? thumb.url : null;

  useEffect(() => {
    let cancelled = false;
    renderAddLibraryItemPreview(item)
      .catch(() => renderFallbackPreviewDataUrl(item))
      .then((url) => {
        if (!cancelled && url) setThumb({ itemId: item.id, url });
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <PreviewFrame className="add-library-preview-frame" data-preview-kind={previewKind} data-preview-group={item.group}>
      <div className="add-library-rendered-preview">
        {thumbUrl ? (
          <img src={thumbUrl} alt={`${item.label} preview`} draggable={false} />
        ) : (
          <div className="add-library-effect-preview-loading" aria-hidden="true" />
        )}
      </div>
    </PreviewFrame>
  );
}

function previewKindForItem(item: AddLibraryItem) {
  if (item.action.kind === 'effect') return `effect-${item.action.preset}`;
  if (item.action.kind === 'layer') return `layer-${item.action.layerKind}`;
  if (item.action.kind === 'textPreset') return `text-${item.action.preset}`;
  if (item.action.kind === 'noisePreset') return `noise-${item.action.preset}`;
  if (item.action.kind === 'arrayPreset') return `array-${item.action.preset}`;
  if (item.action.kind === 'repeatPreset') return `repeat-${item.action.preset}`;
  return item.action.kind;
}

async function renderAddLibraryItemPreview(item: AddLibraryItem): Promise<string> {
  const cached = renderedPreviewCache.get(item.id);
  if (cached) return cached;

  let url = '';
  if (item.action.kind === 'effect') {
    url = await renderEffectThumb(item.action.preset);
  } else {
    const { doc, imageCache } = await makeAddLibraryPreviewDocument(item);
    if (doc) {
      const canvas = await renderDocument(doc, PREVIEW_SIZE, PREVIEW_SIZE, imageCache, { graphMode: 'stack' });
      url = canvas.toDataURL('image/png');
    }
  }

  if (url) renderedPreviewCache.set(item.id, url);
  return url;
}

async function makeAddLibraryPreviewDocument(
  item: AddLibraryItem,
): Promise<{ doc: CanvasDocument | null; imageCache: Map<string, HTMLImageElement> }> {
  const imageCache = new Map<string, HTMLImageElement>();
  const baseDoc = (layers: CanvasDocument['layers'], bg = 'transparent'): CanvasDocument => ({
    global: { bg, seed: 241017, aspect: '1:1' },
    layers,
    export: { ...DEFAULT_EXPORT },
  });

  if (item.action.kind === 'layer') {
    if (item.action.layerKind === 'fill') {
      return {
        doc: baseDoc([makeFillLayer({ id: 'add-preview-fill', color: '#e6c3a4' })]),
        imageCache,
      };
    }
    if (item.action.layerKind === 'text') {
      return {
        doc: baseDoc([
          makeTextLayer({
            id: 'add-preview-text',
            content: 'TEXT',
            font: 'DISPLAY',
            size: 128,
            color: '#f5ead8',
            x: 0.5,
            y: 0.54,
            rotation: -4,
            scaleX: 1.08,
            scaleY: 0.94,
          }),
        ]),
        imageCache,
      };
    }
    if (item.action.layerKind === 'image') {
      const image = await loadPreviewImage(SAMPLE_IMAGE_SRC);
      imageCache.set(SAMPLE_IMAGE_SRC, image);
      return {
        doc: baseDoc([makeImageLayer(SAMPLE_IMAGE_SRC, { id: 'add-preview-image', fit: 'cover' })]),
        imageCache,
      };
    }
    if (item.action.layerKind === 'emoji') {
      return {
        doc: baseDoc([
          makeEmojiLayer({
            id: 'add-preview-emoji',
            emojis: ['💔', '✦', '💀', '🔥'],
            density: 34,
            minSz: 28,
            maxSz: 70,
            blur: 0,
          }),
        ]),
        imageCache,
      };
    }
    return {
      doc: baseDoc([makeSourceLayer(item.action.layerKind, { id: `add-preview-${item.action.layerKind}` })]),
      imageCache,
    };
  }

  if (item.action.kind === 'textPreset') {
    return {
      doc: baseDoc([
        makeFillLayer({ id: 'add-preview-text-bg', color: '#240905' }),
        makeTextPresetLayer(item.action.preset, { id: `add-preview-text-${item.action.preset}` }),
      ]),
      imageCache,
    };
  }

  if (item.action.kind === 'aiImage') {
    const image = await loadPreviewImage(SAMPLE_IMAGE_SRC);
    imageCache.set(SAMPLE_IMAGE_SRC, image);
    return {
      doc: baseDoc([
        makeImageLayer(SAMPLE_IMAGE_SRC, {
          id: 'add-preview-ai-image',
          fit: 'cover',
          opacity: 86,
        }),
        makeTextLayer({
          id: 'add-preview-ai-label',
          content: 'AI',
          font: 'DISPLAY',
          size: 96,
          color: '#f5ead8',
          x: 0.54,
          y: 0.55,
          rotation: -3,
        }),
      ]),
      imageCache,
    };
  }

  if (item.action.kind === 'noisePreset') {
    return { doc: baseDoc([makeNoisePresetLayer(item.action.preset)]), imageCache };
  }

  if (item.action.kind === 'arrayPreset') {
    return { doc: baseDoc([makeArrayPresetLayer(item.action.preset)]), imageCache };
  }

  if (item.action.kind === 'repeat' || item.action.kind === 'repeatPreset') {
    return {
      doc: baseDoc([
        makeEmojiLayer({
          id: 'add-preview-repeat-emoji',
          emojis: ['✦'],
          density: 46,
          minSz: 20,
          maxSz: 26,
        }),
      ]),
      imageCache,
    };
  }

  if (item.action.kind === 'merge' || item.action.kind === 'color') {
    return {
      doc: baseDoc([
        makeFillLayer({ id: 'add-preview-utility-bg', color: '#12051a' }),
        makeEmojiLayer({
          id: 'add-preview-utility-emoji',
          emojis: item.action.kind === 'merge' ? ['✦', '◯'] : ['◐', '✦'],
          density: 20,
          minSz: 26,
          maxSz: 62,
        }),
      ]),
      imageCache,
    };
  }

  return { doc: null, imageCache };
}

function loadPreviewImage(src: string): Promise<HTMLImageElement> {
  const cached = imageElementCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load preview image: ${src}`));
    image.src = src;
  });
  imageElementCache.set(src, promise);
  return promise;
}

function renderFallbackPreviewDataUrl(item: AddLibraryItem) {
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#170704';
  ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

  ctx.fillStyle = '#21100c';
  for (let y = 0; y < PREVIEW_SIZE; y += 16) {
    for (let x = (y / 16) % 2 === 0 ? 0 : 16; x < PREVIEW_SIZE; x += 32) {
      ctx.fillRect(x, y, 16, 16);
    }
  }

  ctx.strokeStyle = '#ff6a5f';
  ctx.globalAlpha = 0.36;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, PREVIEW_SIZE - 36, PREVIEW_SIZE - 36);
  ctx.globalAlpha = 1;

  const groupColor = fallbackColorForGroup(item.group);
  ctx.fillStyle = groupColor;
  ctx.strokeStyle = groupColor;

  if (item.action.kind === 'layer' && item.action.layerKind === 'fill') {
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#f5ead8';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, PREVIEW_SIZE - 60, PREVIEW_SIZE - 60);
  } else if ((item.action.kind === 'layer' && item.action.layerKind === 'text') || item.action.kind === 'textPreset') {
    drawCenteredFallbackText(
      ctx,
      item.action.kind === 'textPreset' ? item.label.slice(0, 2).toUpperCase() : 'TYPE',
      42,
    );
  } else if (item.action.kind === 'layer' && item.action.layerKind === 'image') {
    ctx.lineWidth = 8;
    ctx.strokeRect(52, 48, 96, 104);
    ctx.beginPath();
    ctx.moveTo(58, 136);
    ctx.lineTo(92, 94);
    ctx.lineTo(116, 122);
    ctx.lineTo(144, 80);
    ctx.stroke();
  } else if (item.action.kind === 'aiImage') {
    drawImageLikeFallback(ctx);
    ctx.fillStyle = '#f5ead8';
    drawCenteredFallbackText(ctx, 'AI', 56);
  } else if (
    item.action.kind === 'noisePreset' ||
    (item.action.kind === 'layer' && item.action.layerKind === 'noise')
  ) {
    drawNoiseFallback(ctx, groupColor);
  } else if (
    item.action.kind === 'arrayPreset' ||
    (item.action.kind === 'layer' && item.action.layerKind === 'array')
  ) {
    drawArrayFallback(ctx, groupColor);
  } else {
    drawFallbackGlyph(ctx, item);
  }

  renderedPreviewCache.set(item.id, canvas.toDataURL('image/png'));
  return renderedPreviewCache.get(item.id) ?? '';
}

function drawCenteredFallbackText(ctx: CanvasRenderingContext2D, text: string, size: number) {
  ctx.font = `700 ${size}px ui-monospace, Consolas, "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, PREVIEW_SIZE / 2, PREVIEW_SIZE / 2 + 4);
}

function drawImageLikeFallback(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(36, 34, 164, 166);
  gradient.addColorStop(0, '#25100d');
  gradient.addColorStop(0.45, '#7f382b');
  gradient.addColorStop(1, '#160617');
  ctx.fillStyle = gradient;
  ctx.fillRect(34, 34, 132, 132);
  ctx.strokeStyle = '#f5b38c';
  ctx.globalAlpha = 0.64;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(78, 82, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 152);
  ctx.lineTo(82, 106);
  ctx.lineTo(118, 136);
  ctx.lineTo(160, 76);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawNoiseFallback(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = '#120806';
  ctx.fillRect(32, 32, 136, 136);
  let seed = 9173;
  for (let i = 0; i < 260; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = 34 + (seed % 132);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = 34 + (seed % 132);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const size = 1 + (seed % 5);
    ctx.globalAlpha = 0.18 + ((seed >>> 4) % 70) / 100;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawArrayFallback(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = '#120806';
  ctx.fillRect(30, 30, 140, 140);
  ctx.fillStyle = color;
  for (let y = 48; y <= 150; y += 26) {
    for (let x = 48; x <= 150; x += 26) {
      const offset = (x + y) % 52 === 0 ? 5 : -3;
      ctx.globalAlpha = 0.52 + ((x + y) % 5) * 0.08;
      ctx.beginPath();
      ctx.arc(x + offset, y - offset, 7 + ((x + y) % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFallbackGlyph(ctx: CanvasRenderingContext2D, item: AddLibraryItem) {
  if (item.action.kind === 'effect') {
    for (let i = 0; i < 12; i += 1) {
      const radius = 18 + i * 6;
      ctx.globalAlpha = 0.1 + i * 0.035;
      ctx.beginPath();
      ctx.arc(PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawCenteredFallbackText(ctx, item.label.slice(0, 2).toUpperCase(), 42);
    return;
  }

  ctx.globalAlpha = 0.76;
  ctx.beginPath();
  ctx.arc(78, 82, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.42;
  ctx.fillRect(94, 92, 62, 52);
  ctx.globalAlpha = 1;
  drawCenteredFallbackText(ctx, item.label.slice(0, 1).toUpperCase(), 64);
}

function fallbackColorForGroup(group: AddLibraryItem['group']) {
  if (group === 'source') return '#e4c96f';
  if (group === 'utility') return '#c8b7a5';
  return '#ff6a5f';
}
