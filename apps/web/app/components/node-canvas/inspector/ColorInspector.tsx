import type { GraphColorNode } from '../../../types/config';
import { InspectorSlider, InspectorTextInput } from './fields';

export function ColorInspector({
  colorNode,
  onChange,
}: {
  colorNode: GraphColorNode;
  onChange: (patch: Partial<GraphColorNode>) => void;
}) {
  return (
    <div className="node-inspector-stack">
      <InspectorTextInput value={colorNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSlider
        label="Contrast"
        value={colorNode.contrast}
        min={0}
        max={200}
        onChange={(value) => onChange({ contrast: value })}
      />
      <InspectorSlider
        label="Brightness"
        value={colorNode.brightness}
        min={0}
        max={200}
        onChange={(value) => onChange({ brightness: value })}
      />
      <InspectorSlider
        label="Saturation"
        value={colorNode.saturation}
        min={0}
        max={200}
        onChange={(value) => onChange({ saturation: value })}
      />
      <InspectorSlider
        label="Hue"
        value={colorNode.hue}
        min={-180}
        max={180}
        onChange={(value) => onChange({ hue: value })}
      />
    </div>
  );
}
