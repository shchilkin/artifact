import { memo } from 'react';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../../types/config';
import type { GraphMaterialNode } from '../../../utils/nodeKinds';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import type { GraphNodeComponentProps, GraphNodeKindUi } from './types';

const MaterialNodeComponent = memo(function MaterialNodeComponent({
  data,
}: GraphNodeComponentProps<GraphMaterialNode>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { node: materialNode, previewTargetId, selected, outputPath, editing, connected } = data;
  const materialInputs = [
    { label: 'base / albedo', portId: 'albedo', nodeId: materialNode.id },
    { label: 'roughness', portId: 'roughness', nodeId: materialNode.id },
    { label: 'metalness', portId: 'metalness', nodeId: materialNode.id },
    { label: 'normal', portId: 'normal', nodeId: materialNode.id },
    { label: 'alpha', portId: 'alpha', nodeId: materialNode.id },
  ];

  return (
    <NodeFrame
      id={materialNode.id}
      kind="material"
      label="material"
      name={materialNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={MATERIAL_TEXTURE_INPUT_PORTS.map((id, index) => ({
        id,
        top: `${24 + index * 13}%`,
      }))}
      onSelect={(event) => selectNode(materialNode.id, event)}
      onDelete={() => deleteNode(materialNode.id)}
    >
      <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
      <PortRow
        inputs={materialInputs}
        outputs={[{ label: 'material surface', portId: 'out', nodeId: materialNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const materialNodeUi: GraphNodeKindUi<'material'> = {
  rfType: 'materialNode',
  Component: MaterialNodeComponent,
};
