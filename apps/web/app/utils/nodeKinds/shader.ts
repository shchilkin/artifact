import { AI_SHADER_PROMPT_MAX_LENGTH, normalizeShaderInstance } from '@artifact/shared';
import {
  LEGACY_SHADER_KINDS,
  SHADER_KINDS,
  type ShaderInstance,
  type ShaderKind,
  type ShaderRole,
} from '../../types/config';
import { makeDefaultCodeShaderInstance } from '../customShaderCode';
import { defaultShaderPalette, normalizeShaderPalette } from '../shaderPalette';
import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId } from './types';

export interface GraphShaderNode extends GraphNodeBase<'shader'> {
  shaderKind: ShaderKind;
  role: ShaderRole;
  aiPrompt?: string;
  shaderInstance?: ShaderInstance;
  palette: string[];
  distortion: number;
  swirl: number;
  grain: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  seedOffset: number;
  opacity: number;
  blendMode: string;
}

/** Bumped when the shader pass changes its pixels for the same node settings, so caches re-render. */
const SHADER_PASS_RENDER_VERSION = 'shader-definition-instance-v4';

export function makeGraphShaderNode(partial: Partial<Omit<GraphShaderNode, 'kind'>> = {}): GraphShaderNode {
  const shaderKind = partial.shaderKind ?? 'meshGradient';
  const id = partial.id ?? newGraphNodeId('shader');
  const role = shaderKind === 'aiShader' ? 'effect' : (partial.role ?? 'fill');
  const defaultShaderInstance: ShaderInstance = {
    definition: {
      version: 1,
      id: `${id}-definition`,
      label: 'Code Shader',
      language: 'glsl-fragment',
      code: '',
      properties: [],
      provenance: { source: 'manual' },
    },
    values: {},
  };
  return {
    id,
    name: 'Shader',
    shaderKind,
    distortion: 56,
    swirl: 28,
    grain: 12,
    scale: 100,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    seedOffset: 0,
    opacity: 58,
    blendMode: 'screen',
    ...partial,
    kind: 'shader',
    role,
    ...(shaderKind === 'customCode'
      ? {
          shaderInstance: partial.shaderInstance
            ? {
                ...partial.shaderInstance,
                definition: { ...partial.shaderInstance.definition },
                values: { ...partial.shaderInstance.values },
              }
            : defaultShaderInstance,
        }
      : {}),
    palette: normalizeShaderPalette(shaderKind, partial.palette ?? defaultShaderPalette(shaderKind)),
  };
}

function isShaderKind(value: unknown): value is ShaderKind {
  return (
    typeof value === 'string' &&
    ((SHADER_KINDS as readonly string[]).includes(value) || (LEGACY_SHADER_KINDS as readonly string[]).includes(value))
  );
}

function shaderNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeShaderNode(node: Record<string, unknown> & { id: string }): GraphShaderNode {
  const shaderKind = isShaderKind(node.shaderKind) ? node.shaderKind : 'meshGradient';
  const { id } = node;
  const role =
    shaderKind === 'aiShader' ? 'effect' : node.role === 'effect' || node.role === 'fill' ? node.role : 'fill';
  const defaults = makeGraphShaderNode({ id, shaderKind, role });
  const normalizedInstance = normalizeShaderInstance(node.shaderInstance, `${id}-definition`);
  const shaderInstance =
    normalizedInstance ?? (shaderKind === 'customCode' ? makeDefaultCodeShaderInstance(id) : undefined);
  return makeGraphShaderNode({
    id,
    name: typeof node.name === 'string' ? node.name : defaults.name,
    shaderKind,
    role,
    palette: normalizeShaderPalette(shaderKind, node.palette),
    distortion: shaderNumber(node.distortion, defaults.distortion),
    swirl: shaderNumber(node.swirl, defaults.swirl),
    grain: shaderNumber(node.grain, defaults.grain),
    scale: shaderNumber(node.scale, defaults.scale),
    rotation: shaderNumber(node.rotation, defaults.rotation),
    offsetX: shaderNumber(node.offsetX, defaults.offsetX),
    offsetY: shaderNumber(node.offsetY, defaults.offsetY),
    seedOffset: shaderNumber(node.seedOffset, defaults.seedOffset),
    opacity: shaderNumber(node.opacity, defaults.opacity),
    blendMode: typeof node.blendMode === 'string' ? node.blendMode : defaults.blendMode,
    ...(shaderInstance ? { shaderInstance } : {}),
    aiPrompt: typeof node.aiPrompt === 'string' ? node.aiPrompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH) : undefined,
  });
}

/** Fill shaders create their own pixels; effect shaders (and code/AI shaders in the effect role) read `bg`. */
function shaderFollowsBackdrop(shader: GraphShaderNode): boolean {
  if (shader.shaderKind === 'customCode' || shader.shaderKind === 'aiShader') return shader.role === 'effect';
  return shader.role !== 'fill';
}

export const shaderNodeModel: GraphNodeKindModel<GraphShaderNode> = {
  kind: 'shader',
  label: 'Shader',
  description: 'Generates a procedural pixel source or pass for artwork branches and material texture inputs.',
  make: makeGraphShaderNode,
  normalize: normalizeShaderNode,
  // A fill shader ignores image inputs, so switching to fill drops its backdrop edge.
  afterUpdate: (graph, node, patch) =>
    patch.role === 'fill'
      ? { ...graph, edges: graph.edges.filter((edge) => edge.toId !== node.id || edge.toPort !== 'bg') }
      : graph,
  inputs: (node) => (shaderFollowsBackdrop(node) ? [{ port: 'bg', role: 'primary', mode: 'render' }] : []),
  insertion: (node) => (node.role === 'effect' ? { through: 'bg' } : 'source'),
  look: { canvasSymbol: '◉', accent: 'var(--node-kind-noise)', layersIcon: '◉', layersLabel: 'shader' },
  library: {
    intent: 'sources',
    colorKind: 'noise',
    resultLabel: 'Adds shader fill',
  },
  renderSignature: (node) => {
    const shaderInstanceRenderState = node.shaderInstance
      ? [node.shaderInstance.definition.code, node.shaderInstance.definition.properties, node.shaderInstance.values]
      : null;
    return JSON.stringify([
      SHADER_PASS_RENDER_VERSION,
      node.shaderKind,
      node.role,
      node.palette,
      node.distortion,
      node.swirl,
      node.grain,
      node.scale,
      node.rotation,
      node.offsetX,
      node.offsetY,
      node.seedOffset,
      node.opacity,
      node.blendMode,
      shaderInstanceRenderState,
    ]);
  },
};
