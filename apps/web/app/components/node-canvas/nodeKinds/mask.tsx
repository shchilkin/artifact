import { memo } from 'react';
import type { GraphMaskNode } from '../../../utils/nodeKinds';
import { useGraphNodeHide, useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const MaskNodeComponent = memo(function MaskNodeComponent({ data }: GraphNodeComponentProps<GraphMaskNode>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { node: maskNode, previewTargetId, selected, outputPath, editing, connected } = data;

  const hideProps = useGraphNodeHide(maskNode);
  return (
    <NodeFrame
      id={maskNode.id}
      kind="mask"
      label="mask"
      name={maskNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[
        { id: 'in', top: '36%' },
        { id: 'mask', top: '64%' },
      ]}
      onSelect={(event) => selectNode(maskNode.id, event)}
      {...hideProps}
      onDelete={() => deleteNode(maskNode.id)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow
        inputs={[
          { label: 'source', portId: 'in', nodeId: maskNode.id },
          { label: 'mask', portId: 'mask', nodeId: maskNode.id },
        ]}
        outputs={[{ label: 'cut', portId: 'out', nodeId: maskNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const maskNodeUi: GraphNodeKindUi<'mask'> = {
  rfType: 'maskNode',
  Component: MaskNodeComponent,
};
