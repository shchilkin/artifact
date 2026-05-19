import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Footer } from '../components/Footer';
import { BLEND_MODE_HELP, BLEND_OPTIONS } from '../components/layer-controls/fieldDefs';
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
import { EFFECT_DOCS, EFFECT_FAMILY_GUIDE } from '../utils/effectDocs';
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
    desc: 'Glyphs scattered by seed. Use density, emoji set, and min/max size for the scatter; add dedicated effect nodes for blur, trails, or distortion.',
    params: [
      { key: 'density', range: '1–80' },
      { key: 'minSz/maxSz', range: '10–130' },
      { key: 'emojis', range: 'list' },
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
    desc: 'A lightweight faux-3D form, rendered directly into the canvas. Material color and light color are durable; camera rotate/pan/zoom is controlled inside the node preview.',
    params: [
      { key: 'primitiveDepth', range: '10–100' },
      { key: 'tiltX', range: '0–90' },
      { key: 'tiltY', range: '0–90' },
      { key: 'material/light', range: 'hex' },
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
    desc: 'A full-frame procedural texture source. Start from concrete, film grain, static, cells, clouds, paper, or CRT dirt presets, then tune pattern scale/detail/color and node seed.',
    params: [
      { key: 'noiseScale', range: '1–128' },
      { key: 'noiseDetail', range: '1–8' },
      { key: 'noiseContrast', range: '0–100' },
      { key: 'noiseWarp', range: '0–100' },
      { key: 'noiseTurbulence', range: '0–100' },
      { key: 'noiseThreshold', range: '0–100' },
      { key: 'nodeSeed', range: '0–9999' },
      { key: 'shadow/main color', range: 'hex' },
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
    desc: 'A motif repeater for lines, grids, and radial bursts. Start from sticker grid, radial burst, barcode line, orbit rings, or shard field presets, then tune the same array fields.',
    params: [
      { key: 'arrayCount', range: '2–18' },
      { key: 'arrayRows', range: '1–12' },
      { key: 'arrayGap', range: '12–96' },
      { key: 'arraySize', range: '8–64' },
      { key: 'seedOffset', range: '0–999' },
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

const EFFECT_NODES: NodeDef[] = EFFECT_PRESET_MENU_ORDER.map((preset) => ({
  id: preset,
  symbol: EFFECT_PRESETS[preset].icon,
  name: EFFECT_PRESETS[preset].name,
  desc: EFFECT_DOCS[preset].description,
  params: EFFECT_DOCS[preset].params,
  doc: buildEffectDoc(preset),
}));

const ALL_NODES = [...CONTENT_NODES, ...SOURCE_NODES, ...EFFECT_NODES];

const GRAPH_UTILITY_GUIDE = [
  {
    name: 'Merge',
    desc: 'Combines two upstream branches with blend and opacity controls.',
  },
  {
    name: 'Color',
    desc: 'Applies brightness, contrast, saturation, and hue after a branch has rendered.',
  },
  {
    name: 'Repeater',
    desc: 'Repeats any source branch into line, grid, or radial patterns over an optional backdrop.',
  },
];

const BLEND_GUIDE = BLEND_OPTIONS.map((mode) => ({
  name: mode,
  desc: BLEND_MODE_HELP[mode],
}));

const SOURCE_RECIPE_GUIDE = [
  {
    name: 'Analog Texture Bed',
    desc: 'Start with Film Grain or Paper noise. For finer speckles, lower Noise Scale toward 1–3, then merge under artwork with overlay or screen.',
  },
  {
    name: 'Signal Damage Source',
    desc: 'Use Static or CRT Dirt noise as a branch, harden it with Threshold, then blend it through Merge for broken-video grit.',
  },
  {
    name: 'Procedural Shape Field',
    desc: 'Use Array presets such as Sticker Grid, Orbit Rings, or Shard Field when the texture should be visible graphic content.',
  },
];

const PRACTICAL_START_GUIDE = [
  {
    name: 'Starter recipe',
    desc: 'Use Texture Type from the empty canvas or examples when you want a layer-only recipe with fill, noise, type, scanlines, and grain already composed as a stack.',
  },
  {
    name: 'Blank cover',
    desc: 'Start blank, add one Image or Fill layer, then add Text. Use Layers for quick stack work; switch to Nodes when the branch structure matters.',
  },
  {
    name: 'Photo poster',
    desc: 'Import an image, set fit or free placement, add title text, then finish with one focused effect such as Grain, Scanlines, Tint, or Bloom.',
  },
  {
    name: 'Texture-first cover',
    desc: 'Create a Noise source first, choose Film Grain, Paper, Static, or CRT Dirt, then merge text or image branches over it.',
  },
  {
    name: 'Node workflow',
    desc: 'Build source branches left to right, use Merge to combine them, group related nodes into areas, and keep Export as the final readable target.',
  },
];

const MOTIF_RECIPE_GUIDE = [
  {
    name: 'Sticker Wall',
    desc: 'Feed a logo, emoji, image cutout, or text node into the Sticker Grid repeater to build a tiled poster surface.',
  },
  {
    name: 'Echo Type',
    desc: 'Connect a text node into Echo Trail or Type Cascade, then use Color or Merge to turn the repeats into motion or shadow.',
  },
  {
    name: 'Center Burst',
    desc: 'Feed a small source into Orbit Rings or Burst Field for halos, confetti clusters, constellation marks, and radial energy.',
  },
];

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

        <section className="docs-effect-guide" aria-label="Practical starting points">
          {PRACTICAL_START_GUIDE.map((item) => (
            <div key={item.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{item.name}</span>
              <p className="docs-effect-guide__desc">{item.desc}</p>
            </div>
          ))}
        </section>

        <section className="docs-effect-guide" aria-label="Effect families">
          {EFFECT_FAMILY_GUIDE.map((family) => (
            <div key={family.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{family.name}</span>
              <p className="docs-effect-guide__desc">{family.desc}</p>
            </div>
          ))}
        </section>

        <section className="docs-effect-guide" aria-label="Graph utilities">
          {GRAPH_UTILITY_GUIDE.map((utility) => (
            <div key={utility.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{utility.name}</span>
              <p className="docs-effect-guide__desc">{utility.desc}</p>
            </div>
          ))}
        </section>

        <section className="docs-effect-guide" aria-label="Blend modes">
          {BLEND_GUIDE.map((mode) => (
            <div key={mode.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{mode.name}</span>
              <p className="docs-effect-guide__desc">{mode.desc}</p>
            </div>
          ))}
        </section>

        <section className="docs-effect-guide" aria-label="Source recipes">
          {SOURCE_RECIPE_GUIDE.map((recipe) => (
            <div key={recipe.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{recipe.name}</span>
              <p className="docs-effect-guide__desc">{recipe.desc}</p>
            </div>
          ))}
        </section>

        <section className="docs-effect-guide" aria-label="Motif recipes">
          {MOTIF_RECIPE_GUIDE.map((recipe) => (
            <div key={recipe.name} className="docs-effect-guide__item">
              <span className="docs-effect-guide__name">{recipe.name}</span>
              <p className="docs-effect-guide__desc">{recipe.desc}</p>
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
