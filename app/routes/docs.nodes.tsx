import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Footer } from '../components/Footer';
import { SiteNav } from '../components/SiteNav';
import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  EFFECT_PRESET_MENU_ORDER,
  EFFECT_PRESETS,
  type EffectPreset,
  type ImageLayer,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import { renderDocument } from '../utils/renderer';

// ─── Constants ────────────────────────────────────────────────────────────────

// Make THUMB responsive up to 800
const THUMB = 800;

// ─── Rich base for effect previews ───────────────────────────────────────────

const EFFECT_BASE_LAYERS = [
  makeFillLayer({ color: '#1a0a2e' }),
  makeEmojiLayer({
    emojis: ['💀', '⚡', '🥀', '🖤', '✦', '💜', '🔥'],
    density: 20,
    minSz: 28,
    maxSz: 80,
    blur: 0,
    opacity: 90,
  }),
];

function buildEffectDoc(preset: EffectPreset): CanvasDocument {
  return {
    global: { bg: '#0d0018', seed: 31415, aspect: '1:1' },
    export: DEFAULT_EXPORT,
    layers: [...EFFECT_BASE_LAYERS, makeEffectPresetLayer(preset)],
  };
}

// ─── Node definitions ─────────────────────────────────────────────────────────

interface NodeDef {
  id: string;
  symbol: string;
  name: string;
  desc: string;
  params: Array<{ key: string; range: string }>;
  doc: CanvasDocument;
}

