import { createHash } from 'node:crypto';
import { createCanvas, GlobalFonts, SvgExportFlag } from '@napi-rs/canvas';
import { drawTextLayer } from '../packages/runtime/src/rendering.ts';

// An explicit, offline derivative for this square-cover experiment. This is
// not an editor migration or a runtime fallback for unsupported typography.
export async function measureOutlineBaselines(page, source) {
  return page.evaluate(async (source) => {
    const offsets = {};
    const faces = [];
    try {
      for (const layer of source.document.layers.filter((layer) => layer.kind === 'text')) {
        const asset = source.document.fontAssets?.find((entry) => `artifact-font://${entry.id}` === layer.font);
        if (!asset?.dataUrl?.match(/^data:[^,]+;base64,/)) throw new Error(`Missing embedded font for ${layer.id}.`);
        const family = `OutlineMeasure${faces.length}`;
        const face = new FontFace(family, `url(${asset.dataUrl})`);
        faces.push(face);
        await face.load();
        document.fonts.add(face);
        const context = document.createElement('canvas').getContext('2d');
        context.font = `${layer.size ?? 64}px ${family}`;
        context.textBaseline = 'middle';
        offsets[layer.id] = -context.measureText(layer.content || 'M').alphabeticBaseline;
      }
      return offsets;
    } finally {
      for (const face of faces) document.fonts.delete(face);
    }
  }, source);
}

export function outlineRuntimeText(source, baselineOffsets = {}) {
  const result = structuredClone(source);
  const document = result.document;
  if (!document || document.global.aspect !== '1:1') throw new Error('Outline export requires a square Composition.');
  const textLayers = document.layers.filter((layer) => layer.kind === 'text');
  const keys = [];
  const fonts = new Map();
  try {
    for (const layer of textLayers) {
      if (fonts.has(layer.font)) continue;
      const asset = document.fontAssets?.find((entry) => `artifact-font://${entry.id}` === layer.font);
      if (!asset?.dataUrl?.match(/^data:[^,]+;base64,/)) {
        throw new Error(`Outline export needs an embedded font for layer ${layer.id}; no system fallback is allowed.`);
      }
      const bytes = Buffer.from(asset.dataUrl.split(',')[1], 'base64');
      const family = `ArtifactOutline${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
      const key = GlobalFonts.register(bytes, family);
      if (!key) throw new Error(`Cannot decode outline font for layer ${layer.id}.`);
      keys.push(key);
      fonts.set(layer.font, family);
    }
    document.layers = document.layers.map((layer) => {
      if (layer.kind !== 'text') return layer;
      const canvas = createCanvas(540, 540, SvgExportFlag.ConvertTextToPaths);
      const baselineOffset = baselineOffsets[layer.id];
      if (!Number.isFinite(baselineOffset)) throw new Error(`Missing browser baseline for ${layer.id}.`);
      const context = canvas.getContext('2d');
      // Native Skia's middle baseline differs from browser Canvas for fonts
      // with unusual ascent/descent. Use the measured browser alphabetic offset.
      const painter = new Proxy(context, {
        get(target, property) {
          if (property === 'fillText')
            return (text, x, y, maxWidth) => {
              target.textBaseline = 'alphabetic';
              target.fillText(text, x, y + baselineOffset, maxWidth);
            };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, property, value) {
          target[property] = value;
          return true;
        },
      });
      // Bake placement into a transparent vector plate; compositing stays at
      // the original graph node, so opacity and blend mode are applied once.
      drawTextLayer(painter, 540, 540, { ...layer, opacity: 100, blendMode: 'normal' }, 1, fonts.get(layer.font));
      const svg = canvas.getContent().toString('utf8');
      if (/<(?:text|image|foreignObject|script)\b|@font-face|(?:href|font-family)=/i.test(svg)) {
        throw new Error(`Outline export produced non-path content for layer ${layer.id}.`);
      }
      if (layer.content?.trim() && !svg.includes('<path')) throw new Error(`No outlines for layer ${layer.id}.`);
      return {
        id: layer.id,
        name: layer.name,
        kind: 'image',
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        fit: 'free',
        x: 0.5,
        y: 0.5,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    });
    delete document.fontAssets;
    if (result.manifest) {
      result.manifest.fonts = [];
      result.manifest.fontEmbeddingMode = 'metadata-only';
      result.manifest.images.embeddedPayloads += textLayers.length;
    }
    result.outlineConversion = {
      kind: 'artifact-web-text-outlines',
      version: 1,
      referenceSize: 540,
      layerIds: textLayers.map((layer) => layer.id),
      placement: 'baked-per-layer-vector-plate',
      sourceRemainsEditable: true,
    };
    return result;
  } finally {
    for (const key of keys) GlobalFonts.remove(key);
  }
}
