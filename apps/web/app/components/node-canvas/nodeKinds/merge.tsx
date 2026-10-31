import { memo } from 'react';
import type { GraphMergeNode } from '../../../utils/nodeKinds';
import { useGraphNodeHide, useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const MergeNodeComponent = memo(function MergeNodeComponent({ data }: GraphNodeComponentProps<GraphMergeNode>) {
  const { selectNode } = useNodeCanvasActions();
  const { node: mergeNode, previewTargetId, selected, outputPath, editing, connected } = data;

  const hideProps = useGraphNodeHide(mergeNode);
  return (
    <NodeFrame
      id={mergeNode.id}
      kind="merge"
      label="merge"
      name={mergeNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[
        { id: 'a', top: '36%' },
        { id: 'b', top: '64%' },
      ]}
      onSelect={(event) => selectNode(mergeNode.id, event)}
      {...hideProps}
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

export const mergeNodeUi: GraphNodeKindUi<'merge'> = {
  rfType: 'mergeNode',
  Component: MergeNodeComponent,
};
