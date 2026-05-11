import { memo, type KeyboardEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { useNodeCanvasActions } from '../context';
import { HANDLE_STYLE } from '../constants';
import type { ColorNodeData, ExportNodeData, LayerNodeData, MergeNodeData } from '../types';
import { PortRow } from '../inspector/PortRow';
import { LayerPreviewSurface } from '../thumbnails/LayerPreviewSurface';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import { NodeShell } from './NodeShell';
import { useLayerTransformDraft } from './useLayerTransformDraft';

function handleNodeKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onSelect: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect();
}

export const LayerNodeComponent = memo(function LayerNodeComponent({ data }: NodeProps<LayerNodeData>) {
  const { selectNode, deleteNode, updateLayer } = useNodeCanvasActions();
  const { layer, previewTargetId, selected, editing, connected, primitiveViewState, primitiveRenderMode } = data;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';
  const transform = useLayerTransformDraft(layer, updateLayer);
  const localTransformActive = selected && transform.isTransformable;

  return (
    <div
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
      className={localTransformActive ? 'nowheel' : undefined}
      onWheelCapture={localTransformActive ? transform.handleWheel : undefined}
    >
      <Handle type="target" position={Position.Left} id={inputPort} style={HANDLE_STYLE} />
      <div
        className="node-shell-frame"
        tabIndex={0}
        role="group"
        aria-roledescription="canvas node"
        aria-label={`${layer.name}, ${layer.kind} node${selected ? ', selected' : ''}`}
        onClick={(event) => selectNode(layer.id, event)}
        onFocus={() => selectNode(layer.id)}
        onKeyDown={(event) => handleNodeKeyDown(event, () => selectNode(layer.id))}
      >
        <NodeShell
          kind={layer.kind}
          label={layer.kind}
          name={layer.name}
          selected={selected}
          expanded={editing}
          expandable
          onDelete={() => deleteNode(layer.id)}
        >
          <LayerPreviewSurface
            layer={transform.effectiveLayer}
            previewTargetId={previewTargetId}
            primitiveViewState={primitiveViewState}
            primitiveRenderMode={primitiveRenderMode}
            selected={selected}
            onTransformDraft={transform.updateDraft}
            onTransformCommit={transform.commitDraft}
          />
          <PortRow
            inputs={[{ label: isEffect ? 'source' : 'backdrop', portId: inputPort, nodeId: layer.id }]}
            outputs={[{ label: 'result', portId: 'out', nodeId: layer.id }]}
            connected={connected}
          />
        </NodeShell>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={HANDLE_STYLE} />
    </div>
  );
});

export const ColorNodeComponent = memo(function ColorNodeComponent({ data }: NodeProps<ColorNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { colorNode, previewTargetId, selected, editing, connected } = data;

  return (
    <div
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
    >
      <Handle type="target" id="in" position={Position.Left} style={HANDLE_STYLE} />
      <div
        className="node-shell-frame"
        tabIndex={0}
        role="group"
        aria-roledescription="canvas node"
        aria-label={`${colorNode.name}, color node${selected ? ', selected' : ''}`}
        onClick={(event) => selectNode(colorNode.id, event)}
        onFocus={() => selectNode(colorNode.id)}
        onKeyDown={(event) => handleNodeKeyDown(event, () => selectNode(colorNode.id))}
      >
        <NodeShell
          kind="color"
          label="color"
          name={colorNode.name}
          selected={selected}
          expanded={editing}
          expandable
          onDelete={() => deleteNode(colorNode.id)}
        >
          <NodeThumbnail previewTargetId={previewTargetId} />
          <PortRow
            inputs={[{ label: 'source', portId: 'in', nodeId: colorNode.id }]}
            outputs={[{ label: 'graded', portId: 'out', nodeId: colorNode.id }]}
            connected={connected}
          />
        </NodeShell>
      </div>
      <Handle type="source" id="out" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
});

export const MergeNodeComponent = memo(function MergeNodeComponent({ data }: NodeProps<MergeNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { mergeNode, previewTargetId, selected, editing, connected } = data;

  return (
    <div
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
    >
      <Handle type="target" id="a" position={Position.Left}
        style={{ ...HANDLE_STYLE, top: '36%' }} />
      <Handle type="target" id="b" position={Position.Left}
        style={{ ...HANDLE_STYLE, top: '64%' }} />
      <div
        className="node-shell-frame"
        tabIndex={0}
        role="group"
        aria-roledescription="canvas node"
        aria-label={`${mergeNode.name}, merge node${selected ? ', selected' : ''}`}
        onClick={(event) => selectNode(mergeNode.id, event)}
        onFocus={() => selectNode(mergeNode.id)}
        onKeyDown={(event) => handleNodeKeyDown(event, () => selectNode(mergeNode.id))}
      >
        <NodeShell
          kind="merge"
          label="merge"
          name={mergeNode.name}
          selected={selected}
          expanded={editing}
          expandable
          onDelete={() => deleteNode(mergeNode.id)}
        >
          <NodeThumbnail previewTargetId={previewTargetId} />
          <PortRow
            inputs={[
              { label: 'base', portId: 'a', nodeId: mergeNode.id },
              { label: 'top', portId: 'b', nodeId: mergeNode.id },
            ]}
            outputs={[{ label: 'mix', portId: 'out', nodeId: mergeNode.id }]}
            connected={connected}
          />
        </NodeShell>
      </div>
      <Handle type="source" id="out" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
});

export const ExportNodeComponent = memo(function ExportNodeComponent({ data }: NodeProps<ExportNodeData>) {
  const { selectNode } = useNodeCanvasActions();
  const { previewTargetId, selected, editing, connected } = data;

  return (
    <div
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
    >
      <Handle type="target" id="in" position={Position.Left} style={HANDLE_STYLE} />
      <div
        className="node-shell-frame"
        tabIndex={0}
        role="group"
        aria-roledescription="canvas node"
        aria-label={`Output node${selected ? ', selected' : ''}`}
        onClick={(event) => selectNode(EXPORT_NODE_ID, event)}
        onFocus={() => selectNode(EXPORT_NODE_ID)}
        onKeyDown={(event) => handleNodeKeyDown(event, () => selectNode(EXPORT_NODE_ID))}
      >
        <NodeShell
          kind="export"
          label="export"
          name="Output"
          selected={selected}
          expanded={editing}
          expandable
        >
          <NodeThumbnail previewTargetId={previewTargetId} />
          <PortRow
            inputs={[{ label: 'final', portId: 'in', nodeId: EXPORT_NODE_ID }]}
            outputs={[]}
            connected={connected}
          />
        </NodeShell>
      </div>
    </div>
  );
});
