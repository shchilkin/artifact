import type { CanvasDocument, CanvasGraph, EffectLayer, Layer } from '../../../types/config';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';

/**
 * Splits a document into what a live package draws (issue #333): plates the editor renders at export time, and
 * chains of effect layers the runtime runs. Pure: the registry decides which effects are live, so a newly ported
 * effect moves from plates into chains without changing this file.
 */

/** The part of the runtime registry the split reads. */
export interface LiveEffectRegistry {
  has(id: string): boolean;
  get(id: string): { readonly fields: readonly string[] } | undefined;
}

/**
 * The editor's effects in the order it applies them within one effect layer: Canvas 2D effects first
 * (`applyCanvas2DEffects`), then GPU filters (`buildFiltersFromEffectLayer`). `effect` is the editor preset id, which
 * is also the runtime registry id. `fields` are the layer fields that switch it on.
 */
export const EDITOR_EFFECT_ORDER: readonly {
  readonly effect: string;
  readonly fields: readonly (keyof EffectLayer)[];
  readonly active: (layer: EffectLayer) => boolean;
}[] = [
  ...positive('retroResolution'),
  { effect: 'rays', fields: ['rays', 'rayInt'], active: (layer) => layer.rayInt > 0 && layer.rays > 0 },
  ...positive('glitch', 'badStream'),
  // The editor applies rgbSplit twice: a Canvas 2D offset here and a GPU filter later. A runtime port must do both.
  ...positive('rgbSplit', 'scanlines', 'grain', 'dotGrain'),
  { effect: 'tint', fields: ['tintOp'], active: (layer) => layer.tintOp > 0 },
  // One colour pass in the editor; its internal order is sepia, infrared, chromatic aberration, dither.
  ...positive('sepia', 'infrared', 'ca', 'dither'),
  ...positive('indexedPalette', 'gradientMap', 'channelMixer', 'edgeCrush', 'silhouetteCrush', 'pixelStretch'),
  ...positive('bokehBlur', 'hatching', 'vhsTracking', 'matte'),
  { effect: 'wave', fields: ['waveAmt'], active: (layer) => layer.waveAmt > 0 },
  ...positive('zoomBlur', 'neonGlow', 'overprint', 'solarize', 'bleachBypass', 'cyanotype'),
  { effect: 'splitTone', fields: ['splitToneAmt'], active: (layer) => layer.splitToneAmt > 0 },
  { effect: 'ripple', fields: ['rippleAmt'], active: (layer) => layer.rippleAmt > 0 },
  ...positive('patternRefraction', 'kaleidoscope'),
  {
    effect: 'squeeze',
    fields: ['squeezeX', 'squeezeY'],
    active: (layer) => (layer.squeezeX ?? 0) !== 0 || (layer.squeezeY ?? 0) !== 0,
  },
  ...positive('emboss', 'linocut', 'fog', 'gooeyMerge', 'speedLines'),
  // GPU filters, in buildFiltersFromEffectLayer order.
  ...positive('mirror', 'dataMosh', 'interlace', 'noiseWarp'),
  { effect: 'morph', fields: ['morphAmt'], active: (layer) => layer.morphAmt > 0 },
  ...positive('vortex', 'barrel'),
  { effect: 'tear', fields: ['tearAmt'], active: (layer) => layer.tearAmt > 0 },
  ...positive('pixelate', 'posterize', 'hueShift', 'duotone', 'halftone', 'risoShift', 'bloom'),
  { effect: 'blur', fields: ['blurAmt'], active: (layer) => layer.blurAmt > 0 },
  ...positive('threshold', 'edgeDetect'),
  { effect: 'gradientOverlay', fields: ['gradMix'], active: (layer) => layer.gradMix > 0 },
  ...positive('vignette', 'filmBurn'),
];

function positive(...fields: (keyof EffectLayer)[]) {
  return fields.map((field) => ({
    effect: field as string,
    fields: [field],
    active: (layer: EffectLayer) => Number(layer[field] ?? 0) > 0,
  }));
}

/** The effects an effect layer applies, in the editor's order. */
export function activeEffects(layer: EffectLayer): string[] {
  return EDITOR_EFFECT_ORDER.filter((entry) => entry.active(layer)).map((entry) => entry.effect);
}

export interface PlannedPass {
  readonly effect: string;
  /** The authored fields the runtime effect reads, from the layer. */
  readonly layer: Readonly<Record<string, number | string | boolean>>;
  readonly source: { readonly id: string; readonly name: string };
}

