import type {
  CanvasGraph,
  GraphColorNode,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphTransformNode,
  ImageLayer,
  Layer,
} from '../../../types/config';
import { buildGraphTargetSummary, buildLayerTargetSummary } from '../../../utils/editorTargetSummary';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { AiGenerationPanel } from '../../AiGenerationPanel';
import { EditorTargetHeader } from '../../editor-target/EditorTargetHeader';
import {
  ColorInspector,
  ExportInspector,
  GrimeShadowInspector,
  LayerInspector,
  MaskInspector,
  MergeInspector,
  RepeatInspector,
  TransformInspector,
} from '../inspector';
import type { NodeCanvasProps } from '../types';

interface NodePropertiesPanelProps
  extends Pick<
    NodeCanvasProps,
    | 'doc'
    | 'exportBusy'
    | 'onUpdateLayer'
    | 'onUpdateMergeNode'
    | 'onUpdateColorNode'
    | 'onUpdateRepeatNode'
    | 'onUpdateMaskNode'
    | 'onUpdateTransformNode'
    | 'onUpdateGrimeShadowNode'
    | 'onUpdateExportConfig'
    | 'onUpdateAspectRatio'
    | 'onExport'
  > {
  open: boolean;
  selectedNodeId: string | null;
  graph: CanvasGraph;
  onClose: () => void;
}

type SelectedNodeTarget =
  | { kind: 'layer'; layer: Layer }
  | { kind: 'color'; node: GraphColorNode }
  | { kind: 'merge'; node: GraphMergeNode }
  | { kind: 'repeat'; node: GraphRepeatNode }
  | { kind: 'mask'; node: GraphMaskNode }
  | { kind: 'transform'; node: GraphTransformNode }
  | { kind: 'grimeShadow'; node: GraphGrimeShadowNode }
  | { kind: 'output' };

function appendAiGenerationVariant(
  layer: ImageLayer,
  src: string,
  aiGeneration: NonNullable<ImageLayer['aiGeneration']>,
): Partial<ImageLayer> {
  const existing = getAiGenerationHistorySeed(layer);
  const nextVariant = { src, aiGeneration };
  const nextHistory = [...existing.filter((item) => isDifferentAiVariant(item, src, aiGeneration.jobId)), nextVariant];
  return {
    src,
    aiGeneration,
    aiGenerationHistory: nextHistory,
    aiGenerationHistoryIndex: nextHistory.length - 1,
  };
}

function getAiGenerationHistorySeed(layer: ImageLayer): NonNullable<ImageLayer['aiGenerationHistory']> {
  const history = layer.aiGenerationHistory;
  if (hasAiGenerationHistory(history)) return history;
  if (!layer.src) return [];
  if (!layer.aiGeneration) return [];
  return [{ src: layer.src, aiGeneration: layer.aiGeneration }];
}

function hasAiGenerationHistory(
  history: ImageLayer['aiGenerationHistory'],
): history is NonNullable<ImageLayer['aiGenerationHistory']> {
  return Boolean(history?.length);
}

function isDifferentAiVariant(
  item: NonNullable<ImageLayer['aiGenerationHistory']>[number],
  src: string,
  jobId: string,
) {
  return item.src !== src ? true : item.aiGeneration.jobId !== jobId;
}

function seedCurrentAiGenerationVariant(layer: ImageLayer): Partial<ImageLayer> {
  if (!shouldSeedCurrentAiGenerationVariant(layer)) return {};
  return {
    aiGenerationHistory: [{ src: layer.src, aiGeneration: layer.aiGeneration }],
    aiGenerationHistoryIndex: 0,
  };
}

function shouldSeedCurrentAiGenerationVariant(layer: ImageLayer) {
  if (layer.aiGenerationHistory?.length) return false;
  if (!layer.src) return false;
  return Boolean(layer.aiGeneration);
}

function selectAiGenerationVariant(layer: ImageLayer, index: number): Partial<ImageLayer> | null {
  const history = layer.aiGenerationHistory ?? [];
  const nextIndex = Math.min(Math.max(index, 0), history.length - 1);
  const selected = history[nextIndex];
  if (!selected) return null;
  return {
    src: selected.src,
    aiGeneration: selected.aiGeneration,
    aiGenerationHistoryIndex: nextIndex,
  };
}

function findLayerTarget(
  doc: NodePropertiesPanelProps['doc'],
  selectedNodeId: string | null,
): SelectedNodeTarget | null {
  const layer = selectedNodeId ? (doc.layers.find((item) => item.id === selectedNodeId) ?? null) : null;
  return layer ? { kind: 'layer', layer } : null;
}

