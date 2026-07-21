import { describe, expect, it } from 'vitest';
import {
  analyzeMixedMediaMotionRecipe,
  applyEvaluatedMotion,
  evaluateMixedMediaMotion,
  parseMixedMediaMotionRecipe,
  supportedMotionControlsForLayer,
} from './motion.js';
import type { ArtifactRuntimeProject, MixedMediaMotionRecipe } from './types.js';

function project(): ArtifactRuntimeProject {
  return {
    artifactPackage: 'project',
    manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
    document: {
      schemaVersion: 3,
      global: { seed: 42, aspect: '1:1' },
      layers: [
        { id: 'hero', kind: 'image', x: 0.5, y: 0.5, rotation: 4, scaleX: 1.2, scaleY: 1.1, opacity: 80 },
        { id: 'emoji', kind: 'emoji', seedOffset: 3 },
        { id: 'grain', kind: 'effect', preset: 'grain', grain: 40 },
      ],
    },
  };
}

function recipe(): MixedMediaMotionRecipe {
  return {
    kind: 'artifact-motion-recipe',
    schemaVersion: 1,
    profile: 'mixed-media-2d@1',
    compositionSha256: 'a'.repeat(64),
    timeline: { durationSeconds: 4, mode: 'loop' },
    tracks: [
      {
        id: 'hero-x',
        target: { layerId: 'hero', layerKind: 'image' },
        control: 'transform.translateX',
        source: { type: 'oscillator', frequencyHz: 0.25 },
        range: { min: -0.02, max: 0.02 },
      },
      {
        id: 'emoji-drift',
        target: { layerId: 'emoji', layerKind: 'emoji' },
        control: 'emoji.drift',
        source: { type: 'seeded-noise', seed: 99, frequencyHz: 1 },
        range: { min: -0.03, max: 0.03 },
      },
      {
        id: 'grain-pulse',
        target: { layerId: 'grain', layerKind: 'effect' },
        control: 'effect.grain.intensity',
        source: {
          type: 'keyframes',
          keyframes: [
            { offset: 0, value: 0 },
            { offset: 0.5, value: 1 },
            { offset: 1, value: 0 },
          ],
        },
        range: { min: 0.8, max: 1.2 },
      },
    ],
  };
}

