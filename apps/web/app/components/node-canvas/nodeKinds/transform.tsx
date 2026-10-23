import { memo } from 'react';
import type { GraphTransformNode } from '../../../utils/nodeKinds';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { useTransformNodeDraft } from '../nodes/useTransformNodeDraft';
import { TransformPreviewSurface } from '../thumbnails/TransformPreviewSurface';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const TransformNodeComponent = memo(function TransformNodeComponent({
  data,
}: GraphNodeComponentProps<GraphTransformNode, { sourcePreviewTargetId: string | null }>) {
  const { selectNode, deleteNode, updateGraphNode } = useNodeCanvasActions();
  const {
    node: transformNode,
    previewTargetId,
    sourcePreviewTargetId,
    selected,
    outputPath,
    editing,
    connected,
  } = data;
  const transform = useTransformNodeDraft(transformNode, updateGraphNode);

  return (
    <NodeFrame
      id={transformNode.id}
      kind="transform"
      label="transform"
      name={transformNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[{ id: 'in' }]}
      onSelect={(event) => selectNode(transformNode.id, event)}
      onDelete={() => deleteNode(transformNode.id)}
    >
      <TransformPreviewSurface
        transformNode={transform.effectiveTransformNode}
        previewTargetId={previewTargetId}
        sourcePreviewTargetId={sourcePreviewTargetId}
        selected={selected}
        transformActive={transform.hasDraft}
        onTransformDraft={transform.updateDraft}
        onTransformCommit={transform.commitDraft}
        onTransformWheelDelta={transform.handleWheelDelta}
      />
      <PortRow
        inputs={[{ label: 'source', portId: 'in', nodeId: transformNode.id }]}
        outputs={[{ label: 'result', portId: 'out', nodeId: transformNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const transformNodeUi: GraphNodeKindUi<'transform', { sourcePreviewTargetId: string | null }> = {
  rfType: 'transformNode',
  rfData: (node, context) => ({ sourcePreviewTargetId: context.incomingNodeId(node.id, 'in') }),
  Component: TransformNodeComponent,
};
