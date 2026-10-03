import type { CanvasDocument, Layer } from '../../types/config';

/**
 * Cover Motion turns a still document into a seamless loop by driving numeric
 * layer fields (seed offsets and effect amounts) as a function of loop time.
 * Each frame is an ordinary document, so frames render through the same
 * `renderDocument` path as preview and export.
 */

interface CoverMotionTrackBase {
  layerId: string;
  /** Numeric layer field, e.g. `seedOffset`, `noiseWarp`, `vortex`, `ca`. */
  property: string;
  min?: number;
  max?: number;
}

/** Smooth oscillation around the authored value. Whole `cycles` keep the loop seamless. */
export interface CoverMotionWaveTrack extends CoverMotionTrackBase {
  kind: 'wave';
  amplitude: number;
  cycles?: number;
  /** Phase offset in loop turns (0..1). */
  phase?: number;
}

/** Holds a value for `1 / fps` seconds, then jumps by `stride`; reads as boiling grain or glitch. */
export interface CoverMotionStepTrack extends CoverMotionTrackBase {
  kind: 'step';
  fps: number;
  stride?: number;
}

/** Adds `amplitude` during short windows that start at loop positions `at` (0..1). */
export interface CoverMotionPulseTrack extends CoverMotionTrackBase {
  kind: 'pulse';
  at: number[];
  /** Window length in loop turns (0..1). */
  length: number;
  amplitude: number;
}

export type CoverMotionTrack = CoverMotionWaveTrack | CoverMotionStepTrack | CoverMotionPulseTrack;

export interface CoverMotionRecipe {
  version: 1;
  durationSeconds: number;
  fps: number;
  tracks: CoverMotionTrack[];
}

export function coverMotionFrameCount(recipe: CoverMotionRecipe) {
  return Math.max(1, Math.round(recipe.durationSeconds * recipe.fps));
}

/** Loop position (0..1) of frame `index`; frame `frameCount` wraps back to frame 0. */
export function coverMotionFrameTime(recipe: CoverMotionRecipe, index: number) {
  const frames = coverMotionFrameCount(recipe);
  return (((index % frames) + frames) % frames) / frames;
}

function trackOffset(track: CoverMotionTrack, t: number, durationSeconds: number) {
  switch (track.kind) {
    case 'wave':
      return track.amplitude * Math.sin(2 * Math.PI * ((track.cycles ?? 1) * t + (track.phase ?? 0)));
    case 'step':
      return (track.stride ?? 1) * Math.floor(t * durationSeconds * track.fps + 1e-9);
    case 'pulse':
      return track.at.some((start) => {
        const elapsed = (((t - start) % 1) + 1) % 1;
        return elapsed < track.length;
      })
        ? track.amplitude
        : 0;
  }
}

function clamp(value: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  return Math.min(max, Math.max(min, value));
}

export function applyCoverMotionFrame(doc: CanvasDocument, recipe: CoverMotionRecipe, t: number): CanvasDocument {
  const tracksByLayer = new Map<string, CoverMotionTrack[]>();
  for (const track of recipe.tracks) {
    const tracks = tracksByLayer.get(track.layerId) ?? [];
    tracks.push(track);
    tracksByLayer.set(track.layerId, tracks);
  }
  if (tracksByLayer.size === 0) return doc;

  const layers = doc.layers.map((layer) => {
    const tracks = tracksByLayer.get(layer.id);
    if (!tracks) return layer;
    const fields = layer as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { ...fields };
    for (const track of tracks) {
      const authored = fields[track.property];
      const base = typeof authored === 'number' ? authored : 0;
      const current = typeof next[track.property] === 'number' ? (next[track.property] as number) : base;
      next[track.property] = clamp(current + trackOffset(track, t, recipe.durationSeconds), track.min, track.max);
    }
    return next as unknown as Layer;
  });
  return { ...doc, layers };
}

export function parseCoverMotionRecipe(value: unknown): CoverMotionRecipe {
  if (!value || typeof value !== 'object') throw new Error('Cover motion recipe must be an object');
  const recipe = value as Partial<CoverMotionRecipe>;
  if (recipe.version !== 1) throw new Error('Unsupported cover motion recipe version');
  if (!(typeof recipe.durationSeconds === 'number' && recipe.durationSeconds > 0)) {
    throw new Error('Cover motion recipe needs a positive durationSeconds');
  }
  if (!(typeof recipe.fps === 'number' && recipe.fps > 0)) throw new Error('Cover motion recipe needs a positive fps');
  if (!Array.isArray(recipe.tracks)) throw new Error('Cover motion recipe needs a tracks array');
  for (const track of recipe.tracks) {
    if (!track || typeof track.layerId !== 'string' || typeof track.property !== 'string') {
      throw new Error('Every cover motion track needs a layerId and property');
    }
    if (!['wave', 'step', 'pulse'].includes(track.kind))
      throw new Error(`Unknown cover motion track kind: ${track.kind}`);
  }
  return recipe as CoverMotionRecipe;
}
