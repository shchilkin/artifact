import type {
  ArtifactRuntimeProject,
  EvaluatedMotionByLayer,
  MixedMediaMotionControl,
  MixedMediaMotionRecipe,
  MixedMediaMotionSource,
  MixedMediaMotionTrack,
  MixedMediaRecipeCompatibilityReport,
  MixedMediaRecipeIssue,
} from './types.js';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;
const EPSILON = 1e-9;
const TRANSFORM_CONTROLS = [
  'transform.translateX',
  'transform.translateY',
  'transform.rotate',
  'transform.scale',
  'transform.opacity',
] as const satisfies readonly MixedMediaMotionControl[];
const EMOJI_CONTROLS = ['emoji.phase', 'emoji.drift'] as const satisfies readonly MixedMediaMotionControl[];
const EFFECT_CONTROL_DESCRIPTORS = [
  { control: 'effect.chromaticAberration.intensity', preset: 'ca', property: 'ca' },
  { control: 'effect.glitch.intensity', preset: 'glitch', property: 'glitch' },
  { control: 'effect.grain.intensity', preset: 'grain', property: 'grain' },
  { control: 'effect.noiseWarp.intensity', preset: 'noiseWarp', property: 'noiseWarp' },
  { control: 'effect.scanlines.intensity', preset: 'scanlines', property: 'scanlines' },
  { control: 'effect.tear.intensity', preset: 'tear', property: 'tearAmt' },
  { control: 'effect.vortex.intensity', preset: 'vortex', property: 'vortex' },
] as const satisfies ReadonlyArray<{ control: MixedMediaMotionControl; preset: string; property: string }>;
const MOTION_CONTROLS = new Set<MixedMediaMotionControl>([
  ...TRANSFORM_CONTROLS,
  ...EMOJI_CONTROLS,
  ...EFFECT_CONTROL_DESCRIPTORS.map(({ control }) => control),
]);

