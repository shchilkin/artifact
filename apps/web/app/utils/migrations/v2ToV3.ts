import { AI_SHADER_PROMPT_MAX_LENGTH } from '@artifact/shared';
import type { ShaderInstance } from '../../types/config';
import { normalizeShaderPalette } from '../shaderPalette';
import { legacyAiShaderSpecToGlsl } from './legacyAiShaderGlsl';
import { isRecord, type StoredDocument } from './shared';

/**
 * Schema 2 -> 3: `customSpec` AI shaders become `aiShader` nodes, and their operation list is compiled once into a
 * GLSL `shaderInstance`.
 */
export function migrateV2ToV3(raw: StoredDocument): StoredDocument {
  if (!isRecord(raw.graph)) return { ...raw, schemaVersion: 3 };
  const graph = raw.graph;
  const shaderNodes = Array.isArray(graph.shaderNodes)
    ? graph.shaderNodes.filter(isRecord).map((node) => {
        const id = String(node.id ?? `shader-${Date.now()}`);
        const migratedInstance = migrateLegacyAiShaderInstance(node, id);
        const nodeFields = { ...node };
        delete nodeFields.customShaderSpec;
        return {
          ...nodeFields,
          shaderKind: node.shaderKind === 'customSpec' ? 'aiShader' : node.shaderKind,
          ...(migratedInstance ? { shaderInstance: migratedInstance } : {}),
        };
      })
    : [];
  return {
    ...raw,
    schemaVersion: 3,
    graph: { ...graph, shaderNodes },
  };
}

function migrateLegacyAiShaderInstance(node: Record<string, unknown>, id: string): ShaderInstance | undefined {
  if (node.shaderInstance || !isRecord(node.customShaderSpec)) return undefined;
  if (node.shaderKind !== 'customSpec' && node.shaderKind !== 'aiShader') return undefined;
  const spec = node.customShaderSpec;
  const prompt =
    typeof node.aiPrompt === 'string'
      ? node.aiPrompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH)
      : typeof spec.prompt === 'string'
        ? spec.prompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH)
        : undefined;
  const palette = normalizeShaderPalette('aiShader', spec.palette);
  const code = legacyAiShaderSpecToGlsl(spec, palette);
  return {
    definition: {
      version: 1,
      id: `${id}-migrated-definition`,
      label: typeof spec.label === 'string' && spec.label.trim() ? spec.label.slice(0, 80) : 'Migrated AI Shader',
      language: 'glsl-fragment',
      code,
      properties: [],
      provenance: { source: 'localFallback', prompt, model: 'legacy-operation-migration' },
    },
    values: {},
  };
}
