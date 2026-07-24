import type { GraphShaderNode, ShaderKind, ShaderRole } from '../../../types/config';
import { makeDefaultCodeShaderInstance } from '../../../utils/customShaderCode';
import { defaultShaderPalette } from '../../../utils/shaderPalette';
import { useNodeCanvasActions } from '../context';
import { AiShaderInspector } from './AiShaderInspector';
import { CodeShaderInspector } from './CodeShaderInspector';
import { InspectorSelect, InspectorTextInput } from './fields';
import { PresetShaderInspector } from './PresetShaderInspector';
import { ShaderCompositeSection } from './ShaderCompositeSection';
import { shaderInspectorRoleNote, shaderInspectorRoleStatus, showsPresetShaderControls } from './ShaderInspectorModel';

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

const SHADER_MODE_OPTIONS: Array<{ value: ShaderMode; label: string }> = [
  { value: 'preset', label: 'Shader Fill / Effect' },
  { value: 'ai', label: 'AI Shader Effect' },
  { value: 'code', label: 'Code Shader' },
];

type ShaderMode = 'preset' | 'ai' | 'code';
const SHADER_ROLE_OPTIONS: Array<{ value: ShaderRole; label: string }> = [
  { value: 'fill', label: 'Fill' },
  { value: 'effect', label: 'Effect' },
];

export function ShaderInspector({
  shaderNode,
  onChange,
  sourceConnected = false,
  detached = false,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  sourceConnected?: boolean;
  detached?: boolean;
}) {
  const { setShaderNodeGenerationStatus } = useNodeCanvasActions();
  const shaderMode = shaderModeForKind(shaderNode.shaderKind);
  const preset = showsPresetShaderControls(shaderNode.shaderKind);
  const roleStatus = shaderInspectorRoleStatus(shaderNode.shaderKind, shaderNode.role, sourceConnected);
  const handleKindChange = (value: string) => {
    const shaderKind = value as ShaderKind;
    const role = shaderKind === 'aiShader' ? 'effect' : shaderNode.shaderKind === 'aiShader' ? 'fill' : shaderNode.role;
    setShaderNodeGenerationStatus(shaderNode.id, null);
    onChange({
      shaderKind,
      role,
      palette: defaultShaderPalette(shaderKind),
      ...(shaderKind === 'aiShader'
        ? { shaderInstance: shaderNode.shaderKind === 'aiShader' ? shaderNode.shaderInstance : undefined }
        : {}),
      ...(shaderKind === 'customCode'
        ? {
            shaderInstance:
              shaderNode.shaderKind === 'customCode' && shaderNode.shaderInstance
                ? shaderNode.shaderInstance
                : makeDefaultCodeShaderInstance(shaderNode.id),
          }
        : {}),
    });
  };
  const handleRoleChange = (value: string) => {
    const role = value as ShaderRole;
    onChange({ role });
  };
  const handleModeChange = (value: string) => {
    const mode = value as ShaderMode;
    if (mode === 'ai') return handleKindChange('aiShader');
    if (mode === 'code') return handleKindChange('customCode');
    if (!preset) handleKindChange('meshGradient');
  };

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput label="Name" value={shaderNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Shader type"
        value={shaderMode}
        options={SHADER_MODE_OPTIONS}
        onChange={handleModeChange}
      />
      {shaderMode === 'preset' && (
        <InspectorSelect
          label="Preset"
          value={shaderNode.shaderKind}
          options={SHADER_KIND_OPTIONS}
          onChange={handleKindChange}
        />
      )}
      {shaderMode !== 'ai' && (
        <InspectorSelect
          label="Role"
          value={shaderNode.role}
          options={SHADER_ROLE_OPTIONS}
          onChange={handleRoleChange}
        />
      )}
      <ShaderRoleStatus status={roleStatus} />
      {shaderNode.shaderKind === 'aiShader' && (
        <AiShaderInspector shaderNode={shaderNode} onChange={onChange} sourceConnected={sourceConnected} />
      )}
      {shaderNode.shaderKind === 'customCode' && <CodeShaderInspector shaderNode={shaderNode} onChange={onChange} />}
      {preset && (
        <PresetShaderInspector
          shaderNode={shaderNode}
          onChange={onChange}
          sourceConnected={shaderNode.role === 'effect' && sourceConnected}
        />
      )}
      {!preset && shaderNode.role === 'effect' && sourceConnected && (
        <ShaderCompositeSection shaderNode={shaderNode} onChange={onChange} />
      )}
      <p className="node-inspector-note">{shaderInspectorRoleNote(shaderNode.shaderKind, shaderNode.role)}</p>
    </div>
  );
}

function ShaderRoleStatus({ status }: { status: ReturnType<typeof shaderInspectorRoleStatus> }) {
  return (
    <div className={`node-shader-role-status node-shader-role-status-${status.mode}`}>
      <span>Role</span>
      <strong>{status.label}</strong>
      <p>{status.message}</p>
    </div>
  );
}

function shaderModeForKind(shaderKind: ShaderKind): ShaderMode {
  if (shaderKind === 'aiShader') return 'ai';
  if (shaderKind === 'customCode') return 'code';
  return 'preset';
}
