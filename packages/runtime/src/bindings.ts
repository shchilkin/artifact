import type { FrameState, FrameUniforms } from './artwork.js';
import { effectRegistry as defaultRegistry } from './effects/index.js';
import { INPUT_DOMAINS, INPUT_NAMES, type InputName, isInputName, RESTING_INPUTS } from './inputs.js';
import {
  NEUTRAL_PLATE_TRANSFORM,
  PARALLAX_TRANSFORMS,
  type ParallaxTransform,
  PLATE_TRANSFORMS,
  type PlateTransform,
  type PlateTransformField,
} from './plates.js';
import { type AuthoredEffectLayer, chainPass, type EffectContext, type EffectRegistry } from './registry.js';
import { evaluateTrack, loopPosition, TIME_TRACK_KINDS, type TimeTrack, trackDomain } from './tracks.js';
import type { ChainPass, UniformValue, UniformValues } from './types.js';

/** A visitor input as a binding source (see `INPUT_NAMES`). */
export interface InputSource {
  readonly input: InputName;
}

export type BindingSource = TimeTrack | InputSource;

/** Drives an authored field of a pass; the effect's own uniform mapping turns the field into uniforms. */
export interface FieldTarget {
  /** Index into the live chain's `passes`. */
  readonly pass: number;
  readonly field: string;
}

/** Sets a uniform of a pass directly, after field bindings. Vector uniforms need a `component`. */
export interface UniformTarget {
  readonly pass: number;
  readonly uniform: string;
  /** 0 → x, 1 → y, 2 → z, 3 → w. */
  readonly component?: number;
}

/**
 * Moves one plate of a live package (issue #394). `plate` counts the package's plates bottom up (the background is
 * not one). Units: `x`/`y` fractions of the frame, `scale` a factor, `rotation` degrees clockwise, `opacity` 0–1.
 */
export interface PlateTarget {
  readonly plate: number;
  readonly transform: PlateTransformField;
}

/**
 * Moves every plate by its depth: each plate's transform gets the binding's value times the plate's `depth`, added
 * after the plate's own bindings (`scale` adds to the factor, so a value of 0.02 grows a depth-1 plate by 2%).
 */
export interface ParallaxTarget {
  readonly parallax: ParallaxTransform;
}

export type BindingTarget = FieldTarget | UniformTarget | PlateTarget | ParallaxTarget;

export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const;
export type Easing = (typeof EASINGS)[number];

export const BINDING_MODES = ['set', 'add'] as const;
export type BindingMode = (typeof BINDING_MODES)[number];

/**
 * Maps a source to a target. A bounded source (every input; wave and pulse tracks) is normalised over its natural
 * domain, eased, and mapped onto `range`. The step track is unbounded and passes through unchanged.
 */
export interface Binding {
  readonly from: BindingSource;
  readonly to: BindingTarget;
  /** Target values at the bottom and top of the source's domain. Defaults to the domain itself. */
  readonly range?: readonly [number, number];
  /** Default `linear`. */
  readonly easing?: Easing;
  /** Exponential smoothing time constant in seconds, on the scheduler clock. Default 0 (none). */
  readonly smoothing?: number;
  /** `set` replaces the authored value; `add` offsets it (as cover-motion tracks did). Default `set`. */
  readonly mode?: BindingMode;
  /** Final `[min, max]` for the target value. */
  readonly clamp?: readonly [number, number];
}

export interface BindingsDocument {
  readonly version: 1;
  /** Required when any binding reads a time track. Whole wave cycles and step counts keep the loop seamless. */
  readonly loop?: { readonly durationSeconds: number };
  readonly bindings: readonly Binding[];
}

/** One effect of the live chain, as authored. */
export interface LivePass {
  readonly effect: string;
  readonly layer: AuthoredEffectLayer & Readonly<Record<string, unknown>>;
}

export class BindingError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid bindings:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'BindingError';
    this.issues = issues;
  }
}

const BINDING_KEYS = ['from', 'to', 'range', 'easing', 'smoothing', 'mode', 'clamp'];
const TRACK_KEYS: Record<TimeTrack['track'], readonly string[]> = {
  wave: ['track', 'cycles', 'phase'],
  step: ['track', 'fps', 'stride'],
  pulse: ['track', 'at', 'length'],
};