describe('mixed-media-2d@1 motion recipe', () => {
  it('parses sidecars through the same canonical envelope validation used by compatibility analysis', () => {
    expect(parseMixedMediaMotionRecipe(recipe())).toEqual(recipe());
    expect(() => parseMixedMediaMotionRecipe({ ...recipe(), tracks: [{ id: 'broken' }] })).toThrow(
      'track at index 0 has an invalid envelope',
    );
  });

  it('reports malformed sidecar envelopes instead of executing or throwing through invalid values', () => {
    const malformed = analyzeMixedMediaMotionRecipe(project(), {
      kind: 'artifact-motion-recipe',
      schemaVersion: 1,
      profile: 'mixed-media-2d@1',
      compositionSha256: 'not-a-digest',
      timeline: { durationSeconds: 0, mode: 'forever' },
      tracks: [{ id: 'broken', source: { type: 'callback' } }],
    });
    const nonObject = analyzeMixedMediaMotionRecipe(project(), null);
    const malformedKeyframe = analyzeMixedMediaMotionRecipe(project(), {
      ...recipe(),
      tracks: [{ ...recipe().tracks[0], source: { type: 'keyframes', keyframes: [null, { offset: 1, value: 0 }] } }],
    });

    expect(malformed.compatible).toBe(false);
    expect(malformed.issues.map((issue) => issue.code)).toEqual([
      'invalid-recipe',
      'invalid-recipe',
      'invalid-recipe',
      'invalid-recipe',
    ]);
    expect(nonObject.issues).toEqual([
      { code: 'invalid-recipe', message: 'Artifact Runtime received an invalid motion recipe envelope.' },
    ]);
    expect(malformedKeyframe.issues).toEqual([
      { code: 'invalid-recipe', message: 'Motion recipe track at index 0 has an invalid envelope.' },
    ]);
  });

  it('accepts semantic compatibility while reporting provenance mismatch without rejecting it', () => {
    const result = analyzeMixedMediaMotionRecipe(project(), recipe(), { compositionSha256: 'b'.repeat(64) });

    expect(result.compatible).toBe(true);
    expect(result.provenance).toEqual({
      expectedSha256: 'a'.repeat(64),
      actualSha256: 'b'.repeat(64),
      status: 'mismatch',
    });
    expect(result.issues).toEqual([]);
  });

  it('rejects missing layers, wrong kinds, unsupported controls, and duplicate stable track IDs', () => {
    const value = recipe();
    value.tracks = [
      { ...value.tracks[0], target: { layerId: 'missing', layerKind: 'image' } },
      { ...value.tracks[1], id: 'hero-x', target: { layerId: 'hero', layerKind: 'emoji' } },
      { ...value.tracks[2], control: 'effect.tear.intensity' },
    ];

    const result = analyzeMixedMediaMotionRecipe(project(), value);
    expect(result.compatible).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'missing-layer',
      'duplicate-track-id',
      'wrong-layer-kind',
      'unsupported-control',
      'unsupported-control',
    ]);
  });

  it('evaluates Keyframes, Oscillator, and Seeded Noise deterministically', () => {
    const value = recipe();
    const first = evaluateMixedMediaMotion(value, 1.25);
    const second = evaluateMixedMediaMotion(value, 1.25);

    expect(first).toEqual(second);
    expect(first.get('hero')?.['transform.translateX']).toBeCloseTo(0.0184775906, 8);
    expect(first.get('grain')?.['effect.grain.intensity']).toBeCloseTo(1.125, 8);
    expect(first.get('emoji')?.['emoji.drift']).toBeGreaterThanOrEqual(-0.03);
    expect(first.get('emoji')?.['emoji.drift']).toBeLessThanOrEqual(0.03);
  });

  it('keeps the Neutral Frame at zero and makes the loop boundary identical', () => {
    const value = recipe();
    expect(evaluateMixedMediaMotion(value, 0)).toEqual(evaluateMixedMediaMotion(value, 4));
    expect(evaluateMixedMediaMotion(value, 0)).toEqual(
      new Map([
        ['hero', { 'transform.translateX': 0 }],
        ['emoji', { 'emoji.drift': 0 }],
        ['grain', { 'effect.grain.intensity': 1 }],
      ]),
    );
  });

  it('quantizes an authored source without changing the continuous timeline contract', () => {
    const value = recipe();
    value.tracks[0] = { ...value.tracks[0], stepFps: 2 };
    expect(evaluateMixedMediaMotion(value, 0.74).get('hero')).toEqual(
      evaluateMixedMediaMotion(value, 0.51).get('hero'),
    );
  });

  it('applies relative controls to immutable authored baselines', () => {
    const source = project().document.layers;
    const before = JSON.stringify(source);
    const evaluated = new Map([
      [
        'hero',
        {
          'transform.translateX': 0.02,
          'transform.translateY': -0.01,
          'transform.rotate': 2,
          'transform.scale': 1.1,
          'transform.opacity': 0.5,
        },
      ],
      ['grain', { 'effect.grain.intensity': 1.25 }],
      ['emoji', { 'emoji.phase': 0.2, 'emoji.drift': 0.03 }],
    ]);

    const result = applyEvaluatedMotion(source, evaluated);
    const hero = result.find((layer) => layer.id === 'hero');
    expect(hero).toMatchObject({
      x: 0.52,
      y: 0.49,
      rotation: 6,
      scaleX: 1.32,
      opacity: 40,
    });
    expect(hero?.scaleY).toBeCloseTo(1.21, 12);
    expect(result.find((layer) => layer.id === 'grain')).toMatchObject({ grain: 50 });
    expect(result.find((layer) => layer.id === 'emoji')).toMatchObject({
      runtimeEmojiPhase: 0.2,
      runtimeEmojiDrift: 0.03,
    });
    expect(JSON.stringify(source)).toBe(before);
  });

  it('advertises only the controls faithfully supported for each retained Viber layer kind', () => {
    expect(supportedMotionControlsForLayer({ id: 'image', kind: 'image' })).toEqual([
      'transform.translateX',
      'transform.translateY',
      'transform.rotate',
      'transform.scale',
      'transform.opacity',
    ]);
    expect(supportedMotionControlsForLayer({ id: 'tear', kind: 'effect', preset: 'tear' })).toEqual([
      'effect.tear.intensity',
    ]);
    expect(supportedMotionControlsForLayer({ id: 'primitive', kind: 'primitive' })).toEqual([]);
  });
});