function findGraphNodeTarget(graph: CanvasGraph, selectedNodeId: string | null): SelectedNodeTarget | null {
  const graphNodeId = getGraphNodeSearchId(selectedNodeId);
  return graphNodeId ? findFirstGraphNodeTarget(graph, graphNodeId) : null;
}

function getGraphNodeSearchId(selectedNodeId: string | null) {
  if (!selectedNodeId) return null;
  if (selectedNodeId === EXPORT_NODE_ID) return null;
  return selectedNodeId;
}

function findFirstGraphNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  return (
    findColorNodeTarget(graph, selectedNodeId) ??
    findMergeNodeTarget(graph, selectedNodeId) ??
    findRepeatNodeTarget(graph, selectedNodeId) ??
    findMaskNodeTarget(graph, selectedNodeId) ??
    findTransformNodeTarget(graph, selectedNodeId) ??
    findGrimeShadowNodeTarget(graph, selectedNodeId)
  );
}

function findColorNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.colorNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'color', node } : null;
}

function findMergeNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = graph.mergeNodes.find((item) => item.id === selectedNodeId);
  return node ? { kind: 'merge', node } : null;
}

function findRepeatNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.repeatNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'repeat', node } : null;
}

function findMaskNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.maskNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'mask', node } : null;
}

function findTransformNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.transformNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'transform', node } : null;
}

function findGrimeShadowNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.grimeShadowNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'grimeShadow', node } : null;
}

function resolveSelectedNodeTarget(
  doc: NodePropertiesPanelProps['doc'],
  graph: CanvasGraph,
  selectedNodeId: string | null,
): SelectedNodeTarget | null {
  return (
    findLayerTarget(doc, selectedNodeId) ??
    findGraphNodeTarget(graph, selectedNodeId) ??
    (selectedNodeId === EXPORT_NODE_ID ? { kind: 'output' } : null)
  );
}

function buildSelectedTargetSummary(
  target: SelectedNodeTarget | null,
  doc: NodePropertiesPanelProps['doc'],
  graph: CanvasGraph,
) {
  if (!target) return null;
  if (target.kind === 'layer') {
    return buildLayerTargetSummary(target.layer, {
      surface: 'nodes',
      graph,
      layers: doc.layers,
    });
  }
  if (target.kind === 'output') return buildGraphTargetSummary({ kind: 'output' }, { surface: 'nodes', graph });
  return buildGraphTargetSummary(target, { surface: 'nodes', graph });
}

function LayerNodeInspector({
  layer,
  doc,
  onUpdateLayer,
}: Pick<NodePropertiesPanelProps, 'doc' | 'onUpdateLayer'> & {
  layer: Layer;
}) {
  return (
    <>
      {layer.kind === 'image' && (
        <div className="node-ai-generation-section">
          <div className="node-ai-generation-heading">
            <span>Generate</span>
            <span>Account gated</span>
          </div>
          <AiGenerationPanel
            aspect={doc.global.aspect}
            generation={layer.aiGeneration}
            generationHistory={layer.aiGenerationHistory}
            generationHistoryIndex={layer.aiGenerationHistoryIndex}
            onGeneratedImageSource={(src, aiGeneration) =>
              onUpdateLayer(layer.id, appendAiGenerationVariant(layer, src, aiGeneration))
            }
            onGenerationStateChange={(aiGeneration) =>
              onUpdateLayer(layer.id, {
                ...seedCurrentAiGenerationVariant(layer),
                aiGeneration,
              })
            }
            onGenerationHistorySelect={(index) => {
              const patch = selectAiGenerationVariant(layer, index);
              if (patch) onUpdateLayer(layer.id, patch);
            }}
            submitLabel={layer.src ? 'Replace Image' : 'Generate Image'}
            successMessage="Updated image node."
          />
        </div>
      )}
      <LayerInspector
        key={layer.id}
        layer={layer}
        onChange={(patch) => onUpdateLayer(layer.id, patch)}
        detached
        showAiGenerationProvenance={false}
      />
    </>
  );
}

function ColorNodeInspector({
  node,
  onUpdateColorNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateColorNode'> & {
  node: GraphColorNode;
}) {
  return <ColorInspector key={node.id} colorNode={node} onChange={(patch) => onUpdateColorNode(node.id, patch)} />;
}

function MergeNodeInspector({
  node,
  onUpdateMergeNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateMergeNode'> & {
  node: GraphMergeNode;
}) {
  return (
    <MergeInspector key={node.id} mergeNode={node} onChange={(patch) => onUpdateMergeNode(node.id, patch)} detached />
  );
}

