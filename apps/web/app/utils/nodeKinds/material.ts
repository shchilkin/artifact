import {
  DEFAULT_MATERIAL_CONFIG,
  MATERIAL_PRESET_LABELS,
  MATERIAL_PRESETS,
  type MaterialConfig,
} from '../../types/config';
import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId } from './types';

export interface GraphMaterialNode extends GraphNodeBase<'material'>, MaterialConfig {}

export function makeGraphMaterialNode(partial: Partial<Omit<GraphMaterialNode, 'kind'>> = {}): GraphMaterialNode {
  const preset = partial.materialPreset ? MATERIAL_PRESETS[partial.materialPreset] : DEFAULT_MATERIAL_CONFIG;
  const name = partial.materialPreset ? MATERIAL_PRESET_LABELS[partial.materialPreset] : 'PBR Material';
  return { id: newGraphNodeId('material'), name, ...preset, ...partial, kind: 'material' };
}

const MATERIAL_FRACTION_FIELDS = [
  'materialMetalness',
  'materialRoughness',
  'materialClearcoat',
  'materialRelief',
  'materialGrain',
  'materialAnisotropy',
] as const;

/** Clamp the 0-1 material fractions on a material node or primitive layer. */
export function clampMaterialFractions<T extends Partial<MaterialConfig>>(value: T): T {
  const patch = { ...value };
  for (const field of MATERIAL_FRACTION_FIELDS) {
    if (!(field in patch)) continue;
    const parsed = Number(patch[field]);
    if (Number.isFinite(parsed)) patch[field] = Math.min(1, Math.max(0, parsed));
  }
  return patch;
}

export const materialNodeModel: GraphNodeKindModel<GraphMaterialNode> = {
  kind: 'material',
  label: 'Material',
  description: 'Defines a 3D surface for connected primitive nodes.',
  make: makeGraphMaterialNode,
  normalize: (stored) => makeGraphMaterialNode(clampMaterialFractions(stored as Partial<GraphMaterialNode>)),
  inputs: () => [{ port: 'albedo', role: 'primary', mode: 'render' }],
  insertion: () => 'material',
  look: {
    canvasSymbol: '◒',
    accent: 'var(--node-kind-primitive)',
    edgeColor: 'oklch(82% 0.14 78)',
    layersIcon: '◒',
    layersLabel: 'material',
  },
  library: {
    intent: 'threeD',
    colorKind: 'primitive',
    resultLabel: 'Adds material node',
  },
  renderSignature: (node) =>
    JSON.stringify([
      node.materialPreset,
      node.materialBaseColor,
      node.materialAccentColor,
      node.materialMetalness,
      node.materialRoughness,
      node.materialClearcoat,
      node.materialRelief,
      node.materialGrain,
      node.materialAnisotropy,
      node.materialAlbedoSrc ?? '',
      node.materialRoughnessSrc ?? '',
      node.materialMetalnessSrc ?? '',
      node.materialNormalSrc ?? '',
      node.materialAlphaSrc ?? '',
    ]),
};
