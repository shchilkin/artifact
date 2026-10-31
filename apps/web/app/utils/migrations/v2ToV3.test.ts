import { describe, expect, it } from 'vitest';
import { migrateV2ToV3 } from './v2ToV3';

function shaderNodes(doc: Record<string, unknown>) {
  return (doc.graph as { shaderNodes: Record<string, unknown>[] }).shaderNodes;
}

const LEGACY_SPEC = {
  label: 'Acid Bloom',
  prompt: 'acid bloom over the photo',
  palette: ['#0b0016', '#ff3df2', '#f6ff6b'],
  base: 0.4,
  contrast: 1.6,
  operations: [
    { op: 'noise', scale: 5, amount: 0.4, octaves: 5, seedOffset: 12 },
    { op: 'wave', frequency: 9, amplitude: 0.3, angle: 45, phase: 1 },
    { op: 'chromaticShift', amount: 0.5, angle: 30 },
    { op: 'posterize', steps: 99 },
    { op: 'unknownOp' },
  ],
};

describe('migrateV2ToV3', () => {
  it('compiles a legacy AI shader spec into a GLSL shader instance', async () => {
    const doc = migrateV2ToV3({
      graph: { shaderNodes: [{ id: 'ai', shaderKind: 'customSpec', role: 'effect', customShaderSpec: LEGACY_SPEC }] },
    });

    const [node] = shaderNodes(doc);
    expect(doc.schemaVersion).toBe(3);
    expect(node?.shaderKind).toBe('aiShader');
    expect(node).not.toHaveProperty('customShaderSpec');
    const instance = node?.shaderInstance as {
      definition: { id: string; label: string; code: string; provenance: Record<string, unknown> };
    };
    expect(instance.definition).toMatchObject({
      id: 'ai-migrated-definition',
      label: 'Acid Bloom',
      provenance: { source: 'localFallback', prompt: 'acid bloom over the photo' },
    });
    // Migrated documents must keep rendering the same shader, so the generated code is pinned byte for byte.
    await expect(instance.definition.code).toMatchFileSnapshot('./__snapshots__/legacyAiShader.glsl');
  });

  it('leaves nodes that already have a shader instance alone', () => {
    const shaderInstance = { definition: { id: 'kept' }, values: {} };
    const doc = migrateV2ToV3({
      graph: { shaderNodes: [{ id: 'ai', shaderKind: 'aiShader', customShaderSpec: LEGACY_SPEC, shaderInstance }] },
    });
    expect(shaderNodes(doc)[0]?.shaderInstance).toBe(shaderInstance);
  });
});
