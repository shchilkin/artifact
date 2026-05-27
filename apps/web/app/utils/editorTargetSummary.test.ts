import { describe, expect, it } from 'vitest';
import { makeEffectPresetLayer, makeFillLayer, makeTextLayer } from '../types/config';
import { buildGraphTargetSummary, buildLayerTargetSummary } from './editorTargetSummary';
import { EXPORT_NODE_ID } from './nodeGraph';

describe('editor target summaries', () => {
  it('labels visible source layers as editable sources', () => {
    const layer = makeTextLayer({ id: 'title', name: 'poster title' });

    expect(buildLayerTargetSummary(layer, { surface: 'layers' })).toMatchObject({
      title: 'poster title',
      eyebrow: 'Layers / Source',
      role: 'source',
      kindLabel: 'Text',
      badges: [
        { label: 'Source', tone: 'success' },
        { label: 'Visible', tone: 'muted' },
      ],
    });
  });

  it('labels hidden effect layers and effect preset names', () => {
    const layer = makeEffectPresetLayer('pixelate', { id: 'pix', name: 'pixel plate', visible: false });

    expect(buildLayerTargetSummary(layer, { surface: 'layers' })).toMatchObject({
      title: 'pixel plate',
      eyebrow: 'Layers / Effect',
      role: 'effect',
      kindLabel: 'Pixelate',
      badges: [
        { label: 'Effect', tone: 'accent' },
        { label: 'Hidden', tone: 'warning' },
      ],
      notes: [
        {
          text: 'Hidden targets remain editable, but do not render until visibility is restored.',
          tone: 'warning',
        },
      ],
    });
  });

  it('marks node targets that feed the graph output', () => {
    const layer = makeFillLayer({ id: 'fill', name: 'background' });
    const graph = {
      edges: [{ id: 'e-fill-export', fromId: 'fill', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    } as const;

    expect(buildLayerTargetSummary(layer, { surface: 'nodes', graph }).badges).toContainEqual({
      label: 'On output path',
      tone: 'success',
    });
  });

  it('warns when a selected node is outside the graph output path', () => {
    const layer = makeFillLayer({ id: 'orphan', name: 'orphan fill' });
    const graph = {
      edges: [{ id: 'e-other-export', fromId: 'other', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    } as const;

    expect(buildLayerTargetSummary(layer, { surface: 'nodes', graph }).badges).toContainEqual({
      label: 'Not in output',
      tone: 'warning',
    });
  });

  it('explains that layer-backed locks protect delete and layer-stack reorder', () => {
    const layer = makeFillLayer({ id: 'locked-fill', name: 'locked fill', locked: true });
    const summary = buildLayerTargetSummary(layer, { surface: 'nodes' });

    expect(summary.badges).toContainEqual({ label: 'Locked', tone: 'warning' });
    expect(summary.notes).toContainEqual({
      text: 'Locked layer targets are protected from delete actions and layer-stack reorder.',
      tone: 'warning',
    });
  });

  it('warns when an effect node has no upstream input', () => {
    const layer = makeEffectPresetLayer('grain', { id: 'grain', name: 'loose grain' });
    const graph = {
      edges: [],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    } as const;

    const summary = buildLayerTargetSummary(layer, { surface: 'nodes', graph });

    expect(summary.badges).toContainEqual({ label: 'No input', tone: 'warning' });
    expect(summary.notes).toContainEqual({
      text: 'Effects need an upstream source before they can change visible pixels.',
      tone: 'warning',
    });
  });

  it('deduplicates no-input status for utility graph targets', () => {
    const graph = {
      edges: [],
      positions: {},
      mergeNodes: [{ id: 'merge-a', name: 'Merge A', blendMode: 'source-over', opacity: 100 }],
      colorNodes: [],
    } as const;

    const summary = buildGraphTargetSummary({ kind: 'merge', node: graph.mergeNodes[0] }, { surface: 'nodes', graph });

    expect(summary.badges.filter((badge) => badge.label === 'No input')).toEqual([
      { label: 'No input', tone: 'warning' },
    ]);
    expect(
      summary.notes.filter(
        (note) => note.text === 'Utility nodes need at least one upstream input before they can affect output.',
      ),
    ).toEqual([
      {
        text: 'Utility nodes need at least one upstream input before they can affect output.',
        tone: 'warning',
      },
    ]);
  });

  it('shows output connection state for export target', () => {
    const graph = {
      edges: [],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    } as const;

    expect(buildGraphTargetSummary({ kind: 'output' }, { surface: 'nodes', graph }).badges).toContainEqual({
      label: 'No input',
      tone: 'warning',
    });
  });

  it('explains output targets without a graph input', () => {
    const graph = {
      edges: [],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    } as const;

    expect(buildGraphTargetSummary({ kind: 'output' }, { surface: 'nodes', graph }).notes).toContainEqual({
      text: 'Connect a source, effect, or utility branch to the output before export.',
      tone: 'warning',
    });
  });
});