/** Checks the shape of a bindings document (plain JSON) and returns it typed. Throws `BindingError`. */
export function parseBindings(value: unknown): BindingsDocument {
  const issues: string[] = [];
  const fail = (path: string, message: string) => issues.push(`${path}: ${message}`);

  if (!isRecord(value)) throw new BindingError(['bindings document: must be an object']);
  if (value.version !== 1) fail('version', `must be 1, got ${describe(value.version)}`);
  unknownKeys(value, ['version', 'loop', 'bindings'], '', fail);

  let duration: number | null = null;
  if (value.loop !== undefined) {
    if (!isRecord(value.loop)) fail('loop', 'must be an object like { "durationSeconds": 4 }');
    else {
      unknownKeys(value.loop, ['durationSeconds'], 'loop.', fail);
      if (isPositive(value.loop.durationSeconds)) duration = value.loop.durationSeconds;
      else fail('loop.durationSeconds', `must be a positive number, got ${describe(value.loop.durationSeconds)}`);
    }
  }

  if (!Array.isArray(value.bindings)) {
    fail('bindings', 'must be an array');
  } else {
    value.bindings.forEach((binding, index) => checkBinding(binding, `bindings[${index}]`, duration, fail));
  }

  if (issues.length > 0) throw new BindingError(issues);
  return value as unknown as BindingsDocument;
}

function checkBinding(
  binding: unknown,
  path: string,
  duration: number | null,
  fail: (path: string, message: string) => void,
) {
  if (!isRecord(binding)) return fail(path, 'must be an object with "from" and "to"');
  unknownKeys(binding, BINDING_KEYS, `${path}.`, fail);
  const unbounded = checkSource(binding.from, `${path}.from`, duration, fail);
  checkTarget(binding.to, `${path}.to`, fail);

  if (binding.range !== undefined) {
    if (unbounded) fail(`${path}.range`, 'a step track is unbounded and cannot be mapped to a range; use its stride');
    else if (!isPair(binding.range)) fail(`${path}.range`, 'must be [from, to], two finite numbers');
  }
  if (binding.easing !== undefined && !(EASINGS as readonly unknown[]).includes(binding.easing)) {
    fail(`${path}.easing`, `must be one of ${EASINGS.join(', ')}, got ${describe(binding.easing)}`);
  }
  if (binding.smoothing !== undefined && !(isFiniteNumber(binding.smoothing) && binding.smoothing >= 0)) {
    fail(`${path}.smoothing`, `must be a number of seconds ≥ 0, got ${describe(binding.smoothing)}`);
  }
  if (binding.mode !== undefined && !(BINDING_MODES as readonly unknown[]).includes(binding.mode)) {
    fail(`${path}.mode`, `must be "set" or "add", got ${describe(binding.mode)}`);
  }
  if (binding.clamp !== undefined && !(isPair(binding.clamp) && binding.clamp[0] <= binding.clamp[1])) {
    fail(`${path}.clamp`, 'must be [min, max], two finite numbers with min ≤ max');
  }
}

