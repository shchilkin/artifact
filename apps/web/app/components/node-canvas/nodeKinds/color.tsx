import { memo } from 'react';
import type { GraphColorNode } from '../../../utils/nodeKinds';
import { useGraphNodeHide, useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const ColorNodeComponent = memo(function ColorNodeComponent({ data }: GraphNodeComponentProps<GraphColorNode>) {
  const { selectNode } = useNodeCanvasActions();
  const { node: colorNode, previewTargetId, selected, outputPath, editing, connected } = data;

  const hideProps = useGraphNodeHide(colorNode);
  return (
    <NodeFrame
      id={colorNode.id}
      kind="color"
      label="color"
      name={colorNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[{ id: 'in' }]}
      onSelect={(event) => selectNode(colorNode.id, event)}
      {...hideProps}
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

export const colorNodeUi: GraphNodeKindUi<'color'> = {
  rfType: 'colorNode',
  Component: ColorNodeComponent,
};
