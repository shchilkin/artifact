import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';

import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../../types/config';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { useNodeCanvasActions } from '../context';
import { PortRow } from '../inspector/PortRow';
import { EnvironmentPreviewSurface, GeneratedEnvironmentPreviewSurface } from '../thumbnails/EnvironmentPreviewSurface';
import { LayerPreviewSurface } from '../thumbnails/LayerPreviewSurface';
import { NodeThumbnail } from '../thumbnails/NodeThumbnail';
import { Scene3DPreviewSurface } from '../thumbnails/Scene3DPreviewSurface';
import { TransformPreviewSurface } from '../thumbnails/TransformPreviewSurface';
import type {
  ColorNodeData,
  EnvironmentNodeData,
  ExportNodeData,
  FallbackNodeData,
  GrimeShadowNodeData,
  LayerNodeData,
  MaskNodeData,
  MaterialNodeData,
  MergeNodeData,
  RepeatNodeData,
  Scene3DNodeData,
  TransformNodeData,
} from '../types';
import { NodeFrame } from './NodeFrame';
import { useLayerTransformDraft } from './useLayerTransformDraft';
import { useTransformNodeDraft } from './useTransformNodeDraft';

export const LayerNodeComponent = memo(function LayerNodeComponent({ data }: NodeProps<LayerNodeData>) {
  const { selectNode, deleteNode, updateLayer, setPrimitiveViewportActive } = useNodeCanvasActions();
  const { layer, previewTargetId, selected, outputPath, editing, connected, primitiveViewState, primitiveRenderMode } =
    data;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';
  const targetHandles =
    layer.kind === 'primitive'
      ? [
          { id: inputPort, top: '38%' },
          { id: 'material', top: '66%' },
        ]
      : [{ id: inputPort }];
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
      targetHandles={targetHandles}
      onSelect={(event) => selectNode(layer.id, event)}
      onToggleMuted={() => updateLayer(layer.id, { visible: !layer.visible })}
      onDelete={() => deleteNode(layer.id)}
      onDragHandlePointerDown={
        layer.kind === 'primitive' || layer.kind === 'model'
          ? () => setPrimitiveViewportActive(layer.id, false)
          : undefined
      }
      deleteDisabled={layer.locked}
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
        inputs={[
          { label: isEffect ? 'source' : 'backdrop', portId: inputPort, nodeId: layer.id },
          ...(layer.kind === 'primitive' ? [{ label: 'material', portId: 'material', nodeId: layer.id }] : []),
        ]}
        outputs={[{ label: 'result', portId: 'out', nodeId: layer.id }]}
        connected={connected}
      />
    </NodeFrame>
  );
});

export const MaterialNodeComponent = memo(function MaterialNodeComponent({ data }: NodeProps<MaterialNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { materialNode, previewTargetId, selected, outputPath, editing, connected } = data;
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

export const ColorNodeComponent = memo(function ColorNodeComponent({ data }: NodeProps<ColorNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
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
      onDelete={() => deleteNode(colorNode.id)}
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
  const { selectNode, deleteNode } = useNodeCanvasActions();
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
      onDelete={() => deleteNode(mergeNode.id)}
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
  const { selectNode, deleteNode } = useNodeCanvasActions();
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
      onDelete={() => deleteNode(repeatNode.id)}
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

export const MaskNodeComponent = memo(function MaskNodeComponent({ data }: NodeProps<MaskNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { maskNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={maskNode.id}
      kind="mask"
      label="mask"
      name={maskNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[
        { id: 'in', top: '36%' },
        { id: 'mask', top: '64%' },
      ]}
      onSelect={(event) => selectNode(maskNode.id, event)}
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

export const TransformNodeComponent = memo(function TransformNodeComponent({ data }: NodeProps<TransformNodeData>) {
  const { selectNode, deleteNode, updateTransformNode } = useNodeCanvasActions();
  const { transformNode, previewTargetId, sourcePreviewTargetId, selected, outputPath, editing, connected } = data;
  const transform = useTransformNodeDraft(transformNode, updateTransformNode);

  return (
    <NodeFrame
      id={transformNode.id}
      kind="transform"
      label="transform"
      name={transformNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
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

export const GrimeShadowNodeComponent = memo(function GrimeShadowNodeComponent({
  data,
}: NodeProps<GrimeShadowNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { grimeShadowNode, previewTargetId, selected, outputPath, editing, connected } = data;

  return (
    <NodeFrame
      id={grimeShadowNode.id}
      kind="grimeShadow"
      label="shadow"
      name={grimeShadowNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
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

export const Scene3DNodeComponent = memo(function Scene3DNodeComponent({ data }: NodeProps<Scene3DNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const {
    scene3dNode,
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

  return (
    <NodeFrame
      id={scene3dNode.id}
      kind="scene3d"
      label="3d scene"
      name={scene3dNode.name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[
        { id: 'model', top: '25%' },
        { id: 'material', top: '43%' },
        { id: 'env', top: '61%' },
        { id: 'bg', top: '79%' },
      ]}
      onSelect={(event) => selectNode(scene3dNode.id, event)}
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

export const EnvironmentNodeComponent = memo(function EnvironmentNodeComponent({
  data,
}: NodeProps<EnvironmentNodeData>) {
  const { selectNode, deleteNode } = useNodeCanvasActions();
  const { environmentNode, previewTargetId, sourcePreviewTargetId, selected, outputPath, editing, connected } = data;
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

export const FallbackNodeComponent = memo(function FallbackNodeComponent({ data }: NodeProps<FallbackNodeData>) {
  const { selectNode } = useNodeCanvasActions();
  const { id, label, name, selected, outputPath, editing } = data;

  return (
    <NodeFrame
      id={id}
      kind="fallback"
      label={label}
      name={name}
      selected={selected}
      outputPath={outputPath}
      editing={editing}
      targetHandles={[]}
      sourceHandles={[]}
      onSelect={(event) => selectNode(id, event)}
    >
      <div className="node-fallback-empty" aria-hidden="true" />
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