/** Returns whether the source is unbounded (a step track). */
function checkSource(
  source: unknown,
  path: string,
  duration: number | null,
  fail: (path: string, message: string) => void,
): boolean {
  if (!isRecord(source)) {
    fail(path, 'must be { "input": … } or { "track": … }');
    return false;
  }
  const hasInput = 'input' in source;
  const hasTrack = 'track' in source;
  if (hasInput === hasTrack) {
    fail(path, 'needs exactly one of "input" or "track"');
    return false;
  }
  if (hasInput) {
    unknownKeys(source, ['input'], `${path}.`, fail);
    if (typeof source.input !== 'string' || !isInputName(source.input)) {
      fail(`${path}.input`, `unknown input ${describe(source.input)}; expected one of ${INPUT_NAMES.join(', ')}`);
    }
    return false;
  }

  const kind = source.track;
  if (!(TIME_TRACK_KINDS as readonly unknown[]).includes(kind)) {
    fail(`${path}.track`, `unknown track ${describe(kind)}; expected one of ${TIME_TRACK_KINDS.join(', ')}`);
    return false;
  }
  const track = source as Record<string, unknown> & {
    track: TimeTrack['track'];
  };
  unknownKeys(track, TRACK_KEYS[track.track], `${path}.`, fail);
  if (duration === null) fail(path, 'time tracks need "loop": { "durationSeconds": … } in the document');

  switch (track.track) {
    case 'wave':
      if (track.cycles !== undefined && !(Number.isInteger(track.cycles) && (track.cycles as number) > 0)) {
        fail(`${path}.cycles`, `must be a whole number ≥ 1 so the loop closes, got ${describe(track.cycles)}`);
      }
      if (track.phase !== undefined && !isFiniteNumber(track.phase)) {
        fail(`${path}.phase`, `must be a number of loop turns, got ${describe(track.phase)}`);
      }
      return false;
    case 'step':
      if (!isPositive(track.fps)) {
        fail(`${path}.fps`, `must be a positive number, got ${describe(track.fps)}`);
      } else if (duration !== null && !isWhole(duration * track.fps)) {
        fail(
          `${path}.fps`,
          `loop.durationSeconds × fps = ${round(duration * track.fps)} steps; it must be whole so the loop closes`,
        );
      }
      if (track.stride !== undefined && !isFiniteNumber(track.stride)) {
        fail(`${path}.stride`, `must be a number, got ${describe(track.stride)}`);
      }
      return true;
    case 'pulse':
      if (!Array.isArray(track.at) || track.at.length === 0) {
        fail(`${path}.at`, 'must be a non-empty array of loop positions in [0, 1)');
      } else {
        track.at.forEach((start, index) => {
          if (!(isFiniteNumber(start) && start >= 0 && start < 1)) {
            fail(`${path}.at[${index}]`, `must be a loop position in [0, 1), got ${describe(start)}`);
          }
        });
      }
      if (!(isFiniteNumber(track.length) && track.length > 0 && track.length < 1)) {
        fail(`${path}.length`, `must be a window length in (0, 1) loop turns, got ${describe(track.length)}`);
      }
      return false;
  }
}

function checkTarget(target: unknown, path: string, fail: (path: string, message: string) => void) {
  if (!isRecord(target)) {
    return fail(
      path,
      'must be { "pass": n, "field" | "uniform": … }, { "plate": n, "transform": … } or { "parallax": … }',
    );
  }
  if ('parallax' in target) {
    unknownKeys(target, ['parallax'], `${path}.`, fail);
    if (!(PARALLAX_TRANSFORMS as readonly unknown[]).includes(target.parallax)) {
      fail(`${path}.parallax`, `must be one of ${PARALLAX_TRANSFORMS.join(', ')}, got ${describe(target.parallax)}`);
    }
    return;
  }
  if ('plate' in target) {
    unknownKeys(target, ['plate', 'transform'], `${path}.`, fail);
    if (!(Number.isInteger(target.plate) && (target.plate as number) >= 0)) {
      fail(`${path}.plate`, `must be a plate index (0 is the bottom plate), got ${describe(target.plate)}`);
    }
    if (!(PLATE_TRANSFORMS as readonly unknown[]).includes(target.transform)) {
      fail(`${path}.transform`, `must be one of ${PLATE_TRANSFORMS.join(', ')}, got ${describe(target.transform)}`);
    }
    return;
  }
  unknownKeys(target, ['pass', 'field', 'uniform', 'component'], `${path}.`, fail);
  if (!(Number.isInteger(target.pass) && (target.pass as number) >= 0)) {
    fail(`${path}.pass`, `must be a pass index (0, 1, …), got ${describe(target.pass)}`);
  }
  const hasField = 'field' in target;
  const hasUniform = 'uniform' in target;
  if (hasField === hasUniform) return fail(path, 'needs exactly one of "field" or "uniform"');
  if (hasField && !(typeof target.field === 'string' && target.field.length > 0)) {
    fail(`${path}.field`, 'must be a field name');
  }
  if (hasUniform && !(typeof target.uniform === 'string' && target.uniform.length > 0)) {
    fail(`${path}.uniform`, 'must be a uniform name');
  }
  if (target.component !== undefined) {
    if (hasField) fail(`${path}.component`, 'only applies to uniform targets');
    else if (
      !(Number.isInteger(target.component) && (target.component as number) >= 0 && (target.component as number) <= 3)
    ) {
      fail(`${path}.component`, `must be 0, 1, 2 or 3, got ${describe(target.component)}`);
    }
  }
}

