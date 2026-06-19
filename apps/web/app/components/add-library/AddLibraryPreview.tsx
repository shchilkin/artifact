import { useEffect, useMemo, useState } from 'react';
import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  DEFAULT_MATERIAL_CONFIG,
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
const PREVIEW_KIND_PREFIX: Record<string, string> = {
  effect: 'effect',
  layer: 'layer',
  textPreset: 'text',
  noisePreset: 'noise',
  arrayPreset: 'array',
  repeatPreset: 'repeat',
  material: 'material',
};
const FALLBACK_KIND_BY_ACTION_KIND: Record<string, string> = {
  textPreset: 'text',
  noisePreset: 'noise',
  arrayPreset: 'array',
};
const FALLBACK_GROUP_COLORS: Partial<Record<AddLibraryItem['group'], string>> = {
  source: '#e4c96f',
  material: '#d2a063',
  utility: '#c8b7a5',
};

type PreviewDocumentResult = {
  doc: CanvasDocument | null;
  imageCache: Map<string, HTMLImageElement>;
};
type PreviewDocumentBuilder = (
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
) => Promise<PreviewDocumentResult>;
type LayerAction = Extract<AddLibraryItem['action'], { kind: 'layer' }>;
type TextPresetAction = Extract<AddLibraryItem['action'], { kind: 'textPreset' }>;
type NoisePresetAction = Extract<AddLibraryItem['action'], { kind: 'noisePreset' }>;
type ArrayPresetAction = Extract<AddLibraryItem['action'], { kind: 'arrayPreset' }>;

const PREVIEW_DOCUMENT_BUILDERS: Record<string, PreviewDocumentBuilder> = {
  layer: makeLayerPreviewDocument,
  textPreset: makeTextPresetPreviewDocument,
  aiImage: makeAiImagePreviewDocument,
  noisePreset: makeNoisePresetPreviewDocument,
  arrayPreset: makeArrayPresetPreviewDocument,
  repeat: makeRepeatPreviewDocument,
  repeatPreset: makeRepeatPreviewDocument,
  material: makeMaterialPreviewDocument,
  merge: makeUtilityPreviewDocument,
  color: makeUtilityPreviewDocument,
};

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
  const action = item.action;
  const suffix = previewKindSuffix(action);
  const prefix = PREVIEW_KIND_PREFIX[action.kind];
  return prefix && suffix ? `${prefix}-${suffix}` : action.kind;
}

function previewKindSuffix(action: AddLibraryItem['action']) {
  if ('preset' in action) return action.preset;
  if ('layerKind' in action) return action.layerKind;
  return '';
}

async function renderAddLibraryItemPreview(item: AddLibraryItem): Promise<string> {
  const cached = renderedPreviewCache.get(item.id);
  if (cached) return cached;

  const url =
    item.action.kind === 'effect' ? await renderEffectThumb(item.action.preset) : await renderPreviewDocumentUrl(item);
  if (url) renderedPreviewCache.set(item.id, url);
  return url;
}

async function renderPreviewDocumentUrl(item: AddLibraryItem): Promise<string> {
  const { doc, imageCache } = await makeAddLibraryPreviewDocument(item);
  if (!doc) return '';
  const canvas = await renderDocument(doc, PREVIEW_SIZE, PREVIEW_SIZE, imageCache, { graphMode: 'stack' });
  return canvas.toDataURL('image/png');
}

function basePreviewDocument(layers: CanvasDocument['layers'], bg = 'transparent'): CanvasDocument {
  return {
    global: { bg, seed: 241017, aspect: '1:1' },
    layers,
    export: { ...DEFAULT_EXPORT },
  };
}

function previewResult(
  layers: CanvasDocument['layers'] | null,
  imageCache: Map<string, HTMLImageElement>,
  bg = 'transparent',
) {
  return { doc: layers ? basePreviewDocument(layers, bg) : null, imageCache };
}

async function makeAddLibraryPreviewDocument(item: AddLibraryItem): Promise<PreviewDocumentResult> {
  const imageCache = new Map<string, HTMLImageElement>();
  return (PREVIEW_DOCUMENT_BUILDERS[item.action.kind] ?? makeEmptyPreviewDocument)(item, imageCache);
}

async function makeLayerPreviewDocument(
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  const layerKind = (item.action as LayerAction).layerKind;
  if (layerKind === 'image') imageCache.set(SAMPLE_IMAGE_SRC, await loadPreviewImage(SAMPLE_IMAGE_SRC));
  return previewResult(makeLayerPreviewLayers(layerKind), imageCache);
}

async function makeTextPresetPreviewDocument(
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  const { preset } = item.action as TextPresetAction;
  return previewResult(
    [
      makeFillLayer({ id: 'add-preview-text-bg', color: '#240905' }),
      makeTextPresetLayer(preset, { id: `add-preview-text-${preset}` }),
    ],
    imageCache,
  );
}

async function makeAiImagePreviewDocument(
  _item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  const image = await loadPreviewImage(SAMPLE_IMAGE_SRC);
  imageCache.set(SAMPLE_IMAGE_SRC, image);
  return previewResult(
    [
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
    ],
    imageCache,
  );
}

async function makeNoisePresetPreviewDocument(
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  return previewResult([makeNoisePresetLayer((item.action as NoisePresetAction).preset)], imageCache);
}

