import { useState } from 'react';

import type {
  CanvasDocument,
  GraphEnvironmentNode,
  GraphScene3DNode,
  ModelLayer,
  PrimitiveLayer,
} from '../../../types/config';
import { getSceneEnvironmentNode, getSceneModelLayer } from '../../../utils/scene3DInputs';
import { EnvironmentInspector } from './EnvironmentInspector';
import { InspectorReadout, InspectorSection } from './fields';
import { Scene3DInspector } from './Scene3DInspector';

/**
 * The inspector for a 3D Scene target. Layers and Nodes both render it: what feeds the scene, the scene settings,
 * then the connected environment map's settings.
 */
export function SceneTargetInspector({
  doc,
  scene,
  onUpdateScene,
  onUpdateEnvironment,
  onLoadEnvironmentFile,
}: {
  doc: CanvasDocument;
  scene: GraphScene3DNode;
  onUpdateScene: (patch: Partial<GraphScene3DNode>) => void;
  onUpdateEnvironment: (id: string, patch: Partial<GraphEnvironmentNode>) => void;
  onLoadEnvironmentFile?: (id: string, file: File) => void;
}) {
  const model = getSceneModelLayer(doc.graph, doc.layers, scene.id);
  const environment = getSceneEnvironmentNode(doc.graph, scene.id);
  const materialInputConnected = (doc.graph?.edges ?? []).some(
    (edge) => edge.toId === scene.id && edge.toPort === 'material',
  );
  return (
    <div className="artifact-inspector-stack">
      <SceneInputsSection model={model} environment={environment} scene={scene} />
      <Scene3DInspector
        key={scene.id}
        scene3dNode={scene}
        materialInputConnected={materialInputConnected}
        onChange={onUpdateScene}
        detached
      />
      {environment && (
        <EnvironmentInspector
          key={environment.id}
          environmentNode={environment}
          onChange={(patch) => onUpdateEnvironment(environment.id, patch)}
          onLoadFile={onLoadEnvironmentFile ? (file) => onLoadEnvironmentFile(environment.id, file) : undefined}
          detached
        />
      )}
    </div>
  );
}

function SceneInputsSection({
  model,
  environment,
  scene,
}: {
  model: ModelLayer | PrimitiveLayer | null;
  environment: GraphEnvironmentNode | null;
  scene: GraphScene3DNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <InspectorSection
      title="Scene Inputs"
      summary={model ? sceneSourceName(model) : 'No source'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <InspectorReadout
        label="3D Source"
        value={sceneSourceName(model)}
        detail={model ? sceneSourceDetail(model) : 'Connect a model or primitive to the scene in Nodes.'}
      />
      <InspectorReadout
        label="Environment Map"
        value={environment?.environmentName || scene.environmentName || 'No environment connected'}
        detail={environmentDetail(environment, scene)}
      />
    </InspectorSection>
  );
}

function sceneSourceName(model: ModelLayer | PrimitiveLayer | null) {
  if (!model) return 'No source connected';
  if (model.kind === 'model') return model.modelName || model.name;
  return model.name || `${model.primitiveShape} primitive`;
}

function sceneSourceDetail(model: ModelLayer | PrimitiveLayer) {
  if (model.kind === 'model') return `${model.modelMime || 'model'} · ${Math.round(model.modelBytes / 1024)} KB`;
  return `${model.primitiveShape} · procedural mesh`;
}

function environmentDetail(environment: GraphEnvironmentNode | null, scene: GraphScene3DNode) {
  if (environment) {
    return `${environment.environmentMime || 'environment'} · ${Math.round(environment.environmentBytes / 1024)} KB`;
  }
  if (scene.environmentName) {
    return `${scene.environmentMime || 'environment'} · ${Math.round(scene.environmentBytes / 1024)} KB`;
  }
  return 'Connect an environment map to the scene in Nodes.';
}
