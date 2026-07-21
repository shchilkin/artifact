import type { ArtifactRuntimeProject, MotionRecipe, MotionTrack } from './types.js';

export function validateMotionRecipe(recipe: MotionRecipe, project: ArtifactRuntimeProject): void {
  if (recipe.version !== 1 || recipe.mode !== 'raster-base-effects') {
    throw new Error('Artifact Runtime received an unsupported motion recipe.');
  }
  if (!Number.isFinite(recipe.durationSeconds) || recipe.durationSeconds <= 0) {
    throw new Error('Motion recipe duration must be greater than zero.');
  }

  const layerIds = new Set(project.document.layers.map((layer) => layer.id));
  const effectLayerIds = new Set(
    project.document.layers.filter((layer) => layer.kind === 'effect').map((layer) => layer.id),
  );
  for (const track of recipe.tracks) {
    if (!layerIds.has(track.layerId)) {
      throw new Error(`Motion recipe targets missing layer ${track.layerId}.`);
    }
    if (!effectLayerIds.has(track.layerId)) {
      throw new Error(`Motion recipe targets unsupported non-effect layer ${track.layerId}.`);
    }
    validateTrack(track);
  }
}

function validateTrack(track: MotionTrack): void {
  if (track.keyframes.length < 2) {
    throw new Error(`Motion track ${track.layerId}.${track.property} needs at least two keyframes.`);
  }

  let previousOffset = -1;
  for (const keyframe of track.keyframes) {
    if (!Number.isFinite(keyframe.offset) || keyframe.offset < 0 || keyframe.offset > 1) {
      throw new Error('Motion keyframe offsets must be between zero and one.');
    }
    if (keyframe.offset <= previousOffset || !Number.isFinite(keyframe.value)) {
      throw new Error('Motion keyframes must be finite and ordered by unique offsets.');
    }
    previousOffset = keyframe.offset;
  }
  if (track.keyframes[0]?.offset !== 0 || track.keyframes.at(-1)?.offset !== 1) {
    throw new Error('Motion tracks must define matching loop endpoints at offsets zero and one.');
  }
  if (track.keyframes[0]?.value !== track.keyframes.at(-1)?.value) {
    throw new Error('Motion track loop endpoints must have equal values.');
  }
}

export function evaluateMotionTrack(track: MotionTrack, progress: number): number {
  const normalized = ((progress % 1) + 1) % 1;
  const keyframes = track.keyframes;
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index];
    const left = keyframes[index - 1];
    if (normalized <= right.offset) {
      const span = right.offset - left.offset;
      const localProgress = span === 0 ? 0 : (normalized - left.offset) / span;
      return left.value + (right.value - left.value) * localProgress;
    }
  }
  return keyframes.at(-1)?.value ?? 0;
}