async function makeArrayPresetPreviewDocument(
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  return previewResult([makeArrayPresetLayer((item.action as ArrayPresetAction).preset)], imageCache);
}

async function makeMaterialPreviewDocument(
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  return previewResult(
    [
      makeSourceLayer('primitive', {
        id: 'add-preview-material',
        name: item.label,
        primitiveShape: 'sphere',
        primitiveDepth: 48,
        tiltX: -18,
        tiltY: 24,
        tiltZ: -8,
        scaleX: 0.86,
        scaleY: 0.86,
        ...DEFAULT_MATERIAL_CONFIG,
      }),
    ],
    imageCache,
  );
}

async function makeRepeatPreviewDocument(
  _item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  return previewResult(
    [
      makeEmojiLayer({
        id: 'add-preview-repeat-emoji',
        emojis: ['✦'],
        density: 46,
        minSz: 20,
        maxSz: 26,
      }),
    ],
    imageCache,
  );
}

async function makeUtilityPreviewDocument(
  item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  return previewResult(
    [
      makeFillLayer({ id: 'add-preview-utility-bg', color: '#12051a' }),
      makeEmojiLayer({
        id: 'add-preview-utility-emoji',
        emojis: item.action.kind === 'merge' ? ['✦', '◯'] : ['◐', '✦'],
        density: 20,
        minSz: 26,
        maxSz: 62,
      }),
    ],
    imageCache,
  );
}

async function makeEmptyPreviewDocument(
  _item: AddLibraryItem,
  imageCache: Map<string, HTMLImageElement>,
): Promise<PreviewDocumentResult> {
  return previewResult(null, imageCache);
}

function makeLayerPreviewLayers(layerKind: string): CanvasDocument['layers'] {
  const builders: Record<string, () => CanvasDocument['layers']> = {
    fill: () => [makeFillLayer({ id: 'add-preview-fill', color: '#e6c3a4' })],
    text: () => [
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
    ],
    image: () => [makeImageLayer(SAMPLE_IMAGE_SRC, { id: 'add-preview-image', fit: 'cover' })],
    emoji: () => [
      makeEmojiLayer({
        id: 'add-preview-emoji',
        emojis: ['💔', '✦', '💀', '🔥'],
        density: 34,
        minSz: 28,
        maxSz: 70,
        blur: 0,
      }),
    ],
  };
  return builders[layerKind]?.() ?? [makeSourceLayer(layerKind, { id: `add-preview-${layerKind}` })];
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

  drawFallbackPreviewBase(ctx);
  const groupColor = fallbackColorForGroup(item.group);
  ctx.fillStyle = groupColor;
  ctx.strokeStyle = groupColor;

  drawFallbackByKind(ctx, item, groupColor);

  renderedPreviewCache.set(item.id, canvas.toDataURL('image/png'));
  return renderedPreviewCache.get(item.id) ?? '';
}

function drawFallbackPreviewBase(ctx: CanvasRenderingContext2D) {
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
}

function drawFallbackByKind(ctx: CanvasRenderingContext2D, item: AddLibraryItem, groupColor: string) {
  const kind = fallbackKindForItem(item);
  const drawers: Record<string, () => void> = {
    fill: () => drawFillFallback(ctx),
    text: () =>
      drawCenteredFallbackText(
        ctx,
        item.action.kind === 'textPreset' ? item.label.slice(0, 2).toUpperCase() : 'TYPE',
        42,
      ),
    image: () => drawImageFrameFallback(ctx),
    aiImage: () => {
      drawImageLikeFallback(ctx);
      ctx.fillStyle = '#f5ead8';
      drawCenteredFallbackText(ctx, 'AI', 56);
    },
    noise: () => drawNoiseFallback(ctx, groupColor),
    array: () => drawArrayFallback(ctx, groupColor),
    material: () => drawMaterialFallback(ctx, item, groupColor),
  };
  (drawers[kind] ?? (() => drawFallbackGlyph(ctx, item)))();
}

function fallbackKindForItem(item: AddLibraryItem) {
  if (item.action.kind === 'layer') return item.action.layerKind;
  return FALLBACK_KIND_BY_ACTION_KIND[item.action.kind] ?? item.action.kind;
}

function drawFillFallback(ctx: CanvasRenderingContext2D) {
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#f5ead8';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, PREVIEW_SIZE - 60, PREVIEW_SIZE - 60);
}

function drawImageFrameFallback(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 8;
  ctx.strokeRect(52, 48, 96, 104);
  ctx.beginPath();
  ctx.moveTo(58, 136);
  ctx.lineTo(92, 94);
  ctx.lineTo(116, 122);
  ctx.lineTo(144, 80);
  ctx.stroke();
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

function drawMaterialFallback(ctx: CanvasRenderingContext2D, item: AddLibraryItem, color: string) {
  const cx = PREVIEW_SIZE / 2;
  const cy = PREVIEW_SIZE / 2;
  const radius = 58;
  const gradient = ctx.createRadialGradient(cx - 22, cy - 24, 8, cx, cy, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.28, color);
  gradient.addColorStop(1, '#2b1711');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.ellipse(cx + i * 9 - 12, cy - 4, radius - i * 8, 12 + i * 2, -0.45, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCenteredFallbackText(ctx, item.label.slice(0, 1).toUpperCase(), 42);
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
  return FALLBACK_GROUP_COLORS[group] ?? '#ff6a5f';
}