export interface LiveChainOptions {
  readonly passes: readonly LivePass[];
  readonly context: EffectContext;
  /** A live package's plates, bottom first, with their parallax depth. Plate and parallax targets need them. */
  readonly plates?: readonly { readonly depth: number }[];
  /** A bindings document as plain JSON; validated here. */
  readonly bindings?: unknown;
  readonly registry?: EffectRegistry;
}

export interface LiveChain {
  /** The passes to draw. A pass with bindings is kept even when its authored amount is zero, since it may move. */
  readonly chain: readonly ChainPass[];
  /** Resolves bindings each frame into per-pass uniform overrides; nothing under reduced motion. */
  readonly frameUniforms: FrameUniforms;
  readonly document: BindingsDocument;
  /** Inputs some binding reads, so hosts can skip attaching listeners when there are none. */
  readonly inputs: readonly InputName[];
  readonly plates: PlateMotion;
}

/** Plate transforms from bindings (issue #394). */
export interface PlateMotion {
  /** Plates that some binding moves, bottom up; the others are composited as they are. */
  readonly moving: readonly number[];
  /** Each moving plate's transform this frame, by plate index; nothing under reduced motion. */
  readonly transforms: (frame: FrameState) => readonly (PlateTransform | undefined)[] | undefined;
}

interface ResolvedBinding {
  readonly binding: Binding;
  readonly value: (time: number, inputs: Readonly<Record<string, number>>) => number;
  readonly domain: readonly [number, number] | null;
  readonly ease: (t: number) => number;
  smoothed: { value: number; clock: number } | null;
}

interface BoundPass {
  readonly chainIndex: number;
  readonly pass: LivePass;
  readonly resting: UniformValues;
  readonly fields: readonly (ResolvedBinding & { readonly field: string })[];
  readonly uniforms: readonly (ResolvedBinding & {
    readonly uniform: string;
    readonly component?: number;
  })[];
}

/**
 * Builds the chain for authored passes and compiles their bindings, checking every target against the registry:
 * fields must be ones the effect reads, uniforms must be ones it declares. Throws `BindingError`.
 */
