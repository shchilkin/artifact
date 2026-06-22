import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';

import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { LayerPreviewSurface } from '../thumbnails/LayerPreviewSurface';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { ColorNodeData, ExportNodeData, LayerNodeData, MergeNodeData, RepeatNodeData } from '../types';
import { NodeFrame } from './NodeFrame';
import { useLayerTransformDraft } from './useLayerTransformDraft';

export const LayerNodeComponent = memo(function LayerNodeComponent({ data }: NodeProps<LayerNodeData>) {
  const { selectNode, updateLayer } = useNodeCanvasActions();
  const { layer, previewTargetId, selected, outputPath, editing, connected, primitiveViewState, primitiveRenderMode } =
    data;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';
  const transform = useLayerTransformDraft(layer, updateLayer);

  return (
    <NodeFrame
      id={layer.id}
      kind={layer.kind}
      label={layer.kind}
      name={layer.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      muted={!layer.visible}
      targetHandles={[{ id: inputPort }]}
      onSelect={(event) => selectNode(layer.id, event)}
      onToggleMuted={() => updateLayer(layer.id, { visible: !layer.visible })}
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
        inputs={[{ label: isEffect ? 'source' : 'backdrop', portId: inputPort, nodeId: layer.id }]}
        outputs={[{ label: 'result', portId: 'out', nodeId: layer.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const ColorNodeComponent = memo(function ColorNodeComponent({ data }: NodeProps<ColorNodeData>) {
  const { selectNode } = useNodeCanvasActions();
  const { colorNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={colorNode.id}
      kind="color"
      label="color"
      name={colorNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[{ id: 'in' }]}
      onSelect={(event) => selectNode(colorNode.id, event)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow
        inputs={[{ label: 'source', portId: 'in', nodeId: colorNode.id }]}
        outputs={[{ label: 'graded', portId: 'out', nodeId: colorNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const MergeNodeComponent = memo(function MergeNodeComponent({ data }: NodeProps<MergeNodeData>) {
  const { selectNode } = useNodeCanvasActions();
  const { mergeNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={mergeNode.id}
      kind="merge"
      label="merge"
      name={mergeNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[
        { id: 'a', top: '36%' },
        { id: 'b', top: '64%' },
      ]}
      onSelect={(event) => selectNode(mergeNode.id, event)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
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

export const RepeatNodeComponent = memo(function RepeatNodeComponent({ data }: NodeProps<RepeatNodeData>) {
  const { selectNode } = useNodeCanvasActions();
  const { repeatNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={repeatNode.id}
      kind="repeat"
      label="repeat"
      name={repeatNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[
        { id: 'in', top: '36%' },
        { id: 'bg', top: '64%' },
      ]}
      onSelect={(event) => selectNode(repeatNode.id, event)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow
        inputs={[
          { label: 'source', portId: 'in', nodeId: repeatNode.id },
          { label: 'backdrop', portId: 'bg', nodeId: repeatNode.id },
        ]}
        outputs={[{ label: 'result', portId: 'out', nodeId: repeatNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const ExportNodeComponent = memo(function ExportNodeComponent({ data }: NodeProps<ExportNodeData>) {
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
      targetHandles={[{ id: 'in' }]}
      sourceHandles={[]}
      onSelect={(event) => selectNode(EXPORT_NODE_ID, event)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow inputs={[{ label: 'final', portId: 'in', nodeId: EXPORT_NODE_ID }]} outputs={[]} connected={connected} />
    </NodeFrame>
  );
});
