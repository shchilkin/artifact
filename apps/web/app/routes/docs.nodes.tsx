import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, type MetaFunction } from 'react-router';
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
import {
  MULTI_FONT_TYPE_STACK_STARTER,
  NOISE_POSTER_STACK_STARTER,
  PHOTO_TYPE_GRAPH_RECIPE,
  PHOTO_TYPE_STACK_STARTER,
  PRIMITIVE_IMAGE_GRAPH_RECIPE,
  PRINT_DAMAGE_GRAPH_RECIPE,
  STICKER_GRID_GRAPH_RECIPE,
  type StarterDocument,
  TEXTURE_TYPE_STACK_STARTER,
} from '../utils/starterDocuments';

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
    desc: 'Type set directly on the canvas. Use text starts for title, subtitle, label, credits, or poster type, then tune curated poster, mono, pixel, and typewriter fonts.',
    params: [
      { key: 'size', range: '8–160' },
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

const COMPACT_WORKFLOW_GUIDES = [
  {
    id: 'docs-start-with-layers',
    name: 'Start with Layers',
    desc: 'Use the layer stack when the piece is one readable path: base, image or type, texture, finish, export.',
    cue: 'Use when the order is bottom to top.',
    next: 'Set the base, place image or type, add one texture pass, then export or save.',
    action: { label: 'Open layer starter', href: starterHref(PHOTO_TYPE_STACK_STARTER) },
    secondary: { label: 'Browse showcase projects', href: '/showcase' },
  },
  {
    id: 'docs-when-to-use-nodes',
    name: 'When to use Nodes',
    desc: 'Use nodes when parts of the artwork need separate paths before they become one output.',
    cue: 'Use when one source feeds several paths.',
    next: 'Start from a source, route the branches, merge them, then check the Export node.',
    action: { label: 'Open node starter', href: starterHref(PHOTO_TYPE_GRAPH_RECIPE) },
    secondary: { label: 'See node types', href: '#docs-node-catalog' },
  },
  {
    id: 'docs-typography-fonts',
    name: 'Typography and fonts',
    desc: 'Build type while the text remains editable: title, subtitle, label, credits, font choice, print finish.',
    cue: 'Use when words carry the identity.',
    next: 'Pick the type role, choose a font source, tune contrast, and package fonts only when licensed.',
    action: { label: 'Open type starter', href: starterHref(MULTI_FONT_TYPE_STACK_STARTER) },
    secondary: { label: 'Read file policy', href: '#docs-project-files' },
  },
  {
    id: 'docs-export-packages',
    name: 'Export and packages',
    desc: 'Choose the file by what must survive after the session: pixels, editable structure, image payloads, or font files.',
    cue: 'Use when the project must travel.',
    next: 'Export PNG for pixels, save documents for small work, package assets for handoff.',
    action: { label: 'Project file guide', href: '#docs-project-files' },
    secondary: { label: 'Fix export issues', href: '#docs-troubleshooting' },
  },
] as const;

const DOCS_JUMP_LINKS = [
  { label: 'Workflows', href: '#docs-workflow-guides' },
  { label: 'Starters', href: '#docs-recipes' },
  { label: 'Reference', href: '#docs-reference-start' },
  { label: 'Node types', href: '#docs-node-catalog' },
] as const;

const RECIPE_STARTERS: Array<{
  starter: StarterDocument;
  mode: string;
  desc: string;
  steps: string[];
}> = [
  {
    starter: MULTI_FONT_TYPE_STACK_STARTER,
    mode: 'Layer recipe',
    desc: 'A text-first layer recipe for mixing poster, mono, pixel, and typewriter fonts over one cover.',
    steps: ['Photo wash', 'Paper tooth', 'Poster title', 'Subtitle and credits', 'Print finish'],
  },
  {
    starter: TEXTURE_TYPE_STACK_STARTER,
    mode: 'Layer recipe',
    desc: 'A fast stack-only cover that proves you can finish without opening nodes.',
    steps: ['Fill plate', 'Noise texture', 'Title type', 'Registration shift', 'Scanlines and grain'],
  },
  {
    starter: PHOTO_TYPE_STACK_STARTER,
    mode: 'Layer recipe',
    desc: 'A photo-first layer recipe for replacing an image, tuning type, and finishing with print texture.',
    steps: ['Matte plate', 'Cover photo', 'Duotone wash', 'Headline type', 'Drift and grain'],
  },
  {
    starter: NOISE_POSTER_STACK_STARTER,
    mode: 'Layer recipe',
    desc: 'A texture-and-type poster recipe that stays completely in the layer stack.',
    steps: ['Burnt plate', 'Paper static', 'Poster type', 'Halftone', 'Scanlines and dust'],
  },
  {
    starter: PHOTO_TYPE_GRAPH_RECIPE,
    mode: 'Graph recipe',
    desc: 'A photo-led cover where color wash, type, and grain stay editable as separate steps.',
    steps: ['Image branch', 'Duotone', 'Headline type', 'Final grain'],
  },
  {
    starter: STICKER_GRID_GRAPH_RECIPE,
    mode: 'Graph recipe',
    desc: 'A motif field recipe for repeated marks, sticker grids, and printed label energy.',
    steps: ['Paper noise', 'Array motif', 'Riso shift', 'Label type', 'Overprint'],
  },
  {
    starter: PRIMITIVE_IMAGE_GRAPH_RECIPE,
    mode: 'Graph recipe',
    desc: 'A branch recipe for merging a 3D primitive over an image without flattening the structure.',
    steps: ['Image wash', 'Primitive branch', 'Merge', 'Small type', 'Vignette'],
  },
  {
    starter: PRINT_DAMAGE_GRAPH_RECIPE,
    mode: 'Graph recipe',
    desc: 'A distressed poster recipe that keeps halftone, tear, and dust as individual choices.',
    steps: ['Paper fiber', 'Poster type', 'Halftone', 'Tear', 'Dust pass'],
  },
];

const PRACTICAL_BLEND_GUIDE = [
  {
    name: 'Screen',
    desc: 'Use for light leaks, glow, dust, static, and pale texture over a dark plate.',
  },
  {
    name: 'Multiply',
    desc: 'Use for paper stains, ink shadow, halftone grime, and anything that should darken the cover.',
  },
  {
    name: 'Overlay',
    desc: 'Use when texture should inherit the colors underneath instead of sitting on top like a sticker.',
  },
  {
    name: 'Difference',
    desc: 'Use sparingly for harsh poster inversions, experimental type, and graphic accidents.',
  },
];

const TROUBLESHOOTING_GUIDE = [
  {
    name: 'Blank preview',
    desc: 'Check layer visibility, confirm the graph Export node has an input, and try stack mode if the document is meant to be layer-only.',
  },
  {
    name: 'Missing image',
    desc: 'Local images live in browser storage. If a shared document loses an image, reimport it or save an editable .artifact package.',
  },
  {
    name: 'Storage limit',
    desc: 'Large imported images can fill browser storage. Save an editable .artifact package before clearing site data.',
  },
  {
    name: 'Missing font',
    desc: 'Imported fonts may be unavailable on another browser. The text remains editable, and the font can be replaced from the Font Library. Google Fonts imports carry open-license metadata.',
  },
  {
    name: 'GPU or WebGL issue',
    desc: 'Primitive and GPU effects depend on the browser. Reload, reduce active previews, or export again after switching tabs back.',
  },
  {
    name: 'Export mismatch',
    desc: 'Export uses the canonical renderer. Check aspect ratio, graph target, image readiness, and primitive camera state before exporting.',
  },
];

const PROJECT_FILE_GUIDE = [
  {
    name: 'Raster export',
    desc: 'EXPORT downloads pixels. It does not include font files, project metadata, or editable layer data.',
  },
  {
    name: 'Document save',
    desc: 'SAVE downloads a readable .artifact.json document for small portable work and compatibility with older files.',
  },
  {
    name: 'Project package',
    desc: 'PACKAGE downloads an editable .artifact project. It carries image payloads, font metadata, and open-license Google font files. Unknown local font files stay out by default.',
  },
  {
    name: 'Package + fonts',
    desc: 'PKG+FONTS includes every imported font file. Use it only when you have the right to distribute those font files.',
  },
  {
    name: 'Font recovery',
    desc: 'Packages preserve original text plus font identity. If a font is missing later, replace it and keep editing the same text layer.',
  },
];

const RESEARCH_MAP = [
  {
    name: 'Choose source material',
    desc: 'Start by choosing what carries the piece: a photo, fill, procedural texture, repeated motif, primitive, or type.',
    questions: ['What is the main source?', 'What should stay editable?', 'What texture sets the tone?'],
  },
  {
    name: 'Choose layers or nodes',
    desc: 'Use layers when the stack is simple. Use nodes when photo, type, texture, or primitive branches need different treatment before one output.',
    questions: ['Is this bottom-to-top?', 'Do branches merge?', 'Does one source feed many outputs?'],
  },
  {
    name: 'Pick a finish',
    desc: 'Add print, color, signal, distortion, or light treatment after the composition already reads.',
    questions: ['Does it need paper, damage, color, motion, or light?', 'Is one family enough?'],
  },
  {
    name: 'Save or export safely',
    desc: 'Choose what needs to survive after export: pixels only, editable structure, image payloads, font metadata, or distributable font files.',
    questions: ['Will this be reopened?', 'Will it travel to another browser?', 'Are fonts licensed to package?'],
  },
];

const HOW_IT_WORKS_FLOW = [
  {
    name: 'Document',
    desc: 'One serializable Artifact document stores global settings, layers, optional graph data, and export settings.',
    tags: ['local-first', 'undoable', 'portable'],
  },
  {
    name: 'Layers',
    desc: 'The fast path. Stack image, text, fill, emoji, noise, primitive, array, and effect layers directly.',
    tags: ['quick covers', 'direct edits', 'linear stack'],
  },
  {
    name: 'Nodes',
    desc: 'The deeper path. Route sources, effects, merge nodes, repeaters, color passes, and output targets as a graph over the same document.',
    tags: ['branches', 'merge', 'output target'],
  },
  {
    name: 'Preview',
    desc: 'Preview, node thumbnails, showcase tiles, and export use the same render path so the composition stays recognizable.',
    tags: ['preview', 'thumbnail', 'export parity'],
  },
  {
    name: 'Export',
    desc: 'Raster export downloads pixels. Project saves and packages preserve editable structure, assets, and font metadata according to the chosen file type.',
    tags: ['png', 'artifact package', 'font policy'],
  },
];

const APPLICATION_GUIDE = [
  {
    name: 'Album cover',
    desc: 'Image or fill base, readable title, one texture bed, one finishing family, export at the target aspect.',
    start: 'Start with Photo Type Stack or Multi-Font Type Stack.',
    type: 'layers',
  },
  {
    name: 'Event poster',
    desc: 'Large editable type, metadata labels, procedural texture, and print finish that survives resizing.',
    start: 'Start with Texture Type Stack, then tune typography first.',
    type: 'layers',
  },
  {
    name: 'Texture study',
    desc: 'Use noise, array, halftone, scanlines, grain, and color passes to build a material system before adding type.',
    start: 'Start with Noise Poster Stack or a source node.',
    type: 'source',
  },
  {
    name: 'Node composition',
    desc: 'Keep image, primitive, type, and texture as branches, then merge them into one output without flattening the idea too early.',
    start: 'Start with Primitive Image Graph or Photo Type Graph.',
    type: 'nodes',
  },
  {
    name: 'Typography system',
    desc: 'Mix built-in, local, or Google fonts while keeping text editable and exports raster-safe.',
    start: 'Start with Multi-Font Type Stack.',
    type: 'type',
  },
  {
    name: 'Project handoff',
    desc: 'Choose document save, package, or package-with-fonts based on what another browser needs to reopen safely.',
    start: 'Use Project Files after the artwork works visually.',
    type: 'export',
  },
];

const DOC_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'research', label: 'Guides' },
  { id: 'workflow', label: 'How it works' },
  { id: 'application', label: 'Applications' },
  { id: 'recipe', label: 'Recipes' },
  { id: 'node', label: 'Nodes' },
  { id: 'effect', label: 'Effects' },
  { id: 'file', label: 'Files' },
  { id: 'fix', label: 'Fixes' },
] as const;