export function compileLiveChain(options: LiveChainOptions): LiveChain {
  const registry = options.registry ?? defaultRegistry;
  const { passes, context } = options;
  const document =
    options.bindings === undefined ? { version: 1 as const, bindings: [] } : parseBindings(options.bindings);
  const issues: string[] = [];

  passes.forEach((pass, index) => {
    if (!registry.has(pass.effect)) {
      issues.push(`passes[${index}].effect: unknown effect "${pass.effect}"; known: ${registry.ids().join(', ')}`);
    }
  });
  if (issues.length > 0) throw new BindingError(issues);

  const resting = passes.map((pass) => registry.uniforms(pass.effect, pass.layer, context));
  const plates = options.plates ?? [];
  document.bindings.forEach((binding, index) => {
    const path = `bindings[${index}].to`;
    const target = binding.to;
    if ('parallax' in target) {
      if (plates.length === 0) issues.push(`${path}.parallax: parallax moves plates; only a live package has plates`);
      return;
    }
    if ('plate' in target) {
      if (target.plate >= plates.length) {
        issues.push(
          plates.length === 0
            ? `${path}.plate: only a live package has plates`
            : `${path}.plate: there is no plate ${target.plate}; the package has ${plates.length} (0 is the bottom)`,
        );
      }
      return;
    }
    const pass = passes[target.pass];
    if (!pass) {
      issues.push(`${path}.pass: there is no pass ${target.pass}; the chain has ${passes.length}`);
      return;
    }
    const definition = registry.get(pass.effect)!;
    if ('field' in target) {
      if (!definition.fields.includes(target.field)) {
        issues.push(
          `${path}.field: ${pass.effect} has no field "${target.field}"; bindable fields: ${definition.fields.join(', ')}`,
        );
      }
      return;
    }
    const issue = uniformTargetIssue(target, pass.effect, resting[target.pass]);
    if (issue) issues.push(`${path}.${issue}`);
  });
  if (issues.length > 0) throw new BindingError(issues);

  const chain: ChainPass[] = [];
  const bound: BoundPass[] = [];
  passes.forEach((pass, passIndex) => {
    const bindings = document.bindings.filter(
      (binding): binding is Binding & { readonly to: FieldTarget | UniformTarget } =>
        'pass' in binding.to && binding.to.pass === passIndex,
    );
    const authored = registry.pass(pass.effect, pass.layer, context);
    if (!authored && bindings.length === 0) return;
    const chainIndex = chain.length;
    chain.push(authored ?? chainPass(registry.get(pass.effect)!, resting[passIndex]));
    if (bindings.length === 0) return;
    const fields: BoundPass['fields'][number][] = [];
    const uniforms: BoundPass['uniforms'][number][] = [];
    for (const binding of bindings) {
      const resolved = resolveBinding(binding);
      if ('field' in binding.to) fields.push({ ...resolved, field: binding.to.field });
      else uniforms.push({ ...resolved, uniform: binding.to.uniform, component: binding.to.component });
    }
    bound.push({ chainIndex, pass, resting: chain[chainIndex].uniforms, fields, uniforms });
  });

  const duration = document.loop?.durationSeconds ?? 0;
  const frameUniforms: FrameUniforms = (frame: FrameState) => {
    if (frame.reducedMotion || bound.length === 0) return undefined;
    const t = loopPosition(frame.time, duration);
    const inputs = { ...RESTING_INPUTS, ...frame.inputs };
    const overrides: (UniformValues | undefined)[] = new Array(chain.length);
    for (const entry of bound) {
      let uniforms: Record<string, UniformValue> = { ...entry.resting };
      if (entry.fields.length > 0) {
        const layer: Record<string, unknown> = { ...entry.pass.layer };
        for (const binding of entry.fields) {
          const current = layer[binding.field];
          layer[binding.field] = apply(binding, typeof current === 'number' ? current : 0, t, inputs, frame.clock);
        }
        uniforms = { ...registry.uniforms(entry.pass.effect, layer, context) };
      }
      for (const binding of entry.uniforms) {
        const current = uniforms[binding.uniform];
        if (binding.component === undefined) {
          uniforms[binding.uniform] = apply(binding, current as number, t, inputs, frame.clock);
        } else {
          const vector = [...(current as readonly number[])];
          vector[binding.component] = apply(binding, vector[binding.component], t, inputs, frame.clock);
          uniforms[binding.uniform] = vector;
        }
      }
      overrides[entry.chainIndex] = uniforms;
    }
    return overrides;
  };

  const inputs = [
    ...new Set(document.bindings.flatMap((binding) => ('input' in binding.from ? [binding.from.input] : []))),
  ];
  return { chain, frameUniforms, document, inputs, plates: plateMotion() };

  function plateMotion(): PlateMotion {
    const plateBindings = document.bindings.flatMap((binding): PlateBinding[] => {
      const to = binding.to;
      if ('plate' in to) return [{ resolved: resolveBinding(binding), plate: to.plate, transform: to.transform }];
      if ('parallax' in to) return [{ resolved: resolveBinding(binding), plate: null, transform: to.parallax }];
      return [];
    });
    const moving = plates.flatMap((plate, index) =>
      plateBindings.some((entry) => entry.plate === index || (entry.plate === null && plate.depth !== 0))
        ? [index]
        : [],
    );
    const transforms = (frame: FrameState) => {
      if (frame.reducedMotion || moving.length === 0) return undefined;
      const t = loopPosition(frame.time, duration);
      const inputs = { ...RESTING_INPUTS, ...frame.inputs };
      const result: Record<PlateTransformField, number>[] = plates.map(() => ({ ...NEUTRAL_PLATE_TRANSFORM }));
      // Each plate's own bindings in order, then every parallax contribution scaled by depth.
      for (const entry of plateBindings) {
        if (entry.plate === null) continue;
        const transform = result[entry.plate];
        transform[entry.transform] = apply(entry.resolved, transform[entry.transform], t, inputs, frame.clock);
      }
      for (const entry of plateBindings) {
        if (entry.plate !== null) continue;
        const value = apply(entry.resolved, 0, t, inputs, frame.clock);
        plates.forEach((plate, index) => {
          result[index][entry.transform] += value * plate.depth;
        });
      }
      return result;
    };
    return { moving, transforms };
  }

  function resolveBinding(binding: Binding): ResolvedBinding {
    const source = binding.from;
    const ease = EASING[binding.easing ?? 'linear'];
    if ('input' in source) {
      const value = (_t: number, inputs: Readonly<Record<string, number>>) =>
        inputs[source.input] ?? RESTING_INPUTS[source.input];
      return { binding, value, domain: INPUT_DOMAINS[source.input], ease, smoothed: null };
    }
    const value = (t: number) => evaluateTrack(source, t, duration);
    return { binding, value, domain: trackDomain(source.track), ease, smoothed: null };
  }
}

