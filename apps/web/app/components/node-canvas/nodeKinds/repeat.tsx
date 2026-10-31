import { memo } from 'react';
import type { GraphRepeatNode } from '../../../utils/nodeKinds';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const RepeatNodeComponent = memo(function RepeatNodeComponent({ data }: GraphNodeComponentProps<GraphRepeatNode>) {
  const { selectNode } = useNodeCanvasActions();
  const { node: repeatNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={repeatNode.id}
      kind="repeat"
      label="repeat"
      name={repeatNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
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

export const repeatNodeUi: GraphNodeKindUi<'repeat'> = {
  rfType: 'repeatNode',
  Component: RepeatNodeComponent,
};