type RuntimeLayer = Record<string, unknown> & { id: string; kind: string; preset?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeLayer(value: Record<string, unknown>): value is RuntimeLayer {
  return typeof value.id === 'string' && typeof value.kind === 'string';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function neutralValue(control: MixedMediaMotionControl): number {
  return control === 'transform.scale' || control === 'transform.opacity' || control.startsWith('effect.') ? 1 : 0;
}

export function supportedMotionControlsForLayer(layer: Record<string, unknown>): MixedMediaMotionControl[] {
  if (layer.kind === 'image') return [...TRANSFORM_CONTROLS];
  if (layer.kind === 'emoji') return [...EMOJI_CONTROLS];
  if (layer.kind === 'effect' && typeof layer.preset === 'string') {
    const descriptor = EFFECT_CONTROL_DESCRIPTORS.find(({ preset }) => preset === layer.preset);
    return descriptor ? [descriptor.control] : [];
  }
  return [];
}

function provenanceFor(recipe: unknown, actualSha256?: string) {
  const expectedSha256 =
    isRecord(recipe) && typeof recipe.compositionSha256 === 'string' ? recipe.compositionSha256 : '';
  const status = !actualSha256 ? 'unverified' : expectedSha256 === actualSha256 ? 'match' : 'mismatch';
  return { expectedSha256, actualSha256, status } as const;
}

function pushIssue(
  issues: MixedMediaRecipeIssue[],
  code: MixedMediaRecipeIssue['code'],
  message: string,
  trackId?: string,
) {
  issues.push({ code, message, ...(trackId ? { trackId } : {}) });
}

function validateSource(
  source: MixedMediaMotionSource,
  track: MixedMediaMotionTrack,
  recipe: MixedMediaMotionRecipe,
  issues: MixedMediaRecipeIssue[],
) {
  if (track.stepFps !== undefined && (!finite(track.stepFps) || track.stepFps <= 0)) {
    pushIssue(issues, 'invalid-source', `Track ${track.id} stepFps must be greater than zero.`, track.id);
  }
  if (source.type === 'keyframes') {
    let previous = -1;
    const valid =
      source.keyframes.length >= 2 &&
      source.keyframes.every(({ offset, value }) => {
        const itemValid =
          finite(offset) && offset >= 0 && offset <= 1 && offset > previous && finite(value) && Math.abs(value) <= 1;
        previous = offset;
        return itemValid;
      }) &&
      source.keyframes[0]?.offset === 0 &&
      source.keyframes.at(-1)?.offset === 1;
    if (!valid) {
      pushIssue(issues, 'invalid-source', `Track ${track.id} has invalid keyframes.`, track.id);
      return;
    }
    if (Math.abs(source.keyframes[0].value) > EPSILON) {
      pushIssue(issues, 'neutral-frame-violation', `Track ${track.id} must begin at source value zero.`, track.id);
    }
    if (recipe.timeline.mode === 'loop' && Math.abs(source.keyframes.at(-1)?.value ?? 1) > EPSILON) {
      pushIssue(issues, 'neutral-frame-violation', `Loop track ${track.id} must end at source value zero.`, track.id);
    }
    return;
  }

  if (!finite(source.frequencyHz) || source.frequencyHz <= 0) {
    pushIssue(issues, 'invalid-source', `Track ${track.id} frequencyHz must be greater than zero.`, track.id);
    return;
  }
  if (source.type === 'seeded-noise' && !Number.isSafeInteger(source.seed)) {
    pushIssue(issues, 'invalid-source', `Track ${track.id} noise seed must be a safe integer.`, track.id);
  }
  const cycles = source.frequencyHz * recipe.timeline.durationSeconds;
  if (recipe.timeline.mode === 'loop' && Math.abs(cycles - Math.round(cycles)) > EPSILON) {
    pushIssue(
      issues,
      'neutral-frame-violation',
      `Loop track ${track.id} must complete a whole number of cycles.`,
      track.id,
    );
  }
}

function validateTrackRange(track: MixedMediaMotionTrack, issues: MixedMediaRecipeIssue[]) {
  const { min, max } = track.range;
  if (!finite(min) || !finite(max) || min > max) {
    pushIssue(issues, 'invalid-range', `Track ${track.id} range must contain ordered finite values.`, track.id);
    return;
  }
  const midpoint = min + (max - min) / 2;
  if (Math.abs(midpoint - neutralValue(track.control)) > EPSILON) {
    pushIssue(
      issues,
      'neutral-frame-violation',
      `Track ${track.id} range midpoint must equal the neutral value for ${track.control}.`,
      track.id,
    );
  }
}

function hasTrackEnvelope(value: unknown): value is MixedMediaMotionTrack {
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.target)) return false;
  if (typeof value.target.layerId !== 'string' || typeof value.target.layerKind !== 'string') return false;
  if (typeof value.control !== 'string' || !MOTION_CONTROLS.has(value.control as MixedMediaMotionControl)) return false;
  if (!isRecord(value.range) || !isRecord(value.source)) return false;
  if (!finite(value.range.min) || !finite(value.range.max) || typeof value.source.type !== 'string') return false;
  if (!['keyframes', 'oscillator', 'seeded-noise'].includes(value.source.type)) return false;
  if (
    value.source.type === 'keyframes' &&
    (!Array.isArray(value.source.keyframes) ||
      !value.source.keyframes.every(
        (keyframe) => isRecord(keyframe) && finite(keyframe.offset) && finite(keyframe.value),
      ))
  ) {
    return false;
  }
  return true;
}