interface PlateBinding {
  readonly resolved: ResolvedBinding;
  /** `null` for a parallax binding, which moves every plate by its depth. */
  readonly plate: number | null;
  readonly transform: PlateTransformField;
}

/** Why a uniform target does not fit the pass's uniforms, or `null` when it does. */
function uniformTargetIssue(target: UniformTarget, effect: string, uniforms: UniformValues): string | null {
  const current = uniforms[target.uniform];
  if (current === undefined) {
    return target.uniform === 'uCenter'
      ? `uniform: ${effect} is not centred, so it has no uCenter`
      : `uniform: ${effect} has no uniform "${target.uniform}"; uniforms: ${Object.keys(uniforms).join(', ')}`;
  }
  if (typeof current === 'number') {
    return target.component === undefined ? null : `component: ${target.uniform} is a scalar; remove "component"`;
  }
  const vector = `${target.uniform} is a vec${current.length}`;
  if (target.component === undefined) return `component: ${vector}; say which component (0–${current.length - 1})`;
  if (target.component >= current.length) return `component: ${vector}; component ${target.component} is out of range`;
  return null;
}

/** One binding's target value for this frame, given the value the target has so far. */
function apply(
  resolved: ResolvedBinding,
  current: number,
  t: number,
  inputs: Readonly<Record<string, number>>,
  clock: number,
): number {
  const { binding, domain } = resolved;
  const raw = resolved.value(t, inputs);
  let mapped = raw;
  if (domain) {
    const [low, high] = domain;
    const [from, to] = binding.range ?? domain;
    const normalised = Math.min(1, Math.max(0, (raw - low) / (high - low)));
    mapped = from + (to - from) * resolved.ease(normalised);
  }
  const smoothing = binding.smoothing ?? 0;
  if (smoothing > 0) {
    const previous = resolved.smoothed;
    if (!previous) {
      resolved.smoothed = { value: mapped, clock };
    } else if (clock > previous.clock) {
      const blend = 1 - Math.exp(-(clock - previous.clock) / 1000 / smoothing);
      resolved.smoothed = {
        value: previous.value + (mapped - previous.value) * blend,
        clock,
      };
    }
    mapped = resolved.smoothed!.value;
  }
  const value = (binding.mode ?? 'set') === 'add' ? current + mapped : mapped;
  return binding.clamp ? Math.min(binding.clamp[1], Math.max(binding.clamp[0], value)) : value;
}

const EASING: Readonly<Record<Easing, (t: number) => number>> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t * t * (3 - 2 * t),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPair(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isWhole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-6;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  return JSON.stringify(value) ?? String(value);
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
  fail: (path: string, message: string) => void,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${prefix}${key}`, `unknown key; expected one of ${allowed.join(', ')}`);
  }
}
