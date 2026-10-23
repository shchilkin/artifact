import { DEFAULT_EFFECT_LAYER_PROPS, EFFECT_PRESETS, type EffectLayer, type EffectPreset } from '../../types/config';
import { activeEffectPatchPresets, splitEffectPatchIntoPresetLayers } from './legacyEffectSplit';
import { isRecord, replacementShaderKind, type StoredDocument } from './shared';

/**
 * Schema 3 -> 4 collects the legacy fixes that `normalizeDocument` used to apply on every load:
 * - `kind: 'source'` layers take their real kind from `sourceType`;
 * - material fields stored as 0-100 percentages become 0-1 fractions;
 * - removed shader kinds map to their replacements (`staticMeshGradient` also drops its distortion);
 * - combined effect layers (legacy `warp`/`color`/`riso` presets, or one layer carrying several effects) split
 *   into focused preset layers, and the graph is rewired to the split layers.
 */
export function migrateV3ToV4(raw: StoredDocument): StoredDocument {
  const splitLayerIds = new Map<string, string[]>();
  const layers = Array.isArray(raw.layers)
    ? raw.layers.flatMap((layer): unknown[] => {
        if (!isRecord(layer)) return [layer];
        const migrated = migrateLayer(layer);
        if (migrated.kind !== 'effect') return [migrated];
        const effect = { ...DEFAULT_EFFECT_LAYER_PROPS, ...migrated } as Partial<EffectLayer>;
        if (!shouldSplitEffectLayer(effect)) return [migrated];
        const sourceId = String(migrated.id ?? 'effect');
        const parts = splitEffectPatchIntoPresetLayers(effect, { idPrefix: sourceId });
        splitLayerIds.set(
          sourceId,
          parts.map((part) => part.id),
        );
        return parts;
      })
    : raw.layers;

  return {
    ...raw,
    schemaVersion: 4,
    layers,
    ...(isRecord(raw.graph) ? { graph: rewireSplitEffectLayers(migrateGraph(raw.graph), splitLayerIds) } : {}),
  };
}

function migrateLayer(layer: Record<string, unknown>): Record<string, unknown> {
  if (layer.kind === 'source' && typeof layer.sourceType === 'string') return { ...layer, kind: layer.sourceType };
  if (layer.kind === 'primitive') return rescaleMaterialPercents(layer);
  return layer;
}

function migrateGraph(graph: Record<string, unknown>): Record<string, unknown> {
  return {
    ...graph,
    ...(Array.isArray(graph.materialNodes)
      ? { materialNodes: graph.materialNodes.map((node) => (isRecord(node) ? rescaleMaterialPercents(node) : node)) }
      : {}),
    ...(Array.isArray(graph.shaderNodes) ? { shaderNodes: graph.shaderNodes.map(migrateShaderNode) } : {}),
  };
}

function migrateShaderNode(node: unknown): unknown {
  if (!isRecord(node)) return node;
  return {
    ...node,
    shaderKind: replacementShaderKind(node.shaderKind),
    ...(node.shaderKind === 'staticMeshGradient' ? { distortion: 0 } : {}),
  };
}

const MATERIAL_PERCENT_FIELDS = [
  'materialMetalness',
  'materialRoughness',
  'materialClearcoat',
  'materialRelief',
  'materialGrain',
  'materialAnisotropy',
] as const;

function rescaleMaterialPercents(record: Record<string, unknown>): Record<string, unknown> {
  const patch = { ...record };
  for (const field of MATERIAL_PERCENT_FIELDS) {
    if (!(field in patch)) continue;
    const value = Number(patch[field]);
    if (Number.isFinite(value)) patch[field] = value > 1 ? value / 100 : value;
  }
  return patch;
}

const LEGACY_COMBINED_PRESETS = new Set(['warp', 'color', 'riso']);
const CODEC_BLOCK_PRESETS = new Set<string>([
  'badStream',
  'macroblocks',
  'detailBlocks',
  'blockSmear',
  'chromaBlocks',
  'blockDropout',
]);

function isFocusedPreset(value: unknown): value is EffectPreset {
  return typeof value === 'string' && value in EFFECT_PRESETS;
}

/** A layer splits when it uses a removed combined preset or carries fields that belong to another preset. */
export function shouldSplitEffectLayer(layer: Partial<EffectLayer>): boolean {
  if (LEGACY_COMBINED_PRESETS.has(String(layer.preset))) return true;
  const activePresets = activeEffectPatchPresets(layer);
  const preset = layer.preset;
  if (!isFocusedPreset(preset)) return activePresets.length > 0;
  return activePresets.some(
    (active) => active !== preset && !(CODEC_BLOCK_PRESETS.has(preset) && CODEC_BLOCK_PRESETS.has(active)),
  );
}

const SPLIT_LAYER_POSITION_STEP = 48;

interface StoredEdge extends Record<string, unknown> {
  fromId?: unknown;
  toId?: unknown;
}

/**
 * Replace each split layer in the graph with a chain of its parts so the stored edges, positions, and areas keep
 * pointing at real nodes. When nothing survives the split, connect the layer's input straight to its consumers.
 */
function rewireSplitEffectLayers(
  graph: Record<string, unknown>,
  splitLayerIds: ReadonlyMap<string, string[]>,
): Record<string, unknown> {
  if (splitLayerIds.size === 0) return graph;
  let edges: StoredEdge[] = Array.isArray(graph.edges) ? graph.edges.filter(isRecord) : [];
  const positions: Record<string, unknown> = isRecord(graph.positions) ? { ...graph.positions } : {};
  let areas = Array.isArray(graph.areas) ? graph.areas : undefined;

  for (const [sourceId, partIds] of splitLayerIds) {
    const incoming = edges.filter((edge) => edge.toId === sourceId);
    const outgoing = edges.filter((edge) => edge.fromId === sourceId);
    const untouched = edges.filter((edge) => edge.toId !== sourceId && edge.fromId !== sourceId);
    const first = partIds[0];
    const last = partIds[partIds.length - 1];

    if (first && last) {
      const chain = partIds.slice(1).map((toId, index) => ({
        id: `e-${partIds[index]}-${toId}`,
        fromId: partIds[index],
        fromPort: 'out',
        toId,
        toPort: 'in',
      }));
      edges = [
        ...untouched,
        ...incoming.map((edge) => ({ ...edge, toId: first })),
        ...chain,
        ...outgoing.map((edge) => ({ ...edge, fromId: last })),
      ];
    } else {
      const bridged = incoming.flatMap((input) =>
        outgoing.map((output) => ({ ...output, id: `e-${input.fromId}-${output.toId}`, fromId: input.fromId })),
      );
      edges = [...untouched, ...bridged];
    }

    const position = positions[sourceId];
    delete positions[sourceId];
    if (isRecord(position) && typeof position.x === 'number' && typeof position.y === 'number') {
      const { x, y } = position;
      partIds.forEach((id, index) => {
        positions[id] = { x: x + index * SPLIT_LAYER_POSITION_STEP, y: y + index * SPLIT_LAYER_POSITION_STEP };
      });
    }

    areas = areas?.map((area) =>
      isRecord(area) && Array.isArray(area.nodeIds) && area.nodeIds.includes(sourceId)
        ? { ...area, nodeIds: area.nodeIds.flatMap((id) => (id === sourceId ? partIds : [id])) }
        : area,
    );
  }

  return { ...graph, edges, positions, ...(areas ? { areas } : {}) };
}
