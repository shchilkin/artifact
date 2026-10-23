import { memo } from 'react';
import type { GraphGrimeShadowNode } from '../../../utils/nodeKinds';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const GrimeShadowNodeComponent = memo(function GrimeShadowNodeComponent({
  data,
}: GraphNodeComponentProps<GraphGrimeShadowNode>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { node: grimeShadowNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={grimeShadowNode.id}
      kind="grimeShadow"
      label="shadow"
      name={grimeShadowNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[{ id: 'in' }]}
      onSelect={(event) => selectNode(grimeShadowNode.id, event)}
      onDelete={() => deleteNode(grimeShadowNode.id)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow
        inputs={[{ label: 'source', portId: 'in', nodeId: grimeShadowNode.id }]}
        outputs={[{ label: 'result', portId: 'out', nodeId: grimeShadowNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const grimeShadowNodeUi: GraphNodeKindUi<'grimeShadow'> = {
  rfType: 'grimeShadowNode',
  Component: GrimeShadowNodeComponent,
};
