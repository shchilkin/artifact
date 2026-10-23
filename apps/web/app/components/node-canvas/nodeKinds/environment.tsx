import { memo } from 'react';
import type { GraphEnvironmentNode } from '../../../utils/nodeKinds';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { EnvironmentPreviewSurface, GeneratedEnvironmentPreviewSurface } from '../thumbnails/EnvironmentPreviewSurface';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const EnvironmentNodeComponent = memo(function EnvironmentNodeComponent({
  data,
}: GraphNodeComponentProps<GraphEnvironmentNode, { sourcePreviewTargetId: string | null }>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const {
    node: environmentNode,
    previewTargetId,
    sourcePreviewTargetId,
    selected,
    outputPath,
    editing,
    connected,
  } = data;
  const rendersSource = Boolean(sourcePreviewTargetId);

  return (
    <NodeFrame
      id={environmentNode.id}
      kind="environment"
      label="env map"
      name={environmentNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[{ id: 'in' }]}
      onSelect={(event) => selectNode(environmentNode.id, event)}
      onDelete={() => deleteNode(environmentNode.id)}
    >
      {rendersSource ? (
        <GeneratedEnvironmentPreviewSurface previewTargetId={previewTargetId} />
      ) : (
        <EnvironmentPreviewSurface environmentNode={environmentNode} />
      )}
      <PortRow
        inputs={[{ label: rendersSource ? 'source' : 'source optional', portId: 'in', nodeId: environmentNode.id }]}
        outputs={[{ label: 'environment', portId: 'out', nodeId: environmentNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const environmentNodeUi: GraphNodeKindUi<'environment', { sourcePreviewTargetId: string | null }> = {
  rfType: 'environmentNode',
  rfData: (node, context) => ({ sourcePreviewTargetId: context.incomingNodeId(node.id, 'in') }),
  Component: EnvironmentNodeComponent,
};
