import { describe, expect, it } from 'vitest';
import { migrateV1ToV2 } from './v1ToV2';

function shaderNodes(doc: Record<string, unknown>) {
  return (doc.graph as { shaderNodes: Record<string, unknown>[] }).shaderNodes;
}

describe('migrateV1ToV2', () => {
  it('only bumps the version when there is no graph', () => {
    expect(migrateV1ToV2({ layers: [] })).toEqual({ layers: [], schemaVersion: 2 });
  });

  it('infers shader roles from AI kinds, explicit roles, and backdrop edges', () => {
    const doc = migrateV1ToV2({
      graph: {
        edges: [{ id: 'e', fromId: 'src', fromPort: 'out', toId: 'with-backdrop', toPort: 'bg' }],
        shaderNodes: [
          { id: 'ai', shaderKind: 'customSpec' },
          { id: 'explicit', shaderKind: 'meshGradient', role: 'effect' },
          { id: 'with-backdrop', shaderKind: 'waves' },
          { id: 'plain', shaderKind: 'waves' },
        ],
      },
    });

    expect(shaderNodes(doc).map((node) => [node.id, node.role])).toEqual([
      ['ai', 'effect'],
      ['explicit', 'effect'],
      ['with-backdrop', 'effect'],
      ['plain', 'fill'],
    ]);
  });

  it('moves legacy custom shader code into a capped shader instance', () => {
    const doc = migrateV1ToV2({
      graph: {
        edges: [],
        shaderNodes: [{ id: 'code', shaderKind: 'customCode', customShaderCode: { code: 'x'.repeat(13_000) } }],
      },
    });

    const [node] = shaderNodes(doc);
    expect(node).not.toHaveProperty('customShaderCode');
    expect(node?.shaderInstance).toMatchObject({ definition: { id: 'code-definition', language: 'glsl-fragment' } });
    expect((node?.shaderInstance as { definition: { code: string } }).definition.code).toHaveLength(12_000);
  });

  it('keeps an existing shader instance', () => {
    const shaderInstance = { definition: { id: 'kept' }, values: {} };
    const doc = migrateV1ToV2({ graph: { shaderNodes: [{ id: 'code', shaderKind: 'customCode', shaderInstance }] } });
    expect(shaderNodes(doc)[0]?.shaderInstance).toBe(shaderInstance);
  });
});
