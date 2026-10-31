import { type CanvasGraph, isObject3DLayer, type Layer } from '../../../types/config';
import { buildGraphTargetSummary, buildLayerTargetSummary } from '../../../utils/editorTargetSummary';
import { EXPORT_NODE_ID, findGraphNode } from '../../../utils/nodeGraph';
import type { GraphNode } from '../../../utils/nodeKinds';
import { EditorTargetOverview } from '../../editor-target/EditorTargetHeader';
import { LayerTargetInspector } from '../../layer-controls/LayerTargetInspector';
import { ExportInspector } from '../inspector';
import { InspectorTargetContext } from '../inspector/fields';
import { GraphNodeInspector } from '../nodeKinds/inspectors';
import type { NodeCanvasProps } from '../types';

interface NodePropertiesPanelProps
  extends Pick<
    NodeCanvasProps,
    | 'doc'
    | 'exportBusy'
    | 'onUpdateLayer'
    | 'onUpdateGraphNode'
    | 'onReplaceModelLayerFile'
    | 'onLoadSceneEnvironmentFile'
    | 'onUseShapeSource'
    | 'onUpdateExportConfig'
    | 'onUpdateAspectRatio'
    | 'onExport'
  > {
  open: boolean;
  selectedNodeId: string | null;
  graph: CanvasGraph;
  onClose: () => void;
}

type InspectorProps = Omit<NodePropertiesPanelProps, 'open' | 'selectedNodeId' | 'graph' | 'onClose'>;

type SelectedNodeTarget = { kind: 'layer'; layer: Layer } | { kind: 'graphNode'; node: GraphNode } | { kind: 'output' };

function resolveSelectedNodeTarget(
  doc: NodePropertiesPanelProps['doc'],
  graph: CanvasGraph,
  selectedNodeId: string | null,
): SelectedNodeTarget | null {
  if (!selectedNodeId) return null;
  if (selectedNodeId === EXPORT_NODE_ID) return { kind: 'output' };
  const layer = doc.layers.find((item) => item.id === selectedNodeId);
  if (layer) return { kind: 'layer', layer };
  const node = findGraphNode(graph, selectedNodeId);
  return node ? { kind: 'graphNode', node } : null;
}

function buildSelectedTargetSummary(
  target: SelectedNodeTarget | null,
  doc: NodePropertiesPanelProps['doc'],
  graph: CanvasGraph,
) {
  if (!target) return null;
  const options = { surface: 'nodes' as const, graph, layers: doc.layers };
  if (target.kind === 'layer') return buildLayerTargetSummary(target.layer, options);
  if (target.kind === 'output') return buildGraphTargetSummary({ kind: 'output' }, options);
  return buildGraphTargetSummary({ kind: 'graphNode', node: target.node }, options);
}

function modelFileLoader(
  layer: Layer,
  onReplaceModelLayerFile?: (id: string, file: File) => void,
): ((file: File) => void) | undefined {
  if (!isObject3DLayer(layer) || !onReplaceModelLayerFile) return undefined;
  return (file) => onReplaceModelLayerFile(layer.id, file);
}

function SelectedNodeInspector({
  target,
  doc,
  exportBusy,
  onUpdateLayer,
  onUpdateGraphNode,
  onReplaceModelLayerFile,
  onLoadSceneEnvironmentFile,
  onUseShapeSource,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
}: InspectorProps & { target: SelectedNodeTarget | null }) {
  if (!target) return null;
  if (target.kind === 'layer') {
    const { layer } = target;
    return (
      <LayerTargetInspector
        layer={layer}
        aspect={doc.global.aspect}
        onChange={(patch) => onUpdateLayer(layer.id, patch)}
        onImageSource={(src) => onUpdateLayer(layer.id, { src })}
        onLoadModelFile={modelFileLoader(layer, onReplaceModelLayerFile)}
        onLoadEnvironmentFile={
          onLoadSceneEnvironmentFile ? (file) => onLoadSceneEnvironmentFile(layer.id, file) : undefined
        }
        onUseShapeSource={onUseShapeSource ? () => onUseShapeSource(layer.id) : undefined}
      />
    );
  }
  if (target.kind === 'graphNode') {
    const { node } = target;
    return (
      <GraphNodeInspector
        node={node}
        doc={doc}
        graph={doc.graph}
        onChange={(patch) => onUpdateGraphNode(node.id, patch)}
        onUpdateGraphNode={onUpdateGraphNode}
      />
    );
  }
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

export function NodePropertiesPanel({
  open,
  selectedNodeId,
  graph,
  onClose,
  ...inspectorProps
}: NodePropertiesPanelProps) {
  const target = resolveSelectedNodeTarget(inspectorProps.doc, graph, selectedNodeId);
  const targetSummary = buildSelectedTargetSummary(target, inspectorProps.doc, graph);

  return (
    <div
      className={`node-props-panel nodrag nopan nowheel${open ? ' node-props-panel-open' : ''}`}
      aria-hidden={!open}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {open && (
        <InspectorTargetContext.Provider value={selectedNodeId}>
          <div className="node-props-inner">
            <div className="node-props-header">
              <div className="node-props-titles">
                <span className="node-props-title">Properties</span>
              </div>
              <button type="button" className="node-props-close" onClick={onClose} aria-label="Close properties">
                ×
              </button>
            </div>
            <div className="node-props-body artifact-inspector-scroll">
              {targetSummary ? (
                <>
                  <EditorTargetOverview summary={targetSummary} />
                  <SelectedNodeInspector target={target} {...inspectorProps} />
                </>
              ) : (
                <div className="node-props-empty">Select a node to edit its properties.</div>
              )}
            </div>
          </div>
        </InspectorTargetContext.Provider>
      )}
    </div>
  );
}
