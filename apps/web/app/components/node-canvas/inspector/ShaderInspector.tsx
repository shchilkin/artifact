import { useState } from 'react';

import type { GraphShaderNode, ShaderKind } from '../../../types/config';
import { BLEND_OPTIONS } from '../constants';
import {
  BlendModeNote,
  InspectorColorInput,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextInput,
} from './fields';

const SHADER_KIND_OPTIONS: Array<{ value: ShaderKind; label: string }> = [
  { value: 'paperTexture', label: 'Paper Texture' },
  { value: 'water', label: 'Water' },
  { value: 'waterCaustic', label: 'Water Caustic' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'liquidMetal', label: 'Liquid Metal' },
  { value: 'gemSmoke', label: 'Gem Smoke' },
  { value: 'meshGradient', label: 'Mesh Gradient' },
  { value: 'staticRadialGradient', label: 'Static Radial Gradient' },
  { value: 'grainGradient', label: 'Grain Gradient' },
  { value: 'dotOrbit', label: 'Dot Orbit' },
  { value: 'dotGrid', label: 'Dot Grid' },
  { value: 'moire', label: 'Moire' },
  { value: 'concentricPatterns', label: 'Concentric Patterns' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'swirl', label: 'Swirl' },
  { value: 'waves', label: 'Waves' },
  { value: 'glowingWave', label: 'Glowing Wave' },
  { value: 'neuroNoise', label: 'Neuro Noise' },
  { value: 'perlin', label: 'Perlin' },
  { value: 'simplexNoise', label: 'Simplex Noise' },
  { value: 'voronoi', label: 'Voronoi' },
  { value: 'borderRings', label: 'Border Rings' },
  { value: 'metaballs', label: 'Metaballs' },
  { value: 'colorPanels', label: 'Color Panels' },
  { value: 'smokeRing', label: 'Smoke Ring' },
  { value: 'noiseField', label: 'Noise Field' },
  { value: 'marble', label: 'Marble' },
  { value: 'liquid', label: 'Liquid' },
];

export function ShaderInspector({
  shaderNode,
  onChange,
  detached = false,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  detached?: boolean;
}) {
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const [compositeOpen, setCompositeOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={shaderNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Fill"
        value={shaderNode.shaderKind}
        options={SHADER_KIND_OPTIONS}
        onChange={(value) => onChange({ shaderKind: value as ShaderKind })}
      />
      <InspectorSection
        title="Palette"
        summary="2 main colors"
        open={paletteOpen}
        onToggle={() => setPaletteOpen((open) => !open)}
      >
        <InspectorColorInput
          label="Color A"
          value={shaderNode.colorA}
          onChange={(value) => onChange({ colorA: value })}
        />
        <InspectorColorInput
          label="Color B"
          value={shaderNode.colorB}
          onChange={(value) => onChange({ colorB: value })}
        />
      </InspectorSection>
      <InspectorSection
        title="Detail"
        summary="distortion / grain"
        open={detailOpen}
        onToggle={() => setDetailOpen((open) => !open)}
      >
        <InspectorSlider
          label="Distortion"
          value={shaderNode.distortion}
          min={0}
          max={100}
          onChange={(value) => onChange({ distortion: value })}
        />
        <InspectorSlider
          label="Grain"
          value={shaderNode.grain}
          min={0}
          max={100}
          onChange={(value) => onChange({ grain: value })}
        />
      </InspectorSection>
      <InspectorSection
        title="Composite"
        summary={`${shaderNode.blendMode} / ${shaderNode.opacity}%`}
        open={compositeOpen}
        onToggle={() => setCompositeOpen((open) => !open)}
      >
        <InspectorSelect
          label="Blend"
          value={shaderNode.blendMode}
          options={BLEND_OPTIONS}
          onChange={(value) => onChange({ blendMode: value })}
        />
        <BlendModeNote value={shaderNode.blendMode} />
        <InspectorSlider
          label="Opacity"
          value={shaderNode.opacity}
          min={0}
          max={100}
          onChange={(value) => onChange({ opacity: value })}
        />
      </InspectorSection>
      <InspectorSection
        title="Advanced"
        summary="secondary colors / placement"
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((open) => !open)}
      >
        <InspectorColorInput
          label="Color C"
          value={shaderNode.colorC}
          onChange={(value) => onChange({ colorC: value })}
        />
        <InspectorColorInput
          label="Color D"
          value={shaderNode.colorD}
          onChange={(value) => onChange({ colorD: value })}
        />
        <InspectorSlider
          label="Swirl"
          value={shaderNode.swirl}
          min={0}
          max={100}
          onChange={(value) => onChange({ swirl: value })}
        />
        <InspectorSlider
          label="Scale"
          value={shaderNode.scale}
          min={20}
          max={300}
          onChange={(value) => onChange({ scale: value })}
        />
        <InspectorSlider
          label="Rotation"
          value={shaderNode.rotation}
          min={0}
          max={360}
          onChange={(value) => onChange({ rotation: value })}
        />
        <InspectorSlider
          label="Offset X"
          value={shaderNode.offsetX}
          min={-100}
          max={100}
          onChange={(value) => onChange({ offsetX: value })}
        />
        <InspectorSlider
          label="Offset Y"
          value={shaderNode.offsetY}
          min={-100}
          max={100}
          onChange={(value) => onChange({ offsetY: value })}
        />
        <InspectorSlider
          label="Seed Offset"
          value={shaderNode.seedOffset}
          min={0}
          max={9999}
          onChange={(value) => onChange({ seedOffset: value })}
        />
      </InspectorSection>
      <p className="node-inspector-note">
        Use standalone, connect a backdrop for a shader pass, or feed material maps.
      </p>
    </div>
  );
}
