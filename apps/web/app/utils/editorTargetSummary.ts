import type { CanvasGraph, EffectLayer, GraphColorNode, GraphMergeNode, GraphRepeatNode, Layer } from '../types/config';
import { EFFECT_PRESETS } from '../types/config';
import { getLayerGuardrailState } from './editorGuardrails';
import { EXPORT_NODE_ID, resolveOutputPath } from './nodeGraph';

export type EditorTargetTone = 'accent' | 'muted' | 'warning' | 'success';
type EditorTargetSurface = 'layers' | 'nodes';
export type EditorTargetRole = 'source' | 'effect' | 'utility' | 'output';

export interface EditorTargetBadge {
  label: string;
  tone: EditorTargetTone;
}

export interface EditorTargetNote {
  text: string;
  tone: EditorTargetTone;
}

export interface EditorTargetSummary {
  title: string;
  eyebrow: string;
  role: EditorTargetRole;
  kindLabel: string;
  description: string;
  breadcrumbs: string[];
  badges: EditorTargetBadge[];
  notes: EditorTargetNote[];
}

interface LayerTargetOptions {
  graph?: CanvasGraph;
  layers?: Layer[];
  surface: EditorTargetSurface;
}

interface GraphTargetOptions {
  graph: CanvasGraph;
  surface: EditorTargetSurface;
}

const SOURCE_KINDS = new Set<Layer['kind']>(['fill', 'image', 'text', 'emoji', 'primitive', 'noise', 'array']);
const ROLE_BADGES: Record<EditorTargetRole, EditorTargetBadge> = {
  source: { label: 'Source', tone: 'success' },
  effect: { label: 'Effect', tone: 'accent' },
  utility: { label: 'Utility', tone: 'muted' },
  output: { label: 'Output', tone: 'accent' },
};

export function buildLayerTargetSummary(layer: Layer, options: LayerTargetOptions): EditorTargetSummary {
  const role = layer.kind === 'effect' ? 'effect' : SOURCE_KINDS.has(layer.kind) ? 'source' : 'utility';
  const kindLabel = getLayerKindLabel(layer);
  const badges: EditorTargetBadge[] = [ROLE_BADGES[role]];
  const notes: EditorTargetNote[] = [];
  const guardrail = getLayerGuardrailState(layer);

  if (layer.visible === false) {
    badges.push({ label: 'Hidden', tone: 'warning' });
    notes.push({
      text: 'Hidden targets remain editable, but do not render until visibility is restored.',
      tone: 'warning',
    });
  } else {
    badges.push({ label: 'Visible', tone: 'muted' });
  }

  if (guardrail.locked) {
    badges.push({ label: 'Locked', tone: 'warning' });
    if (guardrail.reason) notes.push({ text: guardrail.reason, tone: 'warning' });
  }

  addGraphStatus(badges, notes, layer.id, role, options.graph, options.surface);
  addLayerContextNotes(notes, layer, options);

  return {
    title: layer.name,
    eyebrow: `${capitalize(options.surface)} / ${capitalize(role)}`,
    role,
    kindLabel,
    description: getLayerDescription(layer),
    breadcrumbs: buildLayerBreadcrumbs(layer, options),
    badges,
    notes,
  };
}

export function buildGraphTargetSummary(
  target:
    | { kind: 'merge'; node: GraphMergeNode }
    | { kind: 'color'; node: GraphColorNode }
    | { kind: 'repeat'; node: GraphRepeatNode }
    | { kind: 'output' },
  options: GraphTargetOptions,
): EditorTargetSummary {
  if (target.kind === 'output') {
    const connected = hasExportInput(options.graph);
    return {
      title: 'Output',
      eyebrow: 'Nodes / Output',
      role: 'output',
      kindLabel: 'Final render target',
      description: 'Exports the connected graph branch. Select upstream nodes to edit the artwork feeding it.',
      breadcrumbs: ['Nodes', 'Output target', connected ? 'Connected branch' : 'Needs input'],
      badges: [
        { label: 'Final', tone: 'accent' },
        {
          label: connected ? 'Connected' : 'No input',
          tone: connected ? 'success' : 'warning',
        },
      ],
      notes: connected
        ? []
        : [{ text: 'Connect a source, effect, or utility branch to the output before export.', tone: 'warning' }],
    };
  }

  const id = target.node.id;
  const labels = {
    merge: ['Merge', 'Combines two upstream branches before sending pixels downstream.'],
    color: ['Color', 'Adjusts tone and color on its upstream branch.'],
    repeat: ['Repeat', 'Repeats an upstream source over an optional backdrop.'],
  } as const;
  const [kindLabel, description] = labels[target.kind];
  const badges: EditorTargetBadge[] = [{ label: 'Utility', tone: 'accent' }];
  const notes: EditorTargetNote[] = [];
  addGraphStatus(badges, notes, id, 'utility', options.graph, options.surface);
  notes.push({
    text: 'Graph-only utility nodes can be deleted or moved; durable locking is reserved for layer-backed targets in v0.28.',
    tone: 'muted',
  });

  return {
    title: target.node.name,
    eyebrow: 'Nodes / Utility',
    role: 'utility',
    kindLabel,
    description,
    breadcrumbs: buildGraphBreadcrumbs(id, options.graph),
    badges,
    notes,
  };
}