function RepeatNodeInspector({
  node,
  onUpdateRepeatNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateRepeatNode'> & {
  node: GraphRepeatNode;
}) {
  return (
    <RepeatInspector
      key={node.id}
      repeatNode={node}
      onChange={(patch) => onUpdateRepeatNode(node.id, patch)}
      detached
    />
  );
}

function MaskNodeInspector({
  node,
  onUpdateMaskNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateMaskNode'> & {
  node: GraphMaskNode;
}) {
  return (
    <MaskInspector key={node.id} maskNode={node} onChange={(patch) => onUpdateMaskNode(node.id, patch)} detached />
  );
}

function TransformNodeInspector({
  node,
  onUpdateTransformNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateTransformNode'> & {
  node: GraphTransformNode;
}) {
  return (
    <TransformInspector
      key={node.id}
      transformNode={node}
      onChange={(patch) => onUpdateTransformNode(node.id, patch)}
      detached
    />
  );
}

function GrimeShadowNodeInspector({
  node,
  onUpdateGrimeShadowNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateGrimeShadowNode'> & {
  node: GraphGrimeShadowNode;
}) {
  return (
    <GrimeShadowInspector
      key={node.id}
      grimeShadowNode={node}
      onChange={(patch) => onUpdateGrimeShadowNode(node.id, patch)}
      detached
    />
  );
}

function ExportNodeInspector({
  doc,
  exportBusy,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
}: Pick<NodePropertiesPanelProps, 'doc' | 'exportBusy' | 'onUpdateExportConfig' | 'onUpdateAspectRatio' | 'onExport'>) {
  return (
    <ExportInspector
      key={EXPORT_NODE_ID}
      exportConfig={doc.export}
      aspect={doc.global.aspect}
      busy={exportBusy}
      onChange={onUpdateExportConfig}
      onAspectChange={onUpdateAspectRatio}
      onExport={onExport}
    />
  );
}

function LayerLockToggle({
  target,
  onUpdateLayer,
}: Pick<NodePropertiesPanelProps, 'onUpdateLayer'> & {
  target: SelectedNodeTarget | null;
}) {
  if (target?.kind !== 'layer') return null;
  return (
    <div className="node-target-actions">
      <label
        className="node-target-toggle"
        aria-label="Toggle node delete lock"
        title="Protect this layer-backed node from delete actions"
      >
        <span>Locked</span>
        <input
          className="node-check"
          type="checkbox"
          checked={target.layer.locked}
          onChange={(event) =>
            onUpdateLayer(target.layer.id, {
              locked: event.target.checked,
            })
          }
        />
      </label>
    </div>
  );
}

function SelectedNodeInspector({
  target,
  doc,
  exportBusy,
  onUpdateLayer,
  onUpdateMergeNode,
  onUpdateColorNode,
  onUpdateRepeatNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
}: Pick<
  NodePropertiesPanelProps,
  | 'doc'
  | 'exportBusy'
  | 'onUpdateLayer'
  | 'onUpdateMergeNode'
  | 'onUpdateColorNode'
  | 'onUpdateRepeatNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateExportConfig'
  | 'onUpdateAspectRatio'
  | 'onExport'
> & {
  target: SelectedNodeTarget | null;
}) {
  if (!target) return null;
  if (target.kind === 'layer')
    return <LayerNodeInspector layer={target.layer} doc={doc} onUpdateLayer={onUpdateLayer} />;
  if (target.kind === 'color') {
    return <ColorNodeInspector node={target.node} onUpdateColorNode={onUpdateColorNode} />;
  }
  return (
    <GraphOrExportNodeInspector
      target={target}
      doc={doc}
      exportBusy={exportBusy}
      onUpdateMergeNode={onUpdateMergeNode}
      onUpdateRepeatNode={onUpdateRepeatNode}
      onUpdateMaskNode={onUpdateMaskNode}
      onUpdateTransformNode={onUpdateTransformNode}
      onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
      onUpdateExportConfig={onUpdateExportConfig}
      onUpdateAspectRatio={onUpdateAspectRatio}
      onExport={onExport}
    />
  );
}

