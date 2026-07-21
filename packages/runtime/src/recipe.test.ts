import { describe, expect, it } from 'vitest';
import { parseArtifactRuntimeProject } from './project.js';
import { evaluateMotionTrack, validateMotionRecipe } from './recipe.js';
import type { MotionRecipe, MotionTrack } from './types.js';

const project = parseArtifactRuntimeProject({
  artifactPackage: 'project',
  manifest: {
    kind: 'artifact-project-package',
    version: 1,
    documentSchemaVersion: 3,
  },
  document: {
    schemaVersion: 3,
    global: { seed: 42, aspect: '1:1' },
    layers: [
      { id: 'grain', kind: 'effect', grain: 20 },
      { id: 'title', kind: 'text', content: 'Artifact' },
    ],
  },
});

const track: MotionTrack = {
  layerId: 'grain',
  property: 'grain',
  keyframes: [
    { offset: 0, value: 8 },
    { offset: 0.5, value: 24 },
    { offset: 1, value: 8 },
  ],
};

describe('motion recipe', () => {
  it('evaluates deterministic linear values and wraps loop progress', () => {
    expect(evaluateMotionTrack(track, 0.25)).toBe(16);
    expect(evaluateMotionTrack(track, 0.75)).toBe(16);
    expect(evaluateMotionTrack(track, 1.25)).toBe(16);
  });

  it('validates stable layer IDs and matching endpoints', () => {
    const recipe: MotionRecipe = {
      version: 1,
      mode: 'raster-base-effects',
      durationSeconds: 8,
      tracks: [track],
    };
    expect(() => validateMotionRecipe(recipe, project)).not.toThrow();
    expect(() => validateMotionRecipe({ ...recipe, tracks: [{ ...track, layerId: 'missing' }] }, project)).toThrow(
      'missing layer',
    );
    expect(() => validateMotionRecipe({ ...recipe, tracks: [{ ...track, layerId: 'title' }] }, project)).toThrow(
      'non-effect layer',
    );
    expect(() =>
      validateMotionRecipe(
        {
          ...recipe,
          tracks: [
            {
              ...track,
              keyframes: [
                { offset: 0, value: 8 },
                { offset: 1, value: 9 },
              ],
            },
          ],
        },
        project,
      ),
    ).toThrow('loop endpoints');
  });

  it('does not mutate the source document during validation or evaluation', () => {
    const before = JSON.stringify(project);
    validateMotionRecipe({ version: 1, mode: 'raster-base-effects', durationSeconds: 8, tracks: [track] }, project);
    evaluateMotionTrack(track, 0.4);
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('portable project parsing', () => {
  it('rejects unsupported document schemas', () => {
    expect(() =>
      parseArtifactRuntimeProject({
        ...project,
        manifest: { ...project.manifest, documentSchemaVersion: 4 },
      }),
    ).toThrow('document schema 3');
  });
});
