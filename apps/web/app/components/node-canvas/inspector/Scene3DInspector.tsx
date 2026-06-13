import type { GraphScene3DNode } from '../../../types/config';
import { InspectorSelect, InspectorSlider, InspectorTextInput, InspectorToggle } from './fields';

export function Scene3DInspector({
  scene3dNode,
  onChange,
  detached = false,
}: {
  scene3dNode: GraphScene3DNode;
  onChange: (patch: Partial<GraphScene3DNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={scene3dNode.name} onChange={(name) => onChange({ name })} />
      <div className="node-inspector-readout">
        <span>Environment</span>
        <strong>{scene3dNode.environmentName || 'Port input'}</strong>
        {scene3dNode.environmentBytes > 0 && (
          <small>
            {scene3dNode.environmentMime || 'environment'} · {Math.round(scene3dNode.environmentBytes / 1024)} KB
          </small>
        )}
      </div>
      <InspectorSelect
        label="Material"
        value={scene3dNode.materialMode}
        options={[
          { value: 'original', label: 'Original' },
          { value: 'clay', label: 'Clay' },
          { value: 'unlit', label: 'Unlit' },
        ]}
        onChange={(materialMode) => onChange({ materialMode: materialMode as GraphScene3DNode['materialMode'] })}
      />
      <InspectorToggle
        label="Transparent"
        checked={scene3dNode.transparent}
        onChange={(transparent) => onChange({ transparent })}
      />
      <InspectorSlider
        label="Exposure"
        value={scene3dNode.exposure}
        min={10}
        max={250}
        overrideMax={500}
        onChange={(exposure) => onChange({ exposure })}
      />
      <InspectorSlider
        label="Environment"
        value={scene3dNode.environmentStrength}
        min={0}
        max={200}
        overrideMax={500}
        onChange={(environmentStrength) => onChange({ environmentStrength })}
      />
      <InspectorSlider
        label="Ambient"
        value={scene3dNode.ambientIntensity}
        min={0}
        max={220}
        overrideMax={500}
        onChange={(ambientIntensity) => onChange({ ambientIntensity })}
      />
      <InspectorSlider
        label="Key azimuth"
        value={scene3dNode.keyAzimuth}
        min={-180}
        max={180}
        onChange={(keyAzimuth) => onChange({ keyAzimuth })}
      />
      <InspectorSlider
        label="Key elevation"
        value={scene3dNode.keyElevation}
        min={-85}
        max={85}
        onChange={(keyElevation) => onChange({ keyElevation })}
      />
      <InspectorSlider
        label="Key"
        value={scene3dNode.keyIntensity}
        min={0}
        max={250}
        overrideMax={500}
        onChange={(keyIntensity) => onChange({ keyIntensity })}
      />
      <InspectorSlider
        label="Fill"
        value={scene3dNode.fillIntensity}
        min={0}
        max={200}
        overrideMax={500}
        onChange={(fillIntensity) => onChange({ fillIntensity })}
      />
      <InspectorSlider
        label="Rim"
        value={scene3dNode.rimIntensity}
        min={0}
        max={200}
        overrideMax={500}
        onChange={(rimIntensity) => onChange({ rimIntensity })}
      />
    </div>
  );
}
