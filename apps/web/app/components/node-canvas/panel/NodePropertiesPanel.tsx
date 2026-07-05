import type {
  CanvasGraph,
  GraphColorNode,
  GraphEnvironmentNode,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMaterialNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphScene3DNode,
  GraphShaderNode,
  GraphTransformNode,
  ImageLayer,
  Layer,
  MaterialTextureInputPort,
} from '../../../types/config';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../../types/config';
import type { EditorTargetSummary } from '../../../utils/editorTargetSummary';
import { buildGraphTargetSummary, buildLayerTargetSummary } from '../../../utils/editorTargetSummary';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { AiGenerationPanel } from '../../AiGenerationPanel';
import { EditorTargetHeader } from '../../editor-target/EditorTargetHeader';
import {
  ColorInspector,
  EnvironmentInspector,
  ExportInspector,
  GrimeShadowInspector,
  LayerInspector,
  MaskInspector,
  MaterialInspector,
  MergeInspector,
  RepeatInspector,
  Scene3DInspector,
  ShaderInspector,
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
    | 'onUpdateMaterialNode'
    | 'onUpdateMaskNode'
    | 'onUpdateTransformNode'
    | 'onUpdateGrimeShadowNode'
    | 'onUpdateScene3DNode'
    | 'onUpdateEnvironmentNode'
    | 'onUpdateShaderNode'
    | 'onReplaceEnvironmentNodeFile'
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
  | { kind: 'material'; node: GraphMaterialNode }
  | { kind: 'mask'; node: GraphMaskNode }
  | { kind: 'transform'; node: GraphTransformNode }
  | { kind: 'grimeShadow'; node: GraphGrimeShadowNode }
  | { kind: 'scene3d'; node: GraphScene3DNode }
  | { kind: 'environment'; node: GraphEnvironmentNode }
  | { kind: 'shader'; node: GraphShaderNode }
  | { kind: 'output' };

type GraphUtilityInspectorTarget = Exclude<
  SelectedNodeTarget,
  { kind: 'layer' } | { kind: 'color' } | { kind: 'output' }
>;

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
    GRAPH_NODE_TARGET_FINDERS.map((findTarget) => findTarget(graph, selectedNodeId)).find(isSelectedNodeTarget) ?? null
  );
}

const GRAPH_NODE_TARGET_FINDERS = [
  findColorNodeTarget,
  findMergeNodeTarget,
  findRepeatNodeTarget,
  findMaterialNodeTarget,
  findMaskNodeTarget,
  findTransformNodeTarget,
  findGrimeShadowNodeTarget,
  findScene3DNodeTarget,
  findEnvironmentNodeTarget,
  findShaderNodeTarget,
];

function isSelectedNodeTarget(target: SelectedNodeTarget | null): target is SelectedNodeTarget {
  return target !== null;
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

function findMaterialNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.materialNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'material', node } : null;
}

function findTransformNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.transformNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'transform', node } : null;
}

function findGrimeShadowNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.grimeShadowNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'grimeShadow', node } : null;
}

function findScene3DNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.scene3dNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'scene3d', node } : null;
}

function findEnvironmentNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.environmentNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'environment', node } : null;
}

