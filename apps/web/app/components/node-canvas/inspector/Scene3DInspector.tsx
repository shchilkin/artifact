/* eslint-disable react-refresh/only-export-components */
import { type ChangeEvent, useRef, useState } from 'react';

import { makeScene3DSettings, type Scene3DSettings } from '../../../types/config';
import { NoPan } from '../nodes/NoPan';
import { InspectorReadout, InspectorSection, InspectorSelect, InspectorSlider, InspectorToggle } from './fields';

type Scene3DSection = 'lighting' | 'environment' | null;

type Scene3DRigPreset = {
  id: string;
  name: string;
  summary: string;
  patch: Partial<Scene3DSettings>;
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

function environmentSummary(scene: Scene3DSettings) {
  if (scene.environmentName) return scene.environmentName;
  if (scene.environmentSrc) return 'Embedded environment';
  return 'None';
}

function activeRigPresetId(scene: Scene3DSettings) {
  return SCENE3D_RIG_PRESETS.find((preset) =>
    Object.entries(preset.patch).every(([key, value]) => scene[key as keyof Scene3DSettings] === value),
  )?.id;
}

function RigPresetButtons({
  activePresetId,
  onSelect,
}: {
  activePresetId?: string;
  onSelect: (patch: Partial<Scene3DSettings>) => void;
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

const ENVIRONMENT_ACCEPT = '.hdr,.exr,image/vnd.radiance,image/x-exr';

/**
 * Lighting and Environment sections for a 3D Object layer. Scene lighting is optional: without it the object renders
 * with its default light rig; with it the layer renders full frame over its backdrop with these lights, an optional
 * environment map, and the material on its material port.
 */
export function Scene3DSections({
  scene,
  onChange,
  onLoadEnvironmentFile,
}: {
  scene: Scene3DSettings | undefined;
  onChange: (scene: Scene3DSettings | undefined) => void;
  onLoadEnvironmentFile?: (file: File) => void;
}) {
  const [openSection, setOpenSection] = useState<Scene3DSection>(null);
  const toggleSection = (section: Exclude<Scene3DSection, null>) =>
    setOpenSection((current) => (current === section ? null : section));
  const patch = (next: Partial<Scene3DSettings>) => scene && onChange({ ...scene, ...next });

  return (
    <>
      <InspectorSection
        title="Lighting"
        summary={
          scene
            ? `Key ${compactPercent(scene.keyIntensity)} / Exposure ${compactPercent(scene.exposure)}`
            : 'Default light'
        }
        open={openSection === 'lighting'}
        onToggle={() => toggleSection('lighting')}
      >
        <InspectorToggle
          label="Scene lighting"
          checked={Boolean(scene)}
          onChange={(enabled) => onChange(enabled ? makeScene3DSettings() : undefined)}
        />
        {scene ? (
          <>
            <InspectorToggle
              label="Transparent"
              checked={scene.transparent}
              onChange={(transparent) => patch({ transparent })}
            />
            <InspectorSelect
              label="Material"
              value={scene.materialMode}
              options={[
                { value: 'original', label: 'Original' },
                { value: 'clay', label: 'Clay' },
                { value: 'unlit', label: 'Unlit' },
              ]}
              onChange={(materialMode) => patch({ materialMode: materialMode as Scene3DSettings['materialMode'] })}
            />
            <InspectorSlider
              label="Exposure"
              value={scene.exposure}
              min={10}
              max={250}
              overrideMax={500}
              onChange={(exposure) => patch({ exposure })}
            />
            <RigPresetButtons activePresetId={activeRigPresetId(scene)} onSelect={patch} />
            <LightCompass azimuth={scene.keyAzimuth} elevation={scene.keyElevation} />
            <InspectorSlider
              label="Ambient"
              value={scene.ambientIntensity}
              min={0}
              max={220}
              overrideMax={500}
              onChange={(ambientIntensity) => patch({ ambientIntensity })}
            />
            <InspectorSlider
              label="Key azimuth"
              value={scene.keyAzimuth}
              min={-180}
              max={180}
              onChange={(keyAzimuth) => patch({ keyAzimuth })}
            />
            <InspectorSlider
              label="Key elevation"
              value={scene.keyElevation}
              min={-85}
              max={85}
              onChange={(keyElevation) => patch({ keyElevation })}
            />
            <InspectorSlider
              label="Key intensity"
              value={scene.keyIntensity}
              min={0}
              max={250}
              overrideMax={500}
              onChange={(keyIntensity) => patch({ keyIntensity })}
            />
            <InspectorSlider
              label="Fill intensity"
              value={scene.fillIntensity}
              min={0}
              max={200}
              overrideMax={500}
              onChange={(fillIntensity) => patch({ fillIntensity })}
            />
            <InspectorSlider
              label="Rim intensity"
              value={scene.rimIntensity}
              min={0}
              max={200}
              overrideMax={500}
              onChange={(rimIntensity) => patch({ rimIntensity })}
            />
          </>
        ) : (
          <p className="artifact-inspector-note">Turn on to set lights, exposure, and an environment map.</p>
        )}
      </InspectorSection>
      {scene ? (
        <InspectorSection
          title="Environment"
          summary={`${environmentSummary(scene)} / ${compactPercent(scene.environmentStrength)}`}
          open={openSection === 'environment'}
          onToggle={() => toggleSection('environment')}
        >
          <InspectorReadout
            label="Map"
            value={environmentSummary(scene)}
            detail={
              scene.environmentBytes > 0
                ? `${scene.environmentMime || 'environment'} · ${Math.round(scene.environmentBytes / 1024)} KB`
                : 'An EXR or HDR map lights and reflects on the object. Without one, a node on the env port is used.'
            }
          />
          <EnvironmentFileActions
            hasMap={Boolean(scene.environmentSrc)}
            onLoadFile={onLoadEnvironmentFile}
            onClear={() => patch({ environmentSrc: '', environmentName: '', environmentMime: '', environmentBytes: 0 })}
          />
          <InspectorSlider
            label="Strength"
            value={scene.environmentStrength}
            min={0}
            max={200}
            overrideMax={500}
            onChange={(environmentStrength) => patch({ environmentStrength })}
          />
          <InspectorSlider
            label="Rotation"
            value={scene.environmentRotation}
            min={-180}
            max={180}
            onChange={(environmentRotation) => patch({ environmentRotation })}
          />
        </InspectorSection>
      ) : null}
    </>
  );
}

function EnvironmentFileActions({
  hasMap,
  onLoadFile,
  onClear,
}: {
  hasMap: boolean;
  onLoadFile?: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onLoadFile?.(file);
  };
  return (
    <>
      {onLoadFile ? (
        <>
          <button
            className="artifact-inspector-action nodrag nopan nowheel"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            {hasMap ? 'Replace map' : 'Load map'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ENVIRONMENT_ACCEPT}
            aria-label="Environment map file"
            className="node-hidden-file-input"
            onChange={handleFileChange}
            tabIndex={-1}
          />
        </>
      ) : null}
      {hasMap ? (
        <button className="artifact-inspector-action nodrag nopan nowheel" type="button" onClick={onClear}>
          Remove map
        </button>
      ) : null}
    </>
  );
}
