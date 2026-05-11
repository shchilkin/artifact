import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { useNodeCanvasActions } from '../context';
import type { ColorNodeData, ExportNodeData, LayerNodeData, MergeNodeData } from '../types';
import { PortRow } from '../inspector/PortRow';
import { LayerPreviewSurface } from '../thumbnails/LayerPreviewSurface';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import { NodeFrame } from './NodeFrame';
import { useLayerTransformDraft } from './useLayerTransformDraft';

export const LayerNodeComponent = memo(function LayerNodeComponent({ data }: NodeProps<LayerNodeData>) {
  const { selectNode, deleteNode, updateLayer } = useNodeCanvasActions();
  const { layer, previewTargetId, selected, editing, connected, primitiveViewState, primitiveRenderMode } = data;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';
  const transform = useLayerTransformDraft(layer, updateLayer);
  const localTransformActive = selected && transform.isTransformable;

  return (
    <NodeFrame
      id={layer.id}
      kind={layer.kind}
      label={layer.kind}
      name={layer.name}
      selected={selected}
      editing={editing}
      targetHandles={[{ id: inputPort }]}
      className={localTransformActive ? 'nowheel' : undefined}
      onWheelCapture={localTransformActive ? transform.handleWheel : undefined}
      onSelect={(event) => selectNode(layer.id, event)}
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
    </NodeFrame>
  );
});

export const ColorNodeComponent = memo(function ColorNodeComponent({ data }: NodeProps<ColorNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { colorNode, previewTargetId, selected, editing, connected } = data;

  return (
    <NodeFrame
      id={colorNode.id}
      kind="color"
      label="color"
      name={colorNode.name}
      selected={selected}
      editing={editing}
      targetHandles={[{ id: 'in' }]}
      onSelect={(event) => selectNode(colorNode.id, event)}
      onDelete={() => deleteNode(colorNode.id)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} />
      <PortRow
        inputs={[{ label: 'source', portId: 'in', nodeId: colorNode.id }]}
        outputs={[{ label: 'graded', portId: 'out', nodeId: colorNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const MergeNodeComponent = memo(function MergeNodeComponent({ data }: NodeProps<MergeNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { mergeNode, previewTargetId, selected, editing, connected } = data;

  return (
    <NodeFrame
      id={mergeNode.id}
      kind="merge"
      label="merge"
      name={mergeNode.name}
      selected={selected}
      editing={editing}
      targetHandles={[
        { id: 'a', top: '36%' },
        { id: 'b', top: '64%' },
      ]}
      onSelect={(event) => selectNode(mergeNode.id, event)}
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
    </NodeFrame>
  );
});

export const ExportNodeComponent = memo(function ExportNodeComponent({ data }: NodeProps<ExportNodeData>) {
  const { selectNode } = useNodeCanvasActions();
  const { previewTargetId, selected, editing, connected } = data;

  return (
    <NodeFrame
      id={EXPORT_NODE_ID}
      kind="export"
      label="export"
      name="Output"
      selected={selected}
      editing={editing}
      targetHandles={[{ id: 'in' }]}
      sourceHandles={[]}
      onSelect={(event) => selectNode(EXPORT_NODE_ID, event)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} />
      <PortRow
        inputs={[{ label: 'final', portId: 'in', nodeId: EXPORT_NODE_ID }]}
        outputs={[]}
        connected={connected}
      />
    </NodeFrame>
  );
});