const DOCS_START_POINTS = [
  {
    id: 'make-cover',
    href: '#docs-start-with-layers',
    title: 'Make a cover',
    desc: 'Start with one image, one title, one texture pass, then export.',
    action: 'Start here',
  },
  {
    id: 'find-effect',
    filter: 'effect',
    title: 'Find an effect',
    desc: 'Look up noise, grain, scanlines, color passes, print damage, and type treatments.',
    action: 'Show effects',
  },
  {
    id: 'fix-export',
    query: 'export',
    title: 'Fix or export',
    desc: 'Find blank preview checks, project files, font packaging, and raster export notes.',
    action: 'Search export',
  },
] as const;

type DocFilter = (typeof DOC_FILTERS)[number]['id'];

interface SearchItem {
  id: string;
  type: DocFilter;
  title: string;
  body: string;
  href: string;
  meta: string;
}

function nodeSearchType(node: NodeDef): DocFilter {
  if (node.id in EFFECT_PRESETS) return 'effect';
  return 'node';
}

function nodeTypeLabel(node: NodeDef): string {
  if (node.id in EFFECT_PRESETS) return 'Effect node';
  if (SOURCE_NODES.some((item) => item.id === node.id)) return 'Source node';
  return 'Content node';
}

function itemMatches(item: SearchItem, query: string, filter: DocFilter) {
  if (filter !== 'all' && item.type !== filter) return false;
  if (!query) return true;
  const haystack = `${item.title} ${item.body} ${item.meta} ${item.type}`.toLowerCase();
  return haystack.includes(query);
}