function baseRecipeIssues(value: unknown): MixedMediaRecipeIssue[] {
  const issues: MixedMediaRecipeIssue[] = [];
  if (!isRecord(value)) {
    pushIssue(issues, 'invalid-recipe', 'Artifact Runtime received an invalid motion recipe envelope.');
    return issues;
  }
  const recipe = value as unknown as MixedMediaMotionRecipe;
  if (recipe.kind !== 'artifact-motion-recipe' || recipe.schemaVersion !== 1 || !isRecord(recipe.timeline)) {
    pushIssue(issues, 'invalid-recipe', 'Artifact Runtime received an invalid motion recipe envelope.');
  }
  if (recipe.profile !== 'mixed-media-2d@1') {
    pushIssue(issues, 'unsupported-profile', `Runtime Profile ${String(recipe.profile)} is not supported.`);
  }
  if (!SHA_256_PATTERN.test(recipe.compositionSha256)) {
    pushIssue(issues, 'invalid-recipe', 'Motion recipe compositionSha256 must be a SHA-256 hex digest.');
  }
  if (!finite(recipe.timeline?.durationSeconds) || recipe.timeline.durationSeconds <= 0) {
    pushIssue(issues, 'invalid-recipe', 'Motion recipe durationSeconds must be greater than zero.');
  }
  if (recipe.timeline?.mode !== 'loop' && recipe.timeline?.mode !== 'once') {
    pushIssue(issues, 'invalid-recipe', 'Motion recipe temporal mode must be loop or once.');
  }
  if (!Array.isArray(recipe.tracks)) {
    pushIssue(issues, 'invalid-recipe', 'Motion recipe tracks must be an array.');
  } else {
    recipe.tracks.forEach((track, index) => {
      if (!hasTrackEnvelope(track)) {
        pushIssue(issues, 'invalid-recipe', `Motion recipe track at index ${index} has an invalid envelope.`);
      }
    });
  }
  return issues;
}

export function parseMixedMediaMotionRecipe(value: unknown): MixedMediaMotionRecipe {
  const issues = baseRecipeIssues(value);
  if (issues.length > 0) {
    throw new Error(
      `Artifact Runtime received an invalid Motion Recipe: ${issues.map((issue) => issue.message).join('; ')}`,
    );
  }
  return value as MixedMediaMotionRecipe;
}

export function analyzeMixedMediaMotionRecipe(
  project: ArtifactRuntimeProject,
  value: unknown,
  options: { compositionSha256?: string } = {},
): MixedMediaRecipeCompatibilityReport {
  const issues = baseRecipeIssues(value);
  if (issues.some((issue) => issue.code === 'invalid-recipe' || issue.code === 'unsupported-profile')) {
    return {
      compatible: false,
      issues,
      profile: 'mixed-media-2d@1',
      provenance: provenanceFor(value, options.compositionSha256),
    };
  }
  const recipe = value as MixedMediaMotionRecipe;

  const layers = project.document.layers.filter(isRuntimeLayer);
  const layersById = new Map(layers.map((layer) => [layer.id, layer]));
  const trackIds = new Set<string>();
  const targetControls = new Set<string>();
  for (const track of recipe.tracks) {
    if (trackIds.has(track.id))
      pushIssue(issues, 'duplicate-track-id', `Track ID ${track.id} is duplicated.`, track.id);
    trackIds.add(track.id);

    const layer = layersById.get(track.target.layerId);
    if (!layer) {
      pushIssue(issues, 'missing-layer', `Track ${track.id} targets missing layer ${track.target.layerId}.`, track.id);
      continue;
    }
    if (layer.kind !== track.target.layerKind) {
      pushIssue(
        issues,
        'wrong-layer-kind',
        `Track ${track.id} expects ${track.target.layerKind} but layer ${layer.id} is ${layer.kind}.`,
        track.id,
      );
    }
    if (!supportedMotionControlsForLayer(layer).includes(track.control)) {
      pushIssue(
        issues,
        'unsupported-control',
        `Layer ${layer.id} does not support Motion Control ${track.control} in mixed-media-2d@1.`,
        track.id,
      );
    }
    const targetControl = `${layer.id}:${track.control}`;
    if (targetControls.has(targetControl)) {
      pushIssue(
        issues,
        'duplicate-target-control',
        `Motion Control ${targetControl} is targeted more than once.`,
        track.id,
      );
    }
    targetControls.add(targetControl);
    validateTrackRange(track, issues);
    validateSource(track.source, track, recipe, issues);
  }

  return {
    compatible: issues.length === 0,
    issues,
    profile: 'mixed-media-2d@1',
    provenance: provenanceFor(recipe, options.compositionSha256),
  };
}