export type PlannedItem =
  | { readonly type: 'plate'; readonly layers: readonly Layer[] }
  | { readonly type: 'chain'; readonly layers: readonly EffectLayer[]; readonly passes: readonly PlannedPass[] };

export interface PlannedBake {
  readonly id: string;
  readonly name: string;
  readonly effects: readonly string[];
  readonly reason: string;
}

export interface LivePlan {
  /** Bottom first. The bottom plate is drawn from a transparent canvas; later plates are drawn over the image. */
  readonly stack: readonly PlannedItem[];
  /** A stack document's background, drawn beneath the final composite. Graph documents have none. */
  readonly background: string | null;
  readonly baked: readonly PlannedBake[];
  /** Set when the whole document is one still plate because it cannot be split. */
  readonly fallback?: string;
}

export interface LivePlanOptions {
  /**
   * Moves effect layers the runtime does not run beneath the live chain they sit on, so the chain stays live. The
   * resting frame then differs from the editor's where the moved effects do not commute with the chain; each moved
   * layer says so in `baked`. Default `false`: the split is exact.
   */
  readonly approximate?: boolean;
}

type Classified =
  | { readonly kind: 'live'; readonly layer: EffectLayer; readonly effects: readonly string[] }
  | { readonly kind: 'overlay'; readonly layer: Layer }
  | { readonly kind: 'baked'; readonly layer: Layer; readonly effects: readonly string[]; readonly reason: string };

/** Plans a live package for a document: stack mode in `doc.layers` order, graph documents in render order. */
export function planLivePackage(
  doc: CanvasDocument,
  registry: LiveEffectRegistry,
  options: LivePlanOptions = {},
): LivePlan {
  const background = doc.graph ? null : doc.global.bg === 'transparent' ? null : doc.global.bg;
  const order = doc.graph ? linearGraphOrder(doc, doc.graph) : { layers: doc.layers };
  if ('reason' in order) return stillPlan(doc.layers, background, order.reason);

  let classified = order.layers.flatMap((layer) => classify(layer, registry));
  const moved = new Set<string>();
  if (options.approximate) classified = hoistBakedEffects(classified, moved);

  // Everything up to the last baked layer is one plate: a baked layer above a chain would need the chain's pixels.
  const lastBaked = findLastIndex(classified, (item) => item.kind === 'baked');
  const firstLive = classified.findIndex((item, index) => index > lastBaked && item.kind === 'live');
  const blocker = lastBaked >= 0 ? classified[lastBaked].layer : null;
  const baked: PlannedBake[] = [];
  for (const [index, item] of classified.entries()) {
    if (item.kind === 'baked') {
      const reason = moved.has(item.layer.id)
        ? `${item.reason}; moved beneath the live chain above it, so the resting frame is approximate`
        : item.reason;
      if (item.effects.length > 0) baked.push(bake(item.layer, item.effects, reason));
    } else if (item.kind === 'live' && (firstLive < 0 || index < firstLive)) {
      baked.push(
        bake(item.layer, item.effects, `"${blocker?.name}" above it is rendered by the editor and needs its pixels`),
      );
    }
  }
  if (firstLive < 0) {
    const reason = classified.some((item) => item.kind === 'live')
      ? `every live effect sits beneath "${blocker?.name}", which the editor renders`
      : 'no effect layer runs in the runtime';
    return stillPlan(order.layers, background, reason, baked);
  }

  const stack: PlannedItem[] = [{ type: 'plate', layers: classified.slice(0, firstLive).map((item) => item.layer) }];
  for (const item of classified.slice(firstLive)) {
    const top = stack[stack.length - 1];
    if (item.kind === 'live') {
      const passes = livePasses(item.layer, item.effects, registry);
      if (top.type === 'chain')
        stack[stack.length - 1] = { ...top, layers: [...top.layers, item.layer], passes: [...top.passes, ...passes] };
      else stack.push({ type: 'chain', layers: [item.layer], passes });
    } else if (top.type === 'plate') {
      stack[stack.length - 1] = { type: 'plate', layers: [...top.layers, item.layer] };
    } else {
      stack.push({ type: 'plate', layers: [item.layer] });
    }
  }
  return { stack, background, baked };
}