function findShaderNodeTarget(graph: CanvasGraph, selectedNodeId: string): SelectedNodeTarget | null {
  const node = (graph.shaderNodes ?? []).find((item) => item.id === selectedNodeId);
  return node ? { kind: 'shader', node } : null;
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

function MaterialNodeInspector({
  node,
  graph,
  onUpdateMaterialNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateMaterialNode'> & {
  node: GraphMaterialNode;
  graph: CanvasGraph | undefined;
}) {
  return (
    <MaterialInspector
      key={node.id}
      materialNode={node}
      connectedTextureInputs={connectedMaterialTextureInputs(graph, node.id)}
      onChange={(patch) => onUpdateMaterialNode(node.id, patch)}
      detached
    />
  );
}

function connectedMaterialTextureInputs(graph: CanvasGraph | undefined, nodeId: string): Set<MaterialTextureInputPort> {
  const inputPorts = new Set<string>(MATERIAL_TEXTURE_INPUT_PORTS);
  const connected = new Set<MaterialTextureInputPort>();
  for (const edge of graph?.edges ?? []) {
    if (edge.toId !== nodeId || !inputPorts.has(edge.toPort)) continue;
    connected.add(edge.toPort as MaterialTextureInputPort);
  }
  return connected;
}

function isPortConnected(graph: CanvasGraph | undefined, nodeId: string, portId: string): boolean {
  return (graph?.edges ?? []).some((edge) => edge.toId === nodeId && edge.toPort === portId);
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

function Scene3DNodeInspector({
  node,
  graph,
  onUpdateScene3DNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateScene3DNode'> & {
  node: GraphScene3DNode;
  graph: CanvasGraph | undefined;
}) {
  return (
    <Scene3DInspector
      key={node.id}
      scene3dNode={node}
      materialInputConnected={isPortConnected(graph, node.id, 'material')}
      onChange={(patch) => onUpdateScene3DNode(node.id, patch)}
      detached
    />
  );
}

function EnvironmentNodeInspector({
  node,
  onUpdateEnvironmentNode,
  onReplaceEnvironmentNodeFile,
}: Pick<NodePropertiesPanelProps, 'onUpdateEnvironmentNode' | 'onReplaceEnvironmentNodeFile'> & {
  node: GraphEnvironmentNode;
}) {
  return (
    <EnvironmentInspector
      key={node.id}
      environmentNode={node}
      onChange={(patch) => onUpdateEnvironmentNode(node.id, patch)}
      onLoadFile={onReplaceEnvironmentNodeFile ? (file) => onReplaceEnvironmentNodeFile(node.id, file) : undefined}
      detached
    />
  );
}

function ShaderNodeInspector({
  node,
  onUpdateShaderNode,
}: Pick<NodePropertiesPanelProps, 'onUpdateShaderNode'> & {
  node: GraphShaderNode;
}) {
  return (
    <ShaderInspector
      key={node.id}
      shaderNode={node}
      onChange={(patch) => onUpdateShaderNode(node.id, patch)}
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
    <div className="node-target-actions" aria-label="Layer node safety">
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

function NodeTargetOverview({
  target,
  summary,
  onUpdateLayer,
}: Pick<NodePropertiesPanelProps, 'onUpdateLayer'> & {
  target: SelectedNodeTarget | null;
  summary: EditorTargetSummary;
}) {
  return (
    <section
      className={`node-target-overview node-target-overview-${summary.role}`}
      aria-label="Selected node overview"
    >
      <EditorTargetHeader summary={summary} compact />
      <LayerLockToggle target={target} onUpdateLayer={onUpdateLayer} />
    </section>
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
  onUpdateMaterialNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateScene3DNode,
  onUpdateEnvironmentNode,
  onUpdateShaderNode,
  onReplaceEnvironmentNodeFile,
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
  | 'onUpdateMaterialNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateScene3DNode'
  | 'onUpdateEnvironmentNode'
  | 'onUpdateShaderNode'
  | 'onReplaceEnvironmentNodeFile'
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
      onUpdateMaterialNode={onUpdateMaterialNode}
      onUpdateMaskNode={onUpdateMaskNode}
      onUpdateTransformNode={onUpdateTransformNode}
      onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
      onUpdateScene3DNode={onUpdateScene3DNode}
      onUpdateEnvironmentNode={onUpdateEnvironmentNode}
      onUpdateShaderNode={onUpdateShaderNode}
      onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
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
  onUpdateMaterialNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateScene3DNode,
  onUpdateEnvironmentNode,
  onUpdateShaderNode,
  onReplaceEnvironmentNodeFile,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
}: Pick<
  NodePropertiesPanelProps,
  | 'doc'
  | 'exportBusy'
  | 'onUpdateMergeNode'
  | 'onUpdateRepeatNode'
  | 'onUpdateMaterialNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateScene3DNode'
  | 'onUpdateEnvironmentNode'
  | 'onUpdateShaderNode'
  | 'onReplaceEnvironmentNodeFile'
  | 'onUpdateExportConfig'
  | 'onUpdateAspectRatio'
  | 'onExport'
> & {
  target: Exclude<SelectedNodeTarget, { kind: 'layer' } | { kind: 'color' }>;
}) {
  if (target.kind !== 'output')
    return (
      <GraphUtilityNodeInspector
        target={target}
        graph={doc.graph}
        onUpdateMergeNode={onUpdateMergeNode}
        onUpdateRepeatNode={onUpdateRepeatNode}
        onUpdateMaterialNode={onUpdateMaterialNode}
        onUpdateMaskNode={onUpdateMaskNode}
        onUpdateTransformNode={onUpdateTransformNode}
        onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
        onUpdateScene3DNode={onUpdateScene3DNode}
        onUpdateEnvironmentNode={onUpdateEnvironmentNode}
        onUpdateShaderNode={onUpdateShaderNode}
        onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
      />
    );
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

function GraphUtilityNodeInspector({
  target,
  graph,
  onUpdateMergeNode,
  onUpdateRepeatNode,
  onUpdateMaterialNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateScene3DNode,
  onUpdateEnvironmentNode,
  onUpdateShaderNode,
  onReplaceEnvironmentNodeFile,
}: Pick<
  NodePropertiesPanelProps,
  | 'onUpdateMergeNode'
  | 'onUpdateRepeatNode'
  | 'onUpdateMaterialNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateScene3DNode'
  | 'onUpdateEnvironmentNode'
  | 'onUpdateShaderNode'
  | 'onReplaceEnvironmentNodeFile'
> & {
  target: GraphUtilityInspectorTarget;
  graph: CanvasGraph | undefined;
}) {
  return GRAPH_UTILITY_INSPECTORS[target.kind]({
    target: target as never,
    graph,
    onUpdateMergeNode,
    onUpdateRepeatNode,
    onUpdateMaterialNode,
    onUpdateMaskNode,
    onUpdateTransformNode,
    onUpdateGrimeShadowNode,
    onUpdateScene3DNode,
    onUpdateEnvironmentNode,
    onUpdateShaderNode,
    onReplaceEnvironmentNodeFile,
  });
}

const GRAPH_UTILITY_INSPECTORS = {
  merge: ({ target, onUpdateMergeNode }: GraphUtilityInspectorProps<'merge'>) => (
    <MergeNodeInspector node={target.node} onUpdateMergeNode={onUpdateMergeNode} />
  ),
  repeat: ({ target, onUpdateRepeatNode }: GraphUtilityInspectorProps<'repeat'>) => (
    <RepeatNodeInspector node={target.node} onUpdateRepeatNode={onUpdateRepeatNode} />
  ),
  material: ({ target, graph, onUpdateMaterialNode }: GraphUtilityInspectorProps<'material'>) => (
    <MaterialNodeInspector node={target.node} graph={graph} onUpdateMaterialNode={onUpdateMaterialNode} />
  ),
  mask: ({ target, onUpdateMaskNode }: GraphUtilityInspectorProps<'mask'>) => (
    <MaskNodeInspector node={target.node} onUpdateMaskNode={onUpdateMaskNode} />
  ),
  transform: ({ target, onUpdateTransformNode }: GraphUtilityInspectorProps<'transform'>) => (
    <TransformNodeInspector node={target.node} onUpdateTransformNode={onUpdateTransformNode} />
  ),
  grimeShadow: ({ target, onUpdateGrimeShadowNode }: GraphUtilityInspectorProps<'grimeShadow'>) => (
    <GrimeShadowNodeInspector node={target.node} onUpdateGrimeShadowNode={onUpdateGrimeShadowNode} />
  ),
  scene3d: ({ target, graph, onUpdateScene3DNode }: GraphUtilityInspectorProps<'scene3d'>) => (
    <Scene3DNodeInspector node={target.node} graph={graph} onUpdateScene3DNode={onUpdateScene3DNode} />
  ),
  environment: ({
    target,
    onUpdateEnvironmentNode,
    onReplaceEnvironmentNodeFile,
  }: GraphUtilityInspectorProps<'environment'>) => (
    <EnvironmentNodeInspector
      node={target.node}
      onUpdateEnvironmentNode={onUpdateEnvironmentNode}
      onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
    />
  ),
  shader: ({ target, onUpdateShaderNode }: GraphUtilityInspectorProps<'shader'>) => (
    <ShaderNodeInspector node={target.node} onUpdateShaderNode={onUpdateShaderNode} />
  ),
};

type GraphUtilityInspectorProps<K extends GraphUtilityInspectorTarget['kind']> = Pick<
  NodePropertiesPanelProps,
  | 'onUpdateMergeNode'
  | 'onUpdateRepeatNode'
  | 'onUpdateMaterialNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateScene3DNode'
  | 'onUpdateEnvironmentNode'
  | 'onUpdateShaderNode'
  | 'onReplaceEnvironmentNodeFile'
> & {
  target: Extract<GraphUtilityInspectorTarget, { kind: K }>;
  graph: CanvasGraph | undefined;
};

function NodePropertiesPanelContent({
  target,
  targetSummary,
  doc,
  exportBusy,
  onUpdateLayer,
  onUpdateMergeNode,
  onUpdateColorNode,
  onUpdateRepeatNode,
  onUpdateMaterialNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateScene3DNode,
  onUpdateEnvironmentNode,
  onUpdateShaderNode,
  onReplaceEnvironmentNodeFile,
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
  | 'onUpdateMaterialNode'
  | 'onUpdateMaskNode'
  | 'onUpdateTransformNode'
  | 'onUpdateGrimeShadowNode'
  | 'onUpdateScene3DNode'
  | 'onUpdateEnvironmentNode'
  | 'onUpdateShaderNode'
  | 'onReplaceEnvironmentNodeFile'
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
        </div>
        <button type="button" className="node-props-close" onClick={onClose} aria-label="Close properties">
          ×
        </button>
      </div>
      <div className="node-props-body">
        {targetSummary ? (
          <>
            <NodeTargetOverview target={target} summary={targetSummary} onUpdateLayer={onUpdateLayer} />
            <SelectedNodeInspector
              target={target}
              doc={doc}
              exportBusy={exportBusy}
              onUpdateLayer={onUpdateLayer}
              onUpdateMergeNode={onUpdateMergeNode}
              onUpdateColorNode={onUpdateColorNode}
              onUpdateRepeatNode={onUpdateRepeatNode}
              onUpdateMaterialNode={onUpdateMaterialNode}
              onUpdateMaskNode={onUpdateMaskNode}
              onUpdateTransformNode={onUpdateTransformNode}
              onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
              onUpdateScene3DNode={onUpdateScene3DNode}
              onUpdateEnvironmentNode={onUpdateEnvironmentNode}
              onUpdateShaderNode={onUpdateShaderNode}
              onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
              onUpdateExportConfig={onUpdateExportConfig}
              onUpdateAspectRatio={onUpdateAspectRatio}
              onExport={onExport}
            />
          </>
        ) : (
          <div className="node-props-empty">Select a node to edit its properties.</div>
        )}
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
  onUpdateMaterialNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateScene3DNode,
  onUpdateEnvironmentNode,
  onUpdateShaderNode,
  onReplaceEnvironmentNodeFile,
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
          onUpdateMaterialNode={onUpdateMaterialNode}
          onUpdateMaskNode={onUpdateMaskNode}
          onUpdateTransformNode={onUpdateTransformNode}
          onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
          onUpdateScene3DNode={onUpdateScene3DNode}
          onUpdateEnvironmentNode={onUpdateEnvironmentNode}
          onUpdateShaderNode={onUpdateShaderNode}
          onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
          onUpdateExportConfig={onUpdateExportConfig}
          onUpdateAspectRatio={onUpdateAspectRatio}
          onExport={onExport}
          onClose={onClose}
        />
      )}
    </div>
  );
}
