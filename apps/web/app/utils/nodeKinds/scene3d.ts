import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId, withDefaults } from './types';

export interface GraphScene3DNode extends GraphNodeBase<'scene3d'> {
  /** Legacy direct environment reference. Prefer GraphEnvironmentNode connected to the env port. */
  environmentSrc: string;
  environmentName: string;
  environmentMime: string;
  environmentBytes: number;
  materialMode: 'original' | 'clay' | 'unlit';
  transparent: boolean;
  exposure: number;
  environmentStrength: number;
  environmentRotation: number;
  ambientIntensity: number;
  keyAzimuth: number;
  keyElevation: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
}

const SCENE3D_DEFAULTS = {
  environmentSrc: '',
  environmentName: '',
  environmentMime: '',
  environmentBytes: 0,
  materialMode: 'original',
  transparent: true,
  exposure: 100,
  environmentStrength: 100,
  environmentRotation: 0,
  ambientIntensity: 115,
  keyAzimuth: 38,
  keyElevation: 42,
  keyIntensity: 145,
  fillIntensity: 65,
  rimIntensity: 55,
} as const satisfies Omit<GraphScene3DNode, 'id' | 'name' | 'kind'>;

export function makeGraphScene3DNode(partial: Partial<Omit<GraphScene3DNode, 'kind'>> = {}): GraphScene3DNode {
  return { id: newGraphNodeId('scene3d'), name: '3D Scene', ...SCENE3D_DEFAULTS, ...partial, kind: 'scene3d' };
}

export const scene3dNodeModel: GraphNodeKindModel<GraphScene3DNode> = {
  kind: 'scene3d',
  label: '3D Scene',
  description: 'Renders imported models through camera, light, material, and environment settings.',
  make: makeGraphScene3DNode,
  normalize: (stored) => ({ ...withDefaults<GraphScene3DNode>(SCENE3D_DEFAULTS, stored), kind: 'scene3d' }),
  inputs: () => [
    { port: 'bg', role: 'primary', mode: 'render' },
    { port: 'model', role: 'side', mode: 'read' },
    { port: 'material', role: 'side', mode: 'material' },
    { port: 'env', role: 'side', mode: 'render' },
  ],
  insertion: () => ({ through: 'model' }),
  look: {
    canvasSymbol: '◌',
    accent: 'var(--node-kind-primitive)',
    edgeColor: 'oklch(72% 0.16 48)',
    layersIcon: '◌',
    layersLabel: '3d scene',
    inLayerAreas: false,
  },
  library: {
    intent: 'threeD',
    colorKind: 'primitive',
    resultLabel: 'Adds 3D scene',
    entry: {
      label: '3D Scene',
      symbol: '◌',
      description: 'Render imported models through scene camera, light, and environment controls.',
      group: 'primitive',
      surfaces: ['layers', 'nodes'],
      tags: ['scene', '3d', 'light'],
      keywords: '3d scene model hdri environment light lighting camera render glb ps1',
    },
  },
  renderSignature: (node) =>
    JSON.stringify([
      node.environmentSrc,
      node.environmentName,
      node.environmentMime,
      node.environmentBytes,
      node.materialMode,
      node.transparent,
      node.exposure,
      node.environmentStrength,
      node.environmentRotation,
      node.ambientIntensity,
      node.keyAzimuth,
      node.keyElevation,
      node.keyIntensity,
      node.fillIntensity,
      node.rimIntensity,
    ]),
};