function stillPlan(
  layers: readonly Layer[],
  background: string | null,
  reason: string,
  baked?: PlannedBake[],
): LivePlan {
  const effects = layers.flatMap((layer) =>
    layer.kind === 'effect' && layer.visible && activeEffects(layer).length > 0
      ? [bake(layer, activeEffects(layer), reason)]
      : [],
  );
  return {
    stack: [{ type: 'plate', layers: layers.filter((layer) => layer.visible) }],
    background,
    baked: baked ?? effects,
    fallback: reason,
  };
}

function bake(layer: Layer, effects: readonly string[], reason: string): PlannedBake {
  return { id: layer.id, name: layer.name, effects, reason };
}

function classify(layer: Layer, registry: LiveEffectRegistry): Classified[] {
  if (!layer.visible) return [];
  const normal = isNormalBlend(layer.blendMode);
  if (layer.kind !== 'effect') {
    return normal
      ? [{ kind: 'overlay', layer }]
      : [{ kind: 'baked', layer, effects: [], reason: `blend mode "${layer.blendMode}" reads the pixels beneath` }];
  }
  const effects = activeEffects(layer);
  if (effects.length === 0) return [];
  const unsupported = effects.filter((effect) => !registry.has(effect));
  const reason =
    unsupported.length > 0
      ? `${unsupported.join(', ')} ${unsupported.length === 1 ? 'does' : 'do'} not run in the runtime yet`
      : layer.maskAlpha
        ? 'alpha masking is not supported in the runtime'
        : !normal
          ? `blend mode "${layer.blendMode}" is not supported in the runtime`
          : null;
  return [reason ? { kind: 'baked', layer, effects, reason } : { kind: 'live', layer, effects }];
}

function isNormalBlend(blendMode: string | undefined): boolean {
  return blendMode === undefined || blendMode === 'normal' || blendMode === 'source-over';
}

/**
 * Approximation: each baked effect layer that sits on a live run (with only effect layers between) moves beneath that
 * run. Baked source layers never move.
 */
function hoistBakedEffects(items: readonly Classified[], moved: Set<string>): Classified[] {
  const result: Classified[] = [];
  for (const item of items) {
    if (item.kind !== 'baked' || item.layer.kind !== 'effect') {
      result.push(item);
      continue;
    }
    let index = result.length - 1;
    while (index >= 0 && result[index].layer.kind === 'effect' && result[index].kind !== 'live') index -= 1;
    if (index < 0 || result[index].kind !== 'live') {
      result.push(item);
      continue;
    }
    while (index > 0 && result[index - 1].kind === 'live') index -= 1;
    result.splice(index, 0, item);
    moved.add(item.layer.id);
  }
  return result;
}

function livePasses(layer: EffectLayer, effects: readonly string[], registry: LiveEffectRegistry): PlannedPass[] {
  return effects.map((effect) => {
    const fields = registry.get(effect)?.fields ?? [];
    const values: Record<string, number | string | boolean> = {};
    for (const field of fields) {
      const value = (layer as unknown as Record<string, unknown>)[field];
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') values[field] = value;
    }
    return { effect, layer: values, source: { id: layer.id, name: layer.name } };
  });
}

/**
 * The layers a graph renders, bottom first, when the graph is a single line of layer nodes into the export node:
 * the order the renderer draws them in. Otherwise the reason it is not.
 */
export function linearGraphOrder(
  doc: CanvasDocument,
  graph: CanvasGraph,
): { readonly layers: Layer[] } | { readonly reason: string } {
  const layersById = new Map(doc.layers.map((layer) => [layer.id, layer]));
  const incoming = (id: string) => graph.edges.filter((edge) => edge.toId === id);
  const layers: Layer[] = [];
  const seen = new Set<string>();
  const exportInputs = incoming(EXPORT_NODE_ID);
  if (exportInputs.length === 0) return { layers };
  if (exportInputs.length > 1) return { reason: 'the graph is not linear: the export node has several inputs' };
  let current: string | null = exportInputs[0].fromId;
  while (current) {
    const layer = layersById.get(current);
    if (!layer) return { reason: `the graph is not linear: node "${current}" is not a layer` };
    if (seen.has(current)) return { reason: `the graph is not linear: it loops through "${layer.name}"` };
    seen.add(current);
    layers.unshift(layer);
    const port = layer.kind === 'effect' ? 'in' : 'bg';
    const edges = incoming(current);
    const extra = edges.find((edge) => edge.toPort !== port);
    if (extra || edges.length > 1) {
      return { reason: `the graph is not linear: "${layer.name}" has more than one input` };
    }
    current = edges[0]?.fromId ?? null;
  }
  return { layers };
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) if (predicate(items[index])) return index;
  return -1;
}