function starterHref(starter: StarterDocument) {
  return `/app?doc=${encodeURIComponent(JSON.stringify(starter.doc))}`;
}

function DocsLink({ children, className, href }: { children: ReactNode; className?: string; href: string }) {
  return href.startsWith('/') ? (
    <Link to={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

function GuideSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const titleId = `${id ?? `docs-${eyebrow.toLowerCase().replace(/\s+/g, '-')}`}-title`;
  return (
    <section id={id} className="docs-guide-section" aria-labelledby={titleId}>
      <div className="docs-guide-section__header">
        <span className="docs-guide-section__eyebrow">{eyebrow}</span>
        <h2 id={titleId} className="docs-guide-section__title">
          {title}
        </h2>
      </div>
      <div className="docs-guide-section__body">{children}</div>
    </section>
  );
}

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
  const [controlsOpen, setControlsOpen] = useState(false);
  const docRef = useRef(doc);
  const revRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const tryHref = `/app?doc=${encodeURIComponent(JSON.stringify(doc))}`;
  const controlsId = `node-${node.id}-controls`;

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
        {node.params.length > 0 && (
          <button
            type="button"
            className="docs-poster__tune"
            aria-expanded={controlsOpen}
            aria-controls={controlsId}
            onClick={() => setControlsOpen((open) => !open)}
          >
            {controlsOpen ? 'Hide controls' : 'Tune preview'}
          </button>
        )}

        {node.params.length > 0 && controlsOpen && (
          <div className="docs-poster__sandbox" id={controlsId}>
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
            <DocsLink href={tryHref} className="docs-poster__try">
              Open in editor →
            </DocsLink>
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
  { title: 'Docs | Artifact' },
  {
    name: 'description',
    content: 'Artifact docs for editor workflows, node types, applications, effects, files, and export.',
  },
];

export default function DocsNodes() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<DocFilter>('all');

  const normalizedQuery = query.trim().toLowerCase();
  const searchItems = useMemo<SearchItem[]>(
    () => [
      ...RESEARCH_MAP.map((item) => ({
        id: `research-${item.name}`,
        type: 'research' as const,
        title: item.name,
        body: `${item.desc} ${item.questions.join(' ')}`,
        href: '#docs-workflow-guides',
        meta: 'Guide',
      })),
      ...HOW_IT_WORKS_FLOW.map((item) => ({
        id: `workflow-${item.name}`,
        type: 'workflow' as const,
        title: item.name,
        body: `${item.desc} ${item.tags.join(' ')}`,
        href: '#docs-how-it-works',
        meta: 'How it works',
      })),
      ...COMPACT_WORKFLOW_GUIDES.map((item) => ({
        id: `workflow-guide-${item.id}`,
        type: 'workflow' as const,
        title: item.name,
        body: `${item.desc} ${item.cue} ${item.next}`,
        href: `#${item.id}`,
        meta: 'Workflow guide',
      })),
      ...APPLICATION_GUIDE.map((item) => ({
        id: `application-${item.name}`,
        type: 'application' as const,
        title: item.name,
        body: `${item.desc} ${item.start} ${item.type}`,
        href: '#docs-applications',
        meta: `Application / ${item.type}`,
      })),
      ...RECIPE_STARTERS.map(({ starter, mode, desc, steps }) => ({
        id: `recipe-${starter.id}`,
        type: 'recipe' as const,
        title: starter.name,
        body: `${desc} ${steps.join(' ')}`,
        href: starterHref(starter),
        meta: mode,
      })),
      ...ALL_NODES.map((node) => ({
        id: `node-${node.id}`,
        type: nodeSearchType(node),
        title: node.name,
        body: `${node.desc} ${node.params.map((param) => `${param.key} ${param.range}`).join(' ')}`,
        href: `#node-${node.id}`,
        meta: nodeTypeLabel(node),
      })),
      ...PRACTICAL_BLEND_GUIDE.map((mode) => ({
        id: `blend-${mode.name}`,
        type: 'effect' as const,
        title: mode.name,
        body: mode.desc,
        href: '#docs-blends',
        meta: 'Blend mode',
      })),
      ...PROJECT_FILE_GUIDE.map((item) => ({
        id: `file-${item.name}`,
        type: 'file' as const,
        title: item.name,
        body: item.desc,
        href: '#docs-project-files',
        meta: 'Project file',
      })),
      ...TROUBLESHOOTING_GUIDE.map((item) => ({
        id: `fix-${item.name}`,
        type: 'fix' as const,
        title: item.name,
        body: item.desc,
        href: '#docs-troubleshooting',
        meta: 'Troubleshooting',
      })),
    ],
    [],
  );
  const matchingItems = useMemo(
    () => searchItems.filter((item) => itemMatches(item, normalizedQuery, activeFilter)),
    [activeFilter, normalizedQuery, searchItems],
  );
  const hasActiveSearch = Boolean(normalizedQuery) || activeFilter !== 'all';
  const resultLimit = hasActiveSearch ? 12 : 0;
  const filteredItems = useMemo(() => matchingItems.slice(0, resultLimit), [matchingItems, resultLimit]);
  const catalogFilter = activeFilter === 'node' || activeFilter === 'effect' ? activeFilter : 'all';
  const catalogNodes = useMemo(
    () =>
      ALL_NODES.filter((node) =>
        itemMatches(
          {
            id: `node-${node.id}`,
            type: nodeSearchType(node),
            title: node.name,
            body: `${node.desc} ${node.params.map((param) => `${param.key} ${param.range}`).join(' ')}`,
            href: `#node-${node.id}`,
            meta: nodeTypeLabel(node),
          },
          normalizedQuery,
          catalogFilter,
        ),
      ),
    [catalogFilter, normalizedQuery],
  );
  const visibleCatalogNodes = normalizedQuery || catalogFilter !== 'all' ? catalogNodes : ALL_NODES;

  return (
    <div className="docs-page">
      <SiteNav solid />

      <main className="docs-feed">
        <section className="docs-intro" aria-labelledby="docs-title">
          <h1 id="docs-title" className="docs-intro__headline">
            Artifact Docs.
          </h1>
          <p className="docs-intro__deck">
            Learn the editor, choose layers or nodes, find effects, open recipes, and export covers, posters, textures,
            and type studies with confidence.
          </p>
        </section>

        <section id="docs-search" className="docs-search-panel" aria-labelledby="docs-search-title">
          <div className="docs-search-panel__header">
            <div>
              <span className="docs-guide-section__eyebrow">Docs</span>
              <h2 id="docs-search-title">Find an answer or start here.</h2>
            </div>
            <span className="docs-search-count">
              {hasActiveSearch
                ? `${matchingItems.length} matches${matchingItems.length > filteredItems.length ? `, showing ${filteredItems.length}` : ''}`
                : '3 start points'}
            </span>
          </div>
          <label className="docs-search-box">
            <span className="sr-only">Search docs</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search effects, export, fonts, nodes..."
            />
          </label>
          <details className="docs-filter-details">
            <summary>
              <span>Filter results by type</span>
              <span className="docs-filter-details__mark" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="docs-type-filter" aria-label="Filter docs by type">
              {DOC_FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.id}
                  className={`docs-type-filter__item${activeFilter === filter.id ? ' docs-type-filter__item--active' : ''}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </details>
          {hasActiveSearch ? (
            <div className="docs-search-results" aria-live="polite">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <DocsLink key={item.id} href={item.href} className="docs-search-result">
                    <span className="docs-search-result__meta">{item.meta}</span>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </DocsLink>
                ))
              ) : (
                <p className="docs-search-empty">No matches. Try `type`, `export`, `noise`, `font`, or `nodes`.</p>
              )}
            </div>
          ) : (
            <div className="docs-start-points" aria-label="Start with">
              {DOCS_START_POINTS.map((point) =>
                'href' in point ? (
                  <DocsLink key={point.id} href={point.href} className="docs-start-point">
                    <span className="docs-start-point__action">{point.action}</span>
                    <strong>{point.title}</strong>
                    <span>{point.desc}</span>
                  </DocsLink>
                ) : (
                  <button
                    key={point.id}
                    type="button"
                    className="docs-start-point"
                    onClick={() => {
                      setActiveFilter('filter' in point ? point.filter : 'all');
                      setQuery('query' in point ? point.query : '');
                    }}
                  >
                    <span className="docs-start-point__action">{point.action}</span>
                    <strong>{point.title}</strong>
                    <span>{point.desc}</span>
                  </button>
                ),
              )}
            </div>
          )}
          {hasActiveSearch && (
            <button
              type="button"
              className="docs-search-reset"
              onClick={() => {
                setActiveFilter('all');
                setQuery('');
              }}
            >
              Clear search
            </button>
          )}
        </section>

        <nav className="docs-jump-row" aria-label="Docs sections">
          {DOCS_JUMP_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <GuideSection id="docs-workflow-guides" eyebrow="Start Here" title="Four paths.">
          <div className="docs-workflow-guide-grid">
            {COMPACT_WORKFLOW_GUIDES.map((guide, index) => (
              <article key={guide.id} id={guide.id} className="docs-workflow-guide">
                <span className="docs-workflow-guide__num">{String(index + 1).padStart(2, '0')}</span>
                <h3>{guide.name}</h3>
                <p>{guide.desc}</p>
                <div className="docs-workflow-guide__next">
                  <span>{guide.cue}</span>
                  <strong>{guide.next}</strong>
                </div>
                <div className="docs-workflow-guide__links">
                  <DocsLink href={guide.action.href}>{guide.action.label}</DocsLink>
                  <DocsLink href={guide.secondary.href} className="docs-workflow-guide__secondary">
                    {guide.secondary.label}
                  </DocsLink>
                </div>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="docs-how-it-works" eyebrow="How It Works" title="One document, two ways to build.">
          <div className="docs-flow-map">
            {HOW_IT_WORKS_FLOW.map((item, index) => (
              <article key={item.name} className="docs-flow-step">
                <span className="docs-flow-step__num">{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.name}</h3>
                <p>{item.desc}</p>
                <div className="docs-flow-step__tags">
                  {item.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection
          id="docs-applications"
          eyebrow="Applications"
          title="Start from the job, then choose layers or nodes."
        >
          <div className="docs-application-grid">
            {APPLICATION_GUIDE.map((item) => (
              <article key={item.name} className="docs-application">
                <span className="docs-recipe__mode">{item.type}</span>
                <h3>{item.name}</h3>
                <p>{item.desc}</p>
                <span>{item.start}</span>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="docs-recipes" eyebrow="Recipes" title="Open a working document, then change one decision.">
          <div className="docs-recipe-list">
            {RECIPE_STARTERS.map(({ starter, mode, desc, steps }) => (
              <article key={starter.id} className="docs-recipe">
                <div>
                  <span className="docs-recipe__mode">{mode}</span>
                  <h3>{starter.name}</h3>
                  <p>{desc}</p>
                  <div className="docs-recipe__steps">{steps.join(' / ')}</div>
                </div>
                <DocsLink href={starterHref(starter)} className="docs-recipe__link">
                  Try this
                </DocsLink>
              </article>
            ))}
          </div>
        </GuideSection>

        <section id="docs-reference-start" className="docs-reference-break" aria-labelledby="docs-reference-title">
          <span className="docs-guide-section__eyebrow">Reference</span>
          <h2 id="docs-reference-title">Use these when you need a specific answer.</h2>
        </section>

        <GuideSection id="docs-blends" eyebrow="Blend Modes" title="Think in cover-making jobs, not math.">
          <div className="docs-reference-grid">
            {PRACTICAL_BLEND_GUIDE.map((mode) => (
              <article key={mode.name} className="docs-reference-item">
                <h3>{mode.name}</h3>
                <p>{mode.desc}</p>
              </article>
            ))}
          </div>
          <details className="docs-details">
            <summary>Full blend mode notes</summary>
            <div className="docs-compact-grid">
              {BLEND_GUIDE.map((mode) => (
                <div key={mode.name}>
                  <span>{mode.name}</span>
                  <p>{mode.desc}</p>
                </div>
              ))}
            </div>
          </details>
        </GuideSection>

        <GuideSection eyebrow="Sources And Motifs" title="Use procedural nodes when the material should stay editable.">
          <div className="docs-reference-grid">
            {[...SOURCE_RECIPE_GUIDE, ...MOTIF_RECIPE_GUIDE].map((recipe) => (
              <article key={recipe.name} className="docs-reference-item">
                <h3>{recipe.name}</h3>
                <p>{recipe.desc}</p>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection eyebrow="Effects" title="Pick one family first, then tune the exact node.">
          <div className="docs-reference-grid docs-reference-grid--dense">
            {EFFECT_FAMILY_GUIDE.map((family) => (
              <article key={family.name} className="docs-reference-item">
                <h3>{family.name}</h3>
                <p>{family.desc}</p>
              </article>
            ))}
            {GRAPH_UTILITY_GUIDE.map((utility) => (
              <article key={utility.name} className="docs-reference-item">
                <h3>{utility.name}</h3>
                <p>{utility.desc}</p>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="docs-project-files" eyebrow="Project Files" title="Choose the file by what needs to survive.">
          <div className="docs-reference-grid">
            {PROJECT_FILE_GUIDE.map((item) => (
              <article key={item.name} className="docs-reference-item">
                <h3>{item.name}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection
          id="docs-troubleshooting"
          eyebrow="Troubleshooting"
          title="Fast checks when the result does not look right."
        >
          <div className="docs-trouble-list">
            {TROUBLESHOOTING_GUIDE.map((item) => (
              <article key={item.name} className="docs-trouble">
                <h3>{item.name}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection
          id="docs-node-catalog"
          eyebrow="Node Types"
          title="Live previews for content, source, and effect types."
        >
          <p className="docs-catalog-note">
            Search above to narrow the list. Use preview controls to tune a node, or open a poster in the editor when a
            visual starts to feel usable.
          </p>
          <div className="docs-catalog-actions" aria-label="Node catalog actions">
            <a href="#docs-search">Search node types</a>
            <span>Tune preview controls appear on each poster.</span>
          </div>
          <div className="docs-node-feed">
            {visibleCatalogNodes.map((node) => (
              <NodePoster key={node.id} node={node} />
            ))}
          </div>
        </GuideSection>
      </main>

      <Footer />
    </div>
  );
}