function GraphOrExportNodeInspector({
  target,
  doc,
  exportBusy,
  onUpdateMergeNode,
  onUpdateRepeatNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
}: Pick<
  NodePropertiesPanelProps,
  | 'doc'
  | 'exportBusy'
  | 'onUpdateMergeNode'
  | 'onUpdateRepeatNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateExportConfig'
  | 'onUpdateAspectRatio'
  | 'onExport'
> & {
  target: Exclude<SelectedNodeTarget, { kind: 'layer' } | { kind: 'color' }>;
}) {
  if (target.kind === 'merge') {
    return <MergeNodeInspector node={target.node} onUpdateMergeNode={onUpdateMergeNode} />;
  }
  if (target.kind === 'repeat') {
    return <RepeatNodeInspector node={target.node} onUpdateRepeatNode={onUpdateRepeatNode} />;
  }
  if (target.kind === 'mask') {
    return <MaskNodeInspector node={target.node} onUpdateMaskNode={onUpdateMaskNode} />;
  }
  if (target.kind === 'transform') {
    return <TransformNodeInspector node={target.node} onUpdateTransformNode={onUpdateTransformNode} />;
  }
  if (target.kind === 'grimeShadow') {
    return <GrimeShadowNodeInspector node={target.node} onUpdateGrimeShadowNode={onUpdateGrimeShadowNode} />;
  }
  return (
    <ExportNodeInspector
      doc={doc}
      exportBusy={exportBusy}
      onUpdateExportConfig={onUpdateExportConfig}
      onUpdateAspectRatio={onUpdateAspectRatio}
      onExport={onExport}
    />
  );
}

function NodePropertiesPanelContent({
  target,
  targetSummary,
  doc,
  exportBusy,
  onUpdateLayer,
  onUpdateMergeNode,
  onUpdateColorNode,
  onUpdateRepeatNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
  onClose,
}: Pick<
  NodePropertiesPanelProps,
  | 'doc'
  | 'exportBusy'
  | 'onUpdateLayer'
  | 'onUpdateMergeNode'
  | 'onUpdateColorNode'
  | 'onUpdateRepeatNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateExportConfig'
  | 'onUpdateAspectRatio'
  | 'onExport'
  | 'onClose'
> & {
  target: SelectedNodeTarget | null;
  targetSummary: ReturnType<typeof buildSelectedTargetSummary>;
}) {
  return (
    <div className="node-props-inner">
      <div className="node-props-header">
        <div className="node-props-titles">
          <span className="node-props-title">Properties</span>
          <span className="node-props-subtitle">{targetSummary?.eyebrow ?? 'No target'}</span>
        </div>
        <button type="button" className="node-props-close" onClick={onClose} aria-label="Close properties">
          ×
        </button>
      </div>
      <div className="node-props-body">
        {targetSummary && <EditorTargetHeader summary={targetSummary} />}
        <LayerLockToggle target={target} onUpdateLayer={onUpdateLayer} />
        <SelectedNodeInspector
          target={target}
          doc={doc}
          exportBusy={exportBusy}
          onUpdateLayer={onUpdateLayer}
          onUpdateMergeNode={onUpdateMergeNode}
          onUpdateColorNode={onUpdateColorNode}
          onUpdateRepeatNode={onUpdateRepeatNode}
          onUpdateMaskNode={onUpdateMaskNode}
          onUpdateTransformNode={onUpdateTransformNode}
          onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
          onUpdateExportConfig={onUpdateExportConfig}
          onUpdateAspectRatio={onUpdateAspectRatio}
          onExport={onExport}
        />
      </div>
    </div>
  );
}

export function NodePropertiesPanel({
  open,
  selectedNodeId,
  doc,
  graph,
  exportBusy,
  onUpdateLayer,
  onUpdateMergeNode,
  onUpdateColorNode,
  onUpdateRepeatNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
  onClose,
}: NodePropertiesPanelProps) {
  const target = resolveSelectedNodeTarget(doc, graph, selectedNodeId);
  const targetSummary = buildSelectedTargetSummary(target, doc, graph);

  return (
    <div
      className={`node-props-panel nodrag nopan nowheel${open ? ' node-props-panel-open' : ''}`}
      aria-hidden={!open}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {open && (
        <NodePropertiesPanelContent
          target={target}
          targetSummary={targetSummary}
          doc={doc}
          exportBusy={exportBusy}
          onUpdateLayer={onUpdateLayer}
          onUpdateMergeNode={onUpdateMergeNode}
          onUpdateColorNode={onUpdateColorNode}
          onUpdateRepeatNode={onUpdateRepeatNode}
          onUpdateMaskNode={onUpdateMaskNode}
          onUpdateTransformNode={onUpdateTransformNode}
          onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
          onUpdateExportConfig={onUpdateExportConfig}
          onUpdateAspectRatio={onUpdateAspectRatio}
          onExport={onExport}
          onClose={onClose}
        />
      )}
    </div>
  );
}
