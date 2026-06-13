import { useState } from 'react';

import type { GraphScene3DNode } from '../../../types/config';
import { InspectorSection, InspectorSelect, InspectorSlider, InspectorTextInput, InspectorToggle } from './fields';

type Scene3DSection = 'scene' | 'material' | 'environment' | 'light';

function compactPercent(value: number | undefined, fallback = 100) {
  return `${Math.round(value ?? fallback)}%`;
}

function environmentSummary(scene3dNode: GraphScene3DNode) {
  if (scene3dNode.environmentName) return scene3dNode.environmentName;
  if (scene3dNode.environmentSrc) return 'Embedded environment';
  return 'Use env port';
}

function materialSummary(scene3dNode: GraphScene3DNode) {
  if (scene3dNode.materialMode === 'clay') return 'Clay material';
  if (scene3dNode.materialMode === 'unlit') return 'Texture only';
  return 'Original materials';
}

function LightCompass({ azimuth, elevation }: { azimuth: number; elevation: number }) {
  const azimuthRad = (azimuth * Math.PI) / 180;
  const radius = 34;
  const x = 50 + Math.sin(azimuthRad) * radius;
  const y = 50 - Math.cos(azimuthRad) * radius - (Math.max(-85, Math.min(85, elevation)) / 85) * 10;
  return (
    <div className="scene3d-light-map" aria-hidden="true">
      <div className="scene3d-light-compass">
        <span className="scene3d-light-axis scene3d-light-axis-horizontal" />
        <span className="scene3d-light-axis scene3d-light-axis-vertical" />
        <span className="scene3d-light-dot" style={{ left: `${x}%`, top: `${y}%` }} />
      </div>
      <div className="scene3d-light-map-copy">
        <span>Key direction</span>
        <strong>
          {Math.round(azimuth)} deg / {Math.round(elevation)} deg
        </strong>
      </div>
    </div>
  );
}

export function Scene3DInspector({
  scene3dNode,
  onChange,
  detached = false,
}: {
  scene3dNode: GraphScene3DNode;
  onChange: (patch: Partial<GraphScene3DNode>) => void;
  detached?: boolean;
}) {
  const [openSection, setOpenSection] = useState<Scene3DSection>('environment');
  const toggleSection = (section: Scene3DSection) => {
    setOpenSection((current) => (current === section ? 'scene' : section));
  };

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorSection
        title="Framing"
        summary={`Exposure ${compactPercent(scene3dNode.exposure)}`}
        open={openSection === 'scene'}
        onToggle={() => toggleSection('scene')}
      >
        <InspectorTextInput value={scene3dNode.name} onChange={(name) => onChange({ name })} />
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
      </InspectorSection>
      <InspectorSection
        title="Material"
        summary={materialSummary(scene3dNode)}
        open={openSection === 'material'}
        onToggle={() => toggleSection('material')}
      >
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
      </InspectorSection>
      <InspectorSection
        title="Environment"
        summary={`${environmentSummary(scene3dNode)} / ${compactPercent(scene3dNode.environmentStrength)}`}
        open={openSection === 'environment'}
        onToggle={() => toggleSection('environment')}
      >
        <div className="node-inspector-readout">
          <span>Source</span>
          <strong>{scene3dNode.environmentName || 'Connect Env Map node'}</strong>
          {scene3dNode.environmentBytes > 0 ? (
            <small>
              {scene3dNode.environmentMime || 'environment'} · {Math.round(scene3dNode.environmentBytes / 1024)} KB
            </small>
          ) : (
            <small>Lights and reflections use the environment input when connected.</small>
          )}
        </div>
        <InspectorSlider
          label="Env strength"
          value={scene3dNode.environmentStrength}
          min={0}
          max={200}
          overrideMax={500}
          onChange={(environmentStrength) => onChange({ environmentStrength })}
        />
      </InspectorSection>
      <InspectorSection
        title="Light Rig"
        summary={`Key ${compactPercent(scene3dNode.keyIntensity)} / Fill ${compactPercent(scene3dNode.fillIntensity, 35)}`}
        open={openSection === 'light'}
        onToggle={() => toggleSection('light')}
      >
        <LightCompass azimuth={scene3dNode.keyAzimuth} elevation={scene3dNode.keyElevation} />
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
          label="Key intensity"
          value={scene3dNode.keyIntensity}
          min={0}
          max={250}
          overrideMax={500}
          onChange={(keyIntensity) => onChange({ keyIntensity })}
        />
        <InspectorSlider
          label="Fill intensity"
          value={scene3dNode.fillIntensity}
          min={0}
          max={200}
          overrideMax={500}
          onChange={(fillIntensity) => onChange({ fillIntensity })}
        />
        <InspectorSlider
          label="Rim intensity"
          value={scene3dNode.rimIntensity}
          min={0}
          max={200}
          overrideMax={500}
          onChange={(rimIntensity) => onChange({ rimIntensity })}
        />
      </InspectorSection>
    </div>
  );
}