const CONTENT_NODES: NodeDef[] = [
  {
    id: 'fill',
    symbol: '◼',
    name: 'Fill',
    desc: 'A solid color plane. Every cover starts here, with one decision about color.',
    params: [
      { key: 'color', range: 'hex' },
      { key: 'opacity', range: '0–100' },
    ],
    doc: {
      global: { bg: '#0d0018', seed: 1, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [makeFillLayer({ color: '#d44500' })],
    },
  },
  {
    id: 'image',
    symbol: '◧',
    name: 'Image',
    desc: 'A photo or graphic dropped into the stack. Fit, scale, and reposition it freely.',
    params: [
      { key: 'opacity', range: '0–100' },
      { key: 'scaleX', range: '0.1–5' },
      { key: 'rotation', range: '0–360' },
    ],
    doc: {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [
        makeImageLayer('/girl_image_landing.png', {
          fit: 'cover',
          opacity: 80,
        }),
      ],
    },
  },
  {
    id: 'text',
    symbol: 'T',
    name: 'Text',
    desc: 'Type set directly on the canvas. Curated display fonts, normalized XY position, free rotation.',
    params: [
      { key: 'size', range: '8–400' },
      { key: 'x', range: '0–1' },
      { key: 'y', range: '0–1' },
    ],
    doc: {
      global: { bg: '#0d0018', seed: 1, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [
        makeFillLayer({ color: '#0d0018' }),
        makeTextLayer({
          content: 'ARTIFACT',
          font: 'DISPLAY',
          size: 160,
          color: '#ffe8c8',
          x: 0.5,
          y: 0.5,
          align: 'center',
        }),
      ],
    },
  },
  {
    id: 'emoji',
    symbol: '✦',
    name: 'Emoji',
    desc: 'Glyphs scattered by seed — density, size range, blur, and blend all adjustable.',
    params: [
      { key: 'density', range: '1–80' },
      { key: 'blur', range: '0–100' },
      { key: 'opacity', range: '0–100' },
    ],
    doc: {
      global: { bg: '#0d0018', seed: 31415, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [
        makeFillLayer({ color: '#0d0018' }),
        makeEmojiLayer({
          density: 30,
          minSz: 24,
          maxSz: 80,
          blur: 0,
          opacity: 100,
        }),
      ],
    },
  },
];

const SOURCE_NODES: NodeDef[] = [
  {
    id: 'primitive',
    symbol: '◍',
    name: 'Primitive',
    desc: 'A lightweight faux-3D form, rendered directly into the canvas. Sphere, cube, and cylinder give you a fast sculptural base without leaving the stack.',
    params: [
      { key: 'primitiveDepth', range: '10–100' },
      { key: 'tiltX', range: '0–90' },
      { key: 'tiltY', range: '0–90' },
      { key: 'color', range: 'hex' },
    ],
    doc: {
      global: { bg: '#0d0018', seed: 1, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [
        makeFillLayer({ color: '#12071f' }),
        makeSourceLayer('primitive', {
          primitiveShape: 'sphere',
          primitiveDepth: 62,
          tiltX: 20,
          tiltY: 30,
          color: '#ff6a3a',
          accentColor: '#8762ff',
        }),
      ],
    },
  },
  {
    id: 'noise',
    symbol: '░',
    name: 'Noise',
    desc: 'A procedural texture source. Start from concrete, film grain, static, cells, clouds, paper, or CRT dirt presets, then tune the same noise fields.',
    params: [
      { key: 'noiseScale', range: '6–96' },
      { key: 'noiseDetail', range: '1–8' },
      { key: 'noiseContrast', range: '0–100' },
      { key: 'color', range: 'hex' },
    ],
    doc: {
      global: { bg: '#0d0018', seed: 1, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [
        makeFillLayer({ color: '#11051d' }),
        makeSourceLayer('noise', {
          noiseType: 'clouds',
          noiseScale: 30,
          noiseDetail: 5,
          noiseContrast: 58,
          noiseBalance: 42,
          color: '#ea6c3d',
          accentColor: '#6b5dff',
        }),
      ],
    },
  },
  {
    id: 'array',
    symbol: '▦',
    name: 'Array',
    desc: 'A motif repeater for lines, grids, and radial bursts. It is the quickest way to build regimented sleeves, tech patterns, and sticker-sheet rhythms.',
    params: [
      { key: 'arrayCount', range: '2–18' },
      { key: 'arrayRows', range: '1–12' },
      { key: 'arrayGap', range: '12–96' },
      { key: 'arraySize', range: '8–64' },
    ],
    doc: {
      global: { bg: '#0d0018', seed: 1, aspect: '1:1' },
      export: DEFAULT_EXPORT,
      layers: [
        makeFillLayer({ color: '#0d0018' }),
        makeSourceLayer('array', {
          arrayPattern: 'radial',
          arrayShape: 'diamond',
          arrayCount: 8,
          arrayRows: 2,
          arrayRadius: 126,
          arrayGap: 34,
          arraySize: 22,
          color: '#ffd47b',
          accentColor: '#ff5f8f',
        }),
      ],
    },
  },
];

const EFFECT_DESCRIPTIONS: Record<EffectPreset, string> = {
  rays: 'Light shafts from center, tinted and angled.',
  bloom: 'Highlights bleed outward into surrounding pixels.',
  filmBurn: 'Overexposed edges and chemical flare.',
  glitch: 'Horizontal slice tears at random scan intervals.',
  interlace: 'Alternating rows offset — CRT field artifact.',
  dataMosh: 'Block compression artifacts, repeated frame error.',
  grain: 'Photographic film noise across the full frame.',
  scanlines: 'CRT phosphor bands at adjustable density.',
  tint: 'Flat color overlay at variable opacity.',
  noiseWarp: 'Displacement mapped by layered Perlin noise.',
  morph: 'Sine-wave surface distortion.',
  vortex: 'Rotational warp strongest at center.',
  barrel: 'Radial lens distortion, concave or convex.',
  tear: 'Horizontal row shift at random positions.',
  mirror: 'Fold the frame: horizontal, vertical, or both.',
  hueShift: 'Rotate all hue values by a fixed degree.',
  rgbSplit: 'RGB channels split diagonally.',
  vignette: 'Corner darkening — eye pulled to center.',
  pixelate: 'Downscale then upscale: pixel block texture.',
  posterize: 'Quantize color values to a fixed step count.',
  duotone: 'Map luminance to two chosen colors.',
  halftone: 'Simulate print dots at configurable frequency.',
  risoShift: 'Color channels shifted as if mis-fed through a press.',
  blur: 'Gaussian blur across the entire frame.',
  threshold: 'Luminance cutoff to stark black and white.',
  edgeDetect: 'Highlight edge transitions with a convolution kernel.',
  gradientOverlay: 'Two-color gradient blended over the frame.',
  sepia: 'Warm monochrome tone — classic darkroom look.',
  neonGlow: 'Bright edges bloom with a saturated chromatic halo.',
  zoomBlur: 'Radial motion blur expanding from center.',
  vhsTracking: 'Horizontal band desync — VHS tape dropout artifact.',
  dither: 'Bayer ordered dithering reduces color palette visibly.',
  infrared: 'Channel swap shifts green to red, simulating IR film.',
  ca: 'Radial chromatic aberration — lens fringe at edges.',
  wave: 'Sine-wave horizontal displacement scanned per row.',
  matte: 'Low-scale paper or canvas texture overlay.',
  overprint: 'CMYK plate offset — ink-on-ink misregistration.',
  solarize: 'Sabattier effect — luminance above threshold inverts to a surreal negative.',
  bleachBypass: 'Desaturated overlay blend — contrast and shadow crush like a skip-bleach process.',
  cyanotype: 'Prussian blue photographic print process — deep blue shadows on ivory paper.',
  splitTone: 'Shadow/highlight color grade — cold shadows, warm highlights (or vice versa).',
  ripple: 'Radial sine displacement from center — concentric wave distortion.',
  kaleidoscope: 'Mirror-fold into radial segments — 3–16 repeating sectors.',
  squeeze: 'Anamorphic X/Y scale — stretch or compress the image along each axis.',
  emboss: 'Diagonal convolution relief — raised surface texture overlay.',
  linocut: 'Bayer-dithered posterization — bold graphic print aesthetic.',
  fog: 'Luminance-weighted haze overlay — soft atmospheric mist.',
  speedLines: 'Seeded radial lines from center — manga motion effect.',
};

const EFFECT_FAMILY_GUIDE = [
  {
    name: 'Texture',
    desc: 'Grain, scanlines, matte, dither, emboss, and linocut add physical surface before or after image sources.',
  },
  {
    name: 'Distortion',
    desc: 'Noise warp, morph, wave, ripple, barrel, vortex, squeeze, and kaleidoscope bend composition geometry.',
  },
  {
    name: 'Color',
    desc: 'Tint, hue shift, duotone, infrared, sepia, cyanotype, split tone, and gradient overlay reshape palette.',
  },
  {
    name: 'Print',
    desc: 'Halftone, riso shift, overprint, posterize, threshold, and linocut push artwork toward poster production.',
  },
  {
    name: 'Signal Damage',
    desc: 'Glitch, interlace, data mosh, RGB split, chromatic aberration, VHS tracking, and pixelate create media failure.',
  },
] as const;

const EFFECT_KEY_PARAMS: Record<EffectPreset, Array<{ key: string; range: string }>> = {
  rays: [
    { key: 'rays', range: '0–100' },
    { key: 'rayInt', range: '0–100' },
    { key: 'rayColor', range: 'hex' },
  ],
  bloom: [{ key: 'bloom', range: '0–100' }],
  filmBurn: [{ key: 'filmBurn', range: '0–100' }],
  glitch: [{ key: 'glitch', range: '0–100' }],
  interlace: [{ key: 'interlace', range: '0–100' }],
  dataMosh: [{ key: 'dataMosh', range: '0–100' }],
  grain: [{ key: 'grain', range: '0–100' }],
  scanlines: [{ key: 'scanlines', range: '0–100' }],
  tint: [
    { key: 'tint', range: 'hex' },
    { key: 'tintOp', range: '0–100' },
  ],
  noiseWarp: [{ key: 'noiseWarp', range: '0–100' }],
  morph: [
    { key: 'morphAmt', range: '0–100' },
    { key: 'morphFreq', range: '1–20' },
  ],
  vortex: [{ key: 'vortex', range: '0–100' }],
  barrel: [{ key: 'barrel', range: '0–100' }],
  tear: [
    { key: 'tearAmt', range: '0–100' },
    { key: 'tearSize', range: '1–20' },
  ],
  mirror: [{ key: 'mirror', range: '0–3' }],
  hueShift: [{ key: 'hueShift', range: '0–360' }],
  rgbSplit: [{ key: 'rgbSplit', range: '0–100' }],
  vignette: [{ key: 'vignette', range: '0–100' }],
  pixelate: [{ key: 'pixelate', range: '0–100' }],
  posterize: [{ key: 'posterize', range: '0–20' }],
  duotone: [
    { key: 'duotone', range: '0–100' },
    { key: 'duoA', range: 'hex' },
    { key: 'duoB', range: 'hex' },
  ],
  halftone: [{ key: 'halftone', range: '0–100' }],
  risoShift: [
    { key: 'risoShift', range: '0–100' },
    { key: 'risoAngle', range: '0–360' },
  ],
  blur: [{ key: 'blurAmt', range: '0–100' }],
  threshold: [{ key: 'threshold', range: '0–100' }],
  edgeDetect: [{ key: 'edgeDetect', range: '0–100' }],
  gradientOverlay: [
    { key: 'gradMix', range: '0–100' },
    { key: 'gradA', range: 'hex' },
    { key: 'gradB', range: 'hex' },
    { key: 'gradAngle', range: '0–360' },
  ],
  sepia: [{ key: 'sepia', range: '0–100' }],
  neonGlow: [
    { key: 'neonGlow', range: '0–100' },
    { key: 'neonColor', range: 'hex' },
  ],
  zoomBlur: [{ key: 'zoomBlur', range: '0–100' }],
  vhsTracking: [{ key: 'vhsTracking', range: '0–100' }],
  dither: [{ key: 'dither', range: '0–100' }],
  infrared: [{ key: 'infrared', range: '0–100' }],
  ca: [{ key: 'ca', range: '0–30' }],
  wave: [
    { key: 'waveAmt', range: '0–60' },
    { key: 'waveFreq', range: '1–12' },
  ],
  matte: [{ key: 'matte', range: '0–100' }],
  overprint: [{ key: 'overprint', range: '0–100' }],
  solarize: [{ key: 'solarize', range: '0–100' }],
  bleachBypass: [{ key: 'bleachBypass', range: '0–100' }],
  cyanotype: [{ key: 'cyanotype', range: '0–100' }],
  splitTone: [
    { key: 'splitToneAmt', range: '0–100' },
    { key: 'splitShadow', range: 'hex' },
    { key: 'splitHighlight', range: 'hex' },
  ],
  ripple: [
    { key: 'rippleAmt', range: '0–100' },
    { key: 'rippleFreq', range: '1–12' },
  ],
  kaleidoscope: [{ key: 'kaleidoscope', range: '0–100' }],
  squeeze: [
    { key: 'squeezeX', range: '-80–80' },
    { key: 'squeezeY', range: '-80–80' },
  ],
  emboss: [{ key: 'emboss', range: '0–100' }],
  linocut: [{ key: 'linocut', range: '0–100' }],
  fog: [
    { key: 'fog', range: '0–100' },
    { key: 'fogColor', range: 'hex' },
  ],
  speedLines: [{ key: 'speedLines', range: '0–100' }],
};

const EFFECT_NODES: NodeDef[] = EFFECT_PRESET_MENU_ORDER.map((preset) => ({
  id: preset,
  symbol: EFFECT_PRESETS[preset].icon,
  name: EFFECT_PRESETS[preset].name,
  desc: EFFECT_DESCRIPTIONS[preset],
  params: EFFECT_KEY_PARAMS[preset],
  doc: buildEffectDoc(preset),
}));

const ALL_NODES = [...CONTENT_NODES, ...SOURCE_NODES, ...EFFECT_NODES];

// ─── Humanize camelCase param keys ───────────────────────────────────────────

function humanizeParam(key: string): string {
  const abbrs: Record<string, string> = {
    Amt: 'amount',
    Sz: 'size',
    Freq: 'frequency',
    Op: 'opacity',
    Int: 'intensity',
  };
  return key
    .split(/\s*\/\s*/)
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z][a-z]+)/g, (m) => abbrs[m] ?? m)
        .toLowerCase()
        .trim(),
    )
    .join(' / ');
}

// ─── Slider UI Data ──────────────────────────────────────────────────────────

function parseRange(rangeStr: string) {
  if (rangeStr.includes('hex')) return { type: 'color' };
  const numMatch = rangeStr.match(/([0-9.]+)[–-]([0-9.]+)/);
  if (numMatch) {
    const min = parseFloat(numMatch[1]);
    const max = parseFloat(numMatch[2]);
    const step = max - min <= 5 ? 0.01 : 1;
    return { type: 'range', min, max, step };
  }
  return null;
}

type LayerBag = Record<string, unknown>;

function findNodeLayer(doc: CanvasDocument, nodeId: string) {
  if (nodeId in EFFECT_PRESETS) {
    return (
      doc.layers.find((l) => l.kind === 'effect' && (l as LayerBag).preset === nodeId) ??
      doc.layers[doc.layers.length - 1]
    );
  }
  return doc.layers.find((l) => l.kind === nodeId) ?? doc.layers[doc.layers.length - 1];
}

function updateDocParam(doc: CanvasDocument, nodeId: string, paramKey: string, value: unknown): CanvasDocument {
  const newDoc = { ...doc, layers: doc.layers.map((l) => ({ ...l })) };
  const targetLayer = findNodeLayer(newDoc, nodeId);

  if (targetLayer) {
    const keys = paramKey.split(' / ').map((k) => k.trim());
    const bag = targetLayer as LayerBag;
    keys.forEach((k) => {
      if (k === 'scaleX' && !keys.includes('scaleY')) bag['scaleY'] = value;
      bag[k] = value;
    });
  }

  return newDoc;
}

function getDocParam(doc: CanvasDocument, nodeId: string, paramKey: string): unknown {
  const targetLayer = findNodeLayer(doc, nodeId);

  if (targetLayer) {
    const primaryKey = paramKey.split(' / ')[0].trim();
    return (targetLayer as LayerBag)[primaryKey] ?? 0;
  }
  return 0;
}

// ─── Render queue ─────────────────────────────────────────────────────────────

type RenderTask = () => Promise<void>;
const renderQueue: RenderTask[] = [];
let renderActive = false;

function drainRenderQueue() {
  if (renderActive || renderQueue.length === 0) return;
  renderActive = true;
  const next = renderQueue.shift()!;
  next().finally(() => {
    renderActive = false;
    drainRenderQueue();
  });
}

function scheduleRender(task: RenderTask) {
  renderQueue.push(task);
  drainRenderQueue();
}

// ─── NodePoster ───────────────────────────────────────────────────────────────

function NodePoster({ node }: { node: NodeDef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const [doc, setDoc] = useState<CanvasDocument>(node.doc);
  const docRef = useRef(doc);
  const revRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const tryHref = `/app?doc=${encodeURIComponent(JSON.stringify(doc))}`;

  useLayoutEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const enqueueRender = useRef(() => {
    const rev = ++revRef.current;
    const currentDoc = docRef.current;
    const imageSrcs = currentDoc.layers
      .filter((l): l is ImageLayer => l.kind === 'image')
      .map((l) => l.src)
      .filter((src) => !imageCacheRef.current.has(src));

    const preloads = imageSrcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageCacheRef.current.set(src, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        }),
    );

    scheduleRender(async () => {
      await Promise.all(preloads);
      if (rev !== revRef.current) return;
      try {
        const out = await renderDocument(currentDoc, THUMB, THUMB, imageCacheRef.current);
        if (!out || rev !== revRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        canvasRef.current.width = THUMB;
        canvasRef.current.height = THUMB;
        ctx.drawImage(out, 0, 0);
      } catch {
        // silently skip failed renders
      }
    });
  });

  // Create the IntersectionObserver exactly once — no doc dependency.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) enqueueRender.current();
      },
      { rootMargin: '600px' },
    );

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, []); // Observer created once — reads latest doc via docRef

  // Re-render when doc changes (debounced to coalesce rapid slider moves).
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => enqueueRender.current(), 80);
    return () => clearTimeout(debounceRef.current);
  }, [doc]);

  return (
    <article className="docs-poster" id={`node-${node.id}`}>
      <div className="docs-poster__canvas-wrap">
        <canvas ref={canvasRef} width={THUMB} height={THUMB} className="docs-poster__canvas" aria-hidden="true" />

        {/* Hover Sandbox UI */}
        {node.params.length > 0 && (
          <div className="docs-poster__sandbox">
            <div className="docs-poster__controls">
              {node.params.map((p) => {
                const parsed = parseRange(p.range);
                const val = getDocParam(doc, node.id, p.key);
                if (!parsed) return null;

                return (
                  <label key={p.key} className="docs-poster__control">
                    <span className="docs-poster__label">
                      {humanizeParam(p.key)}
                      <span className="docs-poster__val">
                        {parsed.type === 'color' ? val : Number(val).toFixed(parsed.step < 1 ? 2 : 0)}
                      </span>
                    </span>
                    {parsed.type === 'range' ? (
                      <input
                        type="range"
                        min={parsed.min}
                        max={parsed.max}
                        step={parsed.step}
                        value={val}
                        onChange={(e) => setDoc(updateDocParam(doc, node.id, p.key, parseFloat(e.target.value)))}
                        className="docs-poster__slider"
                      />
                    ) : (
                      <input
                        type="color"
                        value={val}
                        onChange={(e) => setDoc(updateDocParam(doc, node.id, p.key, e.target.value))}
                        style={{
                          height: '24px',
                          width: '100%',
                          cursor: 'pointer',
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <a href={tryHref} className="docs-poster__try">
              Open in generator →
            </a>
          </div>
        )}
      </div>

      <div className="docs-poster__header">
        <span className="docs-poster__symbol" aria-hidden="true">
          {node.symbol}
        </span>
        <h2 className="docs-poster__name">{node.name}</h2>
        <p className="docs-poster__desc">{node.desc}</p>
      </div>
    </article>
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => [
  { title: 'Visual Catalog | artifact' },
  {
    name: 'description',
    content: 'A live, interactive visual catalog of every node in the artifact graph.',
  },
];

export default function DocsNodes() {
  return (
    <div className="docs-page">
      <SiteNav solid />

      <main className="docs-feed">
        {/* ── Intro ── */}
        <section className="docs-intro" aria-labelledby="docs-title">
          <h1 id="docs-title" className="docs-intro__headline">
            Visual Catalog
          </h1>
          <p className="docs-intro__deck">
            A stream of inspiration. Scroll to explore every content, source, and effect node. Hover or tap any poster
            to reveal its live controls and tweak the visual in real-time.
          </p>
        </section>

        <section className="docs-effect-guide" aria-label="Effect families">
          {EFFECT_FAMILY_GUIDE.map((family) => (
            <div key={family.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{family.name}</span>
              <p className="docs-effect-guide__desc">{family.desc}</p>
            </div>
          ))}
        </section>

        {/* ── Vertical Feed ── */}
        {ALL_NODES.map((node) => (
          <NodePoster key={node.id} node={node} />
        ))}
      </main>

      <Footer />
    </div>
  );
}
