import type {
  AspectRatio,
  CanvasDocument,
  CanvasGraph,
  GraphColorNode,
  GraphMergeNode,
  GraphRepeatNode,
  ImageLayer,
  Layer,
} from '../../../types/config';
import { buildGraphTargetSummary, buildLayerTargetSummary } from '../../../utils/editorTargetSummary';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { AiGenerationPanel } from '../../AiGenerationPanel';
import { EditorTargetHeader } from '../../editor-target/EditorTargetHeader';
import { ColorInspector, ExportInspector, LayerInspector, MergeInspector, RepeatInspector } from '../inspector';

interface NodePropertiesPanelProps {
  open: boolean;
  selectedNodeId: string | null;
  doc: CanvasDocument;
  graph: CanvasGraph;
  exportBusy: boolean;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onUpdateMergeNode: (id: string, patch: Partial<GraphMergeNode>) => void;
  onUpdateColorNode: (id: string, patch: Partial<GraphColorNode>) => void;
  onUpdateRepeatNode: (id: string, patch: Partial<GraphRepeatNode>) => void;
  onUpdateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  onUpdateAspectRatio: (aspect: AspectRatio) => void;
  onExport: () => void;
  onClose: () => void;
}

function appendAiGenerationVariant(
  layer: ImageLayer,
  src: string,
  aiGeneration: NonNullable<ImageLayer['aiGeneration']>,
): Partial<ImageLayer> {
  const existing =
    layer.aiGenerationHistory?.length || !layer.src || !layer.aiGeneration
      ? (layer.aiGenerationHistory ?? [])
      : [{ src: layer.src, aiGeneration: layer.aiGeneration }];
  const nextVariant = { src, aiGeneration };
  const nextHistory = [
    ...existing.filter((item) => item.src !== src && item.aiGeneration.jobId !== aiGeneration.jobId),
    nextVariant,
  ];
  return {
    src,
    aiGeneration,
    aiGenerationHistory: nextHistory,
    aiGenerationHistoryIndex: nextHistory.length - 1,
  };
}

function seedCurrentAiGenerationVariant(layer: ImageLayer): Partial<ImageLayer> {
  if (layer.aiGenerationHistory?.length || !layer.src || !layer.aiGeneration) return {};
  return {
    aiGenerationHistory: [{ src: layer.src, aiGeneration: layer.aiGeneration }],
    aiGenerationHistoryIndex: 0,
  };
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
  onUpdateExportConfig,
  onUpdateAspectRatio,
  onExport,
  onClose,
}: NodePropertiesPanelProps) {
  const layer = selectedNodeId ? (doc.layers.find((l) => l.id === selectedNodeId) ?? null) : null;
  const mergeNode =
    selectedNodeId && selectedNodeId !== EXPORT_NODE_ID
      ? (graph.mergeNodes.find((n) => n.id === selectedNodeId) ?? null)
      : null;
  const colorNode =
    selectedNodeId && selectedNodeId !== EXPORT_NODE_ID
      ? ((graph.colorNodes ?? []).find((n) => n.id === selectedNodeId) ?? null)
      : null;
  const repeatNode =
    selectedNodeId && selectedNodeId !== EXPORT_NODE_ID
      ? ((graph.repeatNodes ?? []).find((n) => n.id === selectedNodeId) ?? null)
      : null;
  const isExport = selectedNodeId === EXPORT_NODE_ID;

  const targetSummary = layer
    ? buildLayerTargetSummary(layer, { surface: 'nodes', graph, layers: doc.layers })
    : colorNode
      ? buildGraphTargetSummary({ kind: 'color', node: colorNode }, { surface: 'nodes', graph })
      : mergeNode
        ? buildGraphTargetSummary({ kind: 'merge', node: mergeNode }, { surface: 'nodes', graph })
        : repeatNode
          ? buildGraphTargetSummary({ kind: 'repeat', node: repeatNode }, { surface: 'nodes', graph })
          : isExport
            ? buildGraphTargetSummary({ kind: 'output' }, { surface: 'nodes', graph })
            : null;

  return (
    <div
      className={`node-props-panel nodrag nopan nowheel${open ? ' node-props-panel-open' : ''}`}
      aria-hidden={!open}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {open ? (
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
            {layer && (
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
                    checked={layer.locked}
                    onChange={(event) => onUpdateLayer(layer.id, { locked: event.target.checked })}
                  />
                </label>
              </div>
            )}
            {layer && (
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
                        onUpdateLayer(layer.id, { ...seedCurrentAiGenerationVariant(layer), aiGeneration })
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
            )}
            {!layer && colorNode && (
              <ColorInspector
                key={colorNode.id}
                colorNode={colorNode}
                onChange={(patch) => onUpdateColorNode(colorNode.id, patch)}
              />
            )}
            {!layer && !colorNode && mergeNode && (
              <MergeInspector
                key={mergeNode.id}
                mergeNode={mergeNode}
                onChange={(patch) => onUpdateMergeNode(mergeNode.id, patch)}
                detached
              />
            )}
            {!layer && !colorNode && !mergeNode && repeatNode && (
              <RepeatInspector
                key={repeatNode.id}
                repeatNode={repeatNode}
                onChange={(patch) => onUpdateRepeatNode(repeatNode.id, patch)}
                detached
              />
            )}
            {!layer && !colorNode && !mergeNode && !repeatNode && isExport && (
              <ExportInspector
                key={EXPORT_NODE_ID}
                exportConfig={doc.export}
                aspect={doc.global.aspect}
                busy={exportBusy}
                onChange={onUpdateExportConfig}
                onAspectChange={onUpdateAspectRatio}
                onExport={onExport}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
