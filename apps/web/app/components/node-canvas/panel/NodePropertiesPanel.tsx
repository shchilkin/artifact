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
import { EFFECT_PRESETS } from '../../../types/config';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { AiGenerationPanel } from '../../AiGenerationPanel';
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

  let title = 'Properties';
  let subtitle = '';

  if (layer) {
    title = layer.name;
    subtitle =
      layer.kind === 'effect'
        ? `effect · ${layer.preset ? (EFFECT_PRESETS[layer.preset]?.name ?? layer.preset).toLowerCase() : 'custom'}`
        : layer.kind;
  } else if (colorNode) {
    title = colorNode.name;
    subtitle = 'color';
  } else if (mergeNode) {
    title = mergeNode.name;
    subtitle = 'merge';
  } else if (repeatNode) {
    title = repeatNode.name;
    subtitle = 'repeat';
  } else if (isExport) {
    title = 'Output';
    subtitle = 'export';
  }

  return (
    <div className={`node-props-panel${open ? ' node-props-panel-open' : ''}`} aria-hidden={!open}>
      {open ? (
        <div className="node-props-inner">
          <div className="node-props-header">
            <div className="node-props-titles">
              <span className="node-props-title">{title}</span>
              {subtitle && <span className="node-props-subtitle">{subtitle}</span>}
            </div>
            <button type="button" className="node-props-close" onClick={onClose} aria-label="Close properties">
              ×
            </button>
          </div>
          <div className="node-props-body">
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