function getLayerKindLabel(layer: Layer): string {
  if (layer.kind !== 'effect') return capitalize(layer.kind);
  const preset = (layer as EffectLayer).preset;
  return preset ? (EFFECT_PRESETS[preset]?.name ?? preset) : 'Custom effect';
}

function getLayerDescription(layer: Layer): string {
  switch (layer.kind) {
    case 'effect':
      return 'Transforms the pixels below it. Move it in the stack or graph to change what it affects.';
    case 'image':
      return 'Creates image pixels from an uploaded, generated, or packaged source.';
    case 'text':
      return 'Creates editable type pixels with font, placement, and transform controls.';
    case 'fill':
      return 'Creates a flat color plate for the stack or graph branch.';
    case 'emoji':
      return 'Creates a seeded glyph scatter source.';
    case 'primitive':
      return 'Creates a rendered 3D source using the primitive camera state.';
    case 'noise':
      return 'Creates a procedural texture source from the document seed.';
    case 'array':
      return 'Creates a procedural motif source from the document seed.';
  }
}

function addGraphStatus(
  badges: EditorTargetBadge[],
  notes: EditorTargetNote[],
  nodeId: string,
  role: EditorTargetRole,
  graph: CanvasGraph | undefined,
  surface: EditorTargetSurface,
) {
  if (!graph) return;
  addConnectionBadges(badges, notes, nodeId, graph, role);
  const outputPath = resolveOutputPath(graph);
  if (outputPath.nodeIds.has(nodeId)) {
    badges.push({ label: 'On output path', tone: 'success' });
  } else if (surface === 'nodes') {
    badges.push({ label: 'Not in output', tone: 'warning' });
    notes.push({
      text: 'This target is editable, but it is not connected to the current output branch.',
      tone: 'warning',
    });
  }
}

function addLayerContextNotes(notes: EditorTargetNote[], layer: Layer, options: LayerTargetOptions) {
  const area = options.graph?.areas?.find((item) => item.nodeIds.includes(layer.id));
  if (area && options.surface === 'layers') {
    notes.push({
      text: `This layer is also grouped in the "${area.name}" graph area.`,
      tone: 'muted',
    });
  }
}

function buildLayerBreadcrumbs(layer: Layer, options: LayerTargetOptions): string[] {
  const crumbs = [capitalize(options.surface)];
  if (options.layers) {
    const index = options.layers.findIndex((item) => item.id === layer.id);
    if (index >= 0) crumbs.push(`Layer ${index + 1}/${options.layers.length}`);
  }

  const area = options.graph?.areas?.find((item) => item.nodeIds.includes(layer.id));
  if (area) crumbs.push(`Area: ${area.name}`);

  if (options.graph) {
    const outputPath = resolveOutputPath(options.graph);
    crumbs.push(outputPath.nodeIds.has(layer.id) ? 'Output path' : 'Off output path');
  }

  return crumbs;
}

function buildGraphBreadcrumbs(nodeId: string, graph: CanvasGraph): string[] {
  const crumbs = ['Nodes', 'Utility'];
  const area = graph.areas?.find((item) => item.nodeIds.includes(nodeId));
  if (area) crumbs.push(`Area: ${area.name}`);
  const outputPath = resolveOutputPath(graph);
  crumbs.push(outputPath.nodeIds.has(nodeId) ? 'Output path' : 'Off output path');
  return crumbs;
}

function addConnectionBadges(
  badges: EditorTargetBadge[],
  notes: EditorTargetNote[],
  nodeId: string,
  graph: CanvasGraph,
  role: EditorTargetRole,
) {
  const inputCount = graph.edges.filter((edge) => edge.toId === nodeId).length;
  const outputCount = graph.edges.filter((edge) => edge.fromId === nodeId).length;

  if (role === 'effect' && inputCount === 0) {
    badges.push({ label: 'No input', tone: 'warning' });
    notes.push({ text: 'Effects need an upstream source before they can change visible pixels.', tone: 'warning' });
  }

  if (role === 'utility' && inputCount === 0) {
    badges.push({ label: 'No input', tone: 'warning' });
    notes.push({
      text: 'Utility nodes need at least one upstream input before they can affect output.',
      tone: 'warning',
    });
  } else if (role === 'utility') {
    badges.push({ label: `${inputCount} input${inputCount === 1 ? '' : 's'}`, tone: 'muted' });
  }

  if ((role === 'effect' || role === 'utility') && outputCount === 0) {
    badges.push({ label: 'No output', tone: 'warning' });
  }
}

function hasExportInput(graph: CanvasGraph) {
  return graph.edges.some((edge) => edge.toId === EXPORT_NODE_ID && edge.toPort === 'in');
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