function interpolateKeyframes(source: Extract<MixedMediaMotionSource, { type: 'keyframes' }>, progress: number) {
  for (let index = 1; index < source.keyframes.length; index += 1) {
    const left = source.keyframes[index - 1];
    const right = source.keyframes[index];
    if (progress <= right.offset) {
      const local = (progress - left.offset) / (right.offset - left.offset);
      return left.value + (right.value - left.value) * local;
    }
  }
  return source.keyframes.at(-1)?.value ?? 0;
}

function hashNoise(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function evaluateSource(source: MixedMediaMotionSource, time: number, duration: number) {
  if (source.type === 'keyframes') return interpolateKeyframes(source, duration === 0 ? 0 : time / duration);
  if (source.type === 'oscillator') return Math.sin(Math.PI * 2 * source.frequencyHz * time);
  const position = source.frequencyHz * time;
  const leftIndex = Math.floor(position);
  const local = position - leftIndex;
  const cycleCount = Math.round(source.frequencyHz * duration);
  const left = leftIndex === 0 ? 0 : hashNoise(source.seed, leftIndex);
  const rightIndex = leftIndex + 1;
  const right = rightIndex >= cycleCount ? 0 : hashNoise(source.seed, rightIndex);
  const mix = smoothstep(local);
  return left + (right - left) * mix;
}

export function normalizeMixedMediaChoreographyTime(recipe: MixedMediaMotionRecipe, timeSeconds: number) {
  const duration = recipe.timeline.durationSeconds;
  if (recipe.timeline.mode === 'once') return Math.min(duration, Math.max(0, timeSeconds));
  return ((timeSeconds % duration) + duration) % duration;
}

function evaluateTrack(track: MixedMediaMotionTrack, recipe: MixedMediaMotionRecipe, timeSeconds: number) {
  let time = normalizeMixedMediaChoreographyTime(recipe, timeSeconds);
  if (track.stepFps && time > 0 && time < recipe.timeline.durationSeconds) {
    time = Math.floor(time * track.stepFps) / track.stepFps;
  }
  const sourceValue = evaluateSource(track.source, time, recipe.timeline.durationSeconds);
  return track.range.min + ((sourceValue + 1) / 2) * (track.range.max - track.range.min);
}

export function evaluateMixedMediaMotion(recipe: MixedMediaMotionRecipe, timeSeconds: number): EvaluatedMotionByLayer {
  const result: EvaluatedMotionByLayer = new Map();
  for (const track of recipe.tracks) {
    const controls = result.get(track.target.layerId) ?? {};
    controls[track.control] = evaluateTrack(track, recipe, timeSeconds);
    result.set(track.target.layerId, controls);
  }
  return result;
}

function number(value: unknown, fallback: number) {
  return finite(value) ? value : fallback;
}

function applyControls(layer: RuntimeLayer, controls: Partial<Record<MixedMediaMotionControl, number>>) {
  const result = { ...layer };
  result.x = number(layer.x, 0.5) + number(controls['transform.translateX'], 0);
  result.y = number(layer.y, 0.5) + number(controls['transform.translateY'], 0);
  result.rotation = number(layer.rotation, 0) + number(controls['transform.rotate'], 0);
  const scale = number(controls['transform.scale'], 1);
  result.scaleX = number(layer.scaleX, 1) * scale;
  result.scaleY = number(layer.scaleY, 1) * scale;
  result.opacity = Math.min(100, Math.max(0, number(layer.opacity, 100) * number(controls['transform.opacity'], 1)));
  if (controls['emoji.phase'] !== undefined) result.runtimeEmojiPhase = controls['emoji.phase'];
  if (controls['emoji.drift'] !== undefined) result.runtimeEmojiDrift = controls['emoji.drift'];
  for (const { control, property } of EFFECT_CONTROL_DESCRIPTORS) {
    const multiplier = controls[control];
    if (multiplier !== undefined) result[property] = number(layer[property], 0) * multiplier;
  }
  return result;
}

export function applyEvaluatedMotion(
  layers: Array<Record<string, unknown>>,
  evaluated: EvaluatedMotionByLayer,
): Array<Record<string, unknown>> {
  return layers.map((layer) => {
    if (!isRuntimeLayer(layer)) return { ...layer };
    const controls = evaluated.get(layer.id);
    return controls ? applyControls(layer, controls) : { ...layer };
  });
}
