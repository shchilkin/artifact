import { memo } from 'react';
import type { ModelLayer, PrimitiveLayer } from '../../../types/config';
import { findGraphNodeOfKind } from '../../../utils/nodeGraph';
import type { GraphMaterialNode, GraphScene3DNode } from '../../../utils/nodeKinds';
import type { PrimitiveViewportState } from '../../PrimitiveViewportState';
import { useGraphNodeHide, useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { NodeFrame } from '../nodes/NodeFrame';
import { Scene3DPreviewSurface } from '../thumbnails/Scene3DPreviewSurface';
import type { BuildRFNodeContext, GraphNodeComponentProps, GraphNodeKindUi } from './types';

const Scene3DNodeComponent = memo(function Scene3DNodeComponent({
  data,
}: GraphNodeComponentProps<GraphScene3DNode, Scene3DNodeExtra>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const {
    node: scene3dNode,
    previewTargetId,
    modelPreviewTargetId,
    modelLayer,
    materialNode,
    backdropPreviewTargetId,
    environmentPreviewTargetId,
    environmentSource,
    sceneViewState,
    selected,
    outputPath,
    editing,
    connected,
  } = data;

  const hideProps = useGraphNodeHide(scene3dNode);
  return (
    <NodeFrame
      id={scene3dNode.id}
      kind="scene3d"
      label="3d scene"
      name={scene3dNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      connected={connected}
      targetHandles={[
        { id: 'model', top: '25%' },
        { id: 'material', top: '43%' },
        { id: 'env', top: '61%' },
        { id: 'bg', top: '79%' },
      ]}
      onSelect={(event) => selectNode(scene3dNode.id, event)}
      {...hideProps}
      onDelete={() => deleteNode(scene3dNode.id)}
    >
      <Scene3DPreviewSurface
        scene3dNode={scene3dNode}
        selected={selected}
        previewTargetId={previewTargetId}
        modelLayer={modelLayer}
        materialNode={materialNode}
        sceneViewState={sceneViewState}
        backdropPreviewTargetId={backdropPreviewTargetId}
        environmentPreviewTargetId={environmentPreviewTargetId}
        environmentSource={environmentSource}
      />
      <PortRow
        inputs={[
          { label: modelPreviewTargetId ? 'model' : 'model required', portId: 'model', nodeId: scene3dNode.id },
          { label: 'material', portId: 'material', nodeId: scene3dNode.id },
          { label: 'environment', portId: 'env', nodeId: scene3dNode.id },
          { label: 'backdrop', portId: 'bg', nodeId: scene3dNode.id },
        ]}
        outputs={[{ label: 'render', portId: 'out', nodeId: scene3dNode.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

type Scene3DNodeExtra = {
  modelPreviewTargetId: string | null;
  modelLayer: ModelLayer | PrimitiveLayer | null;
  materialNode: GraphMaterialNode | null;
  backdropPreviewTargetId: string | null;
  environmentPreviewTargetId: string | null;
  environmentSource: string | null;
  sceneViewState?: PrimitiveViewportState;
};

function scene3dRFData(node: GraphScene3DNode, context: BuildRFNodeContext): Scene3DNodeExtra {
  const modelPreviewTargetId = context.incomingNodeId(node.id, 'model');
  const materialPreviewTargetId = context.incomingNodeId(node.id, 'material');
  const environmentPreviewTargetId = context.incomingNodeId(node.id, 'env');
  const modelLayer =
    context.doc.layers.find(
      (layer): layer is ModelLayer | PrimitiveLayer =>
        layer.id === modelPreviewTargetId && (layer.kind === 'model' || layer.kind === 'primitive'),
    ) ?? null;
  const materialNode = materialPreviewTargetId
    ? (findGraphNodeOfKind(context.graph, 'material', materialPreviewTargetId) ?? null)
    : null;
  const environmentNode = environmentPreviewTargetId
    ? findGraphNodeOfKind(context.graph, 'environment', environmentPreviewTargetId)
    : undefined;
  return {
    modelPreviewTargetId,
    modelLayer,
    materialNode,
    backdropPreviewTargetId: context.incomingNodeId(node.id, 'bg'),
    environmentPreviewTargetId,
    environmentSource: environmentNode?.environmentSrc ?? null,
    sceneViewState: context.primitiveViewStates[node.id],
  };
}

export const scene3dNodeUi: GraphNodeKindUi<'scene3d', Scene3DNodeExtra> = {
  rfType: 'scene3dNode',
  rfData: scene3dRFData,
  Component: Scene3DNodeComponent,
};
