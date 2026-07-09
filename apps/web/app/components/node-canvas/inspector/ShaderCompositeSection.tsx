import { useState } from 'react';
import type { GraphShaderNode } from '../../../types/config';
import { BLEND_OPTIONS } from '../constants';
import { BlendModeNote, InspectorSection, InspectorSelect, InspectorSlider } from './fields';

export function ShaderCompositeSection({
  shaderNode,
  onChange,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <InspectorSection
      title="Composite"
      summary={`${shaderNode.blendMode} / ${shaderNode.opacity}%`}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <div className="node-shader-flat-controls">
        <InspectorSelect
          label="Blend"
          value={shaderNode.blendMode}
          options={BLEND_OPTIONS}
          onChange={(value) => onChange({ blendMode: value })}
        />
        <InspectorSlider
          label="Opacity"
          value={shaderNode.opacity}
          min={0}
          max={100}
          onChange={(value) => onChange({ opacity: value })}
        />
      </div>
      <BlendModeNote value={shaderNode.blendMode} />
    </InspectorSection>
  );
}
