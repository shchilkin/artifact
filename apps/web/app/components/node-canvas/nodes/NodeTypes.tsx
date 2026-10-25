import type { Node, NodeProps } from '@xyflow/react';
import { memo } from 'react';

import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { KIND_LABEL } from '../constants';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { LayerPreviewSurface } from '../thumbnails/LayerPreviewSurface';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { ExportNodeData, FallbackNodeData, LayerNodeData } from '../types';
import { NodeFrame } from './NodeFrame';
import { useLayerTransformDraft } from './useLayerTransformDraft';

export const LayerNodeComponent = memo(function LayerNodeComponent({ data }: NodeProps<Node<LayerNodeData>>) {
  const { selectNode, deleteNode, updateLayer, setPrimitiveViewportActive } = useNodeCanvasActions();
  const { layer, previewTargetId, selected, outputPath, editing, connected, primitiveViewState, primitiveRenderMode } =
    data;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';
  const targetHandles =
    layer.kind === 'primitive'
      ? [
          { id: inputPort, top: '38%' },
          { id: 'material', top: '66%' },
        ]
      : [{ id: inputPort }];
  const transform = useLayerTransformDraft(layer, updateLayer);

  return (
    <NodeFrame
      id={layer.id}
      kind={layer.kind}
      label={KIND_LABEL[layer.kind] ?? layer.kind}
      name={layer.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      muted={!layer.visible}
      targetHandles={targetHandles}
      onSelect={(event) => selectNode(layer.id, event)}
      onToggleMuted={() => updateLayer(layer.id, { visible: !layer.visible })}
      onDelete={() => deleteNode(layer.id)}
      onDragHandlePointerDown={
        layer.kind === 'primitive' || layer.kind === 'model'
          ? () => setPrimitiveViewportActive(layer.id, false)
          : undefined
      }
      deleteDisabled={layer.locked}
    >
      <LayerPreviewSurface
        layer={transform.effectiveLayer}
        previewTargetId={previewTargetId}
        primitiveViewState={primitiveViewState}
        primitiveRenderMode={primitiveRenderMode}
        selected={selected}
        transformActive={transform.hasDraft}
        onTransformDraft={transform.updateDraft}
        onTransformCommit={transform.commitDraft}
        onTransformWheelDelta={transform.handleWheelDelta}
      />
      <PortRow
        inputs={[
          { label: isEffect ? 'source' : 'backdrop', portId: inputPort, nodeId: layer.id },
          ...(layer.kind === 'primitive' ? [{ label: 'material', portId: 'material', nodeId: layer.id }] : []),
        ]}
        outputs={[{ label: 'result', portId: 'out', nodeId: layer.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const FallbackNodeComponent = memo(function FallbackNodeComponent({ data }: NodeProps<Node<FallbackNodeData>>) {
  const { selectNode } = useNodeCanvasActions();
  const { id, label, name, selected, outputPath, editing } = data;

  return (
    <NodeFrame
      id={id}
      kind="fallback"
      label={label}
      name={name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[]}
      sourceHandles={[]}
      onSelect={(event) => selectNode(id, event)}
    >
      <div className="node-fallback-empty" aria-hidden="true" />
    </NodeFrame>
  );
});

export const ExportNodeComponent = memo(function ExportNodeComponent({ data }: NodeProps<Node<ExportNodeData>>) {
  const { selectNode } = useNodeCanvasActions();
  const { previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={EXPORT_NODE_ID}
      kind="export"
      label="export"
      name="Output"
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[{ id: 'in' }]}
      sourceHandles={[]}
      onSelect={(event) => selectNode(EXPORT_NODE_ID, event)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow inputs={[{ label: 'final', portId: 'in', nodeId: EXPORT_NODE_ID }]} outputs={[]} connected={connected} />
    </NodeFrame>
  );
});
