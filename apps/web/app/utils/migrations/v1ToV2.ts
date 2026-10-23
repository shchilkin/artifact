import { makeDefaultCodeShaderInstance } from '../customShaderCode';
import { isRecord, replacementShaderKind, type StoredDocument } from './shared';

/**
 * Schema 1 -> 2: shader nodes gain an explicit `role` (fill or effect), and legacy `customShaderCode` moves into a
 * `shaderInstance` definition.
 */
export function migrateV1ToV2(raw: StoredDocument): StoredDocument {
  if (!isRecord(raw.graph)) return { ...raw, schemaVersion: 2 };
  const graph = raw.graph;
  const edges = Array.isArray(graph.edges) ? graph.edges.filter(isRecord) : [];
  const shaderNodes = Array.isArray(graph.shaderNodes)
    ? graph.shaderNodes.filter(isRecord).map((node) => {
        const id = String(node.id ?? `shader-${Date.now()}`);
        const shaderKind = replacementShaderKind(node.shaderKind);
        const hasBackdrop = edges.some((edge) => edge.toId === id && edge.toPort === 'bg');
        const role =
          shaderKind === 'aiShader'
            ? 'effect'
            : node.role === 'effect' || node.role === 'fill'
              ? node.role
              : hasBackdrop
                ? 'effect'
                : 'fill';
        const { customShaderCode, ...nodeFields } = node;
        if (shaderKind !== 'customCode' || node.shaderInstance) return { ...nodeFields, role };
        const instance = makeDefaultCodeShaderInstance(id);
        const code =
          isRecord(customShaderCode) && typeof customShaderCode.code === 'string' ? customShaderCode.code : '';
        return {
          ...nodeFields,
          role,
          shaderInstance: {
            ...instance,
            definition: { ...instance.definition, code: code.slice(0, 12_000) },
          },
        };
      })
    : [];
  return {
    ...raw,
    schemaVersion: 2,
    graph: { ...graph, shaderNodes },
  };
}
