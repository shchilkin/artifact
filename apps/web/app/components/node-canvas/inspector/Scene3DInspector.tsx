/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';

import type { GraphScene3DNode } from '../../../types/config';
import { NoPan } from '../nodes/NoPan';
import { InspectorSection, InspectorSelect, InspectorSlider, InspectorTextInput, InspectorToggle } from './fields';

type Scene3DSection = 'scene' | 'material' | 'environment' | 'light';

type Scene3DRigPreset = {
  id: string;
  name: string;
  summary: string;
  patch: Partial<GraphScene3DNode>;
};

export const SCENE3D_RIG_PRESETS: readonly Scene3DRigPreset[] = [
  {
    id: 'product',
    name: 'Product light',
    summary: 'Balanced key with soft fill',
    patch: {
      materialMode: 'original',
      exposure: 118,
      ambientIntensity: 105,
      keyAzimuth: 35,
      keyElevation: 36,
      keyIntensity: 150,
      fillIntensity: 72,
      rimIntensity: 46,
    },
  },
  {
    id: 'console',
    name: 'Flat console',
    summary: 'Even light for palette work',
    patch: {
      materialMode: 'clay',
      exposure: 112,
      ambientIntensity: 150,
      keyAzimuth: 20,
      keyElevation: 48,
      keyIntensity: 88,
      fillIntensity: 108,
      rimIntensity: 24,
    },
  },
  {
    id: 'harsh',
    name: 'Harsh key',
    summary: 'Deep PS-era shadow',
    patch: {
      materialMode: 'original',
      exposure: 126,
      ambientIntensity: 34,
      keyAzimuth: -42,
      keyElevation: 22,
      keyIntensity: 220,
      fillIntensity: 16,
      rimIntensity: 74,
    },
  },
  {
    id: 'backlit',
    name: 'Backlit',
    summary: 'Rim-heavy silhouette',
    patch: {
      materialMode: 'original',
      exposure: 120,
      ambientIntensity: 58,
      keyAzimuth: 150,
      keyElevation: 30,
      keyIntensity: 82,
      fillIntensity: 28,
      rimIntensity: 160,
    },
  },
  {
    id: 'unlit',
    name: 'Clay unlit',
    summary: 'Shape check, no drama',
    patch: {
      materialMode: 'unlit',
      exposure: 100,
      ambientIntensity: 160,
      keyAzimuth: 0,
      keyElevation: 45,
      keyIntensity: 0,
      fillIntensity: 0,
      rimIntensity: 0,
    },
  },
];

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

function activeRigPresetId(scene3dNode: GraphScene3DNode) {
  return SCENE3D_RIG_PRESETS.find((preset) =>
    Object.entries(preset.patch).every(([key, value]) => scene3dNode[key as keyof GraphScene3DNode] === value),
  )?.id;
}

function RigPresetButtons({
  activePresetId,
  onSelect,
}: {
  activePresetId?: string;
  onSelect: (patch: Partial<GraphScene3DNode>) => void;
}) {
  return (
    <div className="scene3d-rig-presets" aria-label="Scene light rig presets">
      {SCENE3D_RIG_PRESETS.map((preset) => (
        <NoPan
          as="button"
          type="button"
          key={preset.id}
          className={`scene3d-rig-preset${preset.id === activePresetId ? ' scene3d-rig-preset-active' : ''}`}
          onClick={() => onSelect(preset.patch)}
        >
          <span>{preset.name}</span>
          <small>{preset.summary}</small>
        </NoPan>
      ))}
    </div>
  );
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
  const activePresetId = activeRigPresetId(scene3dNode);
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
        summary={`${environmentSummary(scene3dNode)} / ${compactPercent(scene3dNode.environmentStrength)} / ${Math.round(
          scene3dNode.environmentRotation,
        )} deg`}
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
        <InspectorSlider
          label="Env rotation"
          value={scene3dNode.environmentRotation}
          min={-180}
          max={180}
          onChange={(environmentRotation) => onChange({ environmentRotation })}
        />
      </InspectorSection>
      <InspectorSection
        title="Light Rig"
        summary={`Key ${compactPercent(scene3dNode.keyIntensity)} / Fill ${compactPercent(scene3dNode.fillIntensity, 35)}`}
        open={openSection === 'light'}
        onToggle={() => toggleSection('light')}
      >
        <RigPresetButtons activePresetId={activePresetId} onSelect={(patch) => onChange(patch)} />
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
