import type { GraphMaskNode } from '../../../types/config';
import { InspectorSelect, InspectorSlider, InspectorTextInput, InspectorToggle } from './fields';

const MASK_MODE_OPTIONS: GraphMaskNode['mode'][] = ['alpha', 'luma', 'threshold'];

export function MaskInspector({
  maskNode,
  onChange,
  detached = false,
}: {
  maskNode: GraphMaskNode;
  onChange: (patch: Partial<GraphMaskNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput label="Name" value={maskNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Mode"
        value={maskNode.mode}
        options={MASK_MODE_OPTIONS}
        onChange={(value) => onChange({ mode: value as GraphMaskNode['mode'] })}
      />
      <InspectorToggle label="Invert" checked={maskNode.invert} onChange={(invert) => onChange({ invert })} />
      <InspectorSlider
        label="Threshold"
        value={maskNode.threshold}
        min={0}
        max={100}
        onChange={(threshold) => onChange({ threshold })}
      />
      <InspectorSlider
        label="Feather"
        value={maskNode.feather}
        min={0}
        max={48}
        overrideMax={160}
        onChange={(feather) => onChange({ feather })}
      />
      <InspectorSlider
        label="Expand"
        value={maskNode.expand}
        min={0}
        max={36}
        overrideMax={120}
        onChange={(expand) => onChange({ expand })}
      />
      <InspectorSlider
        label="Opacity"
        value={maskNode.opacity}
        min={0}
        max={100}
        onChange={(opacity) => onChange({ opacity })}
      />
      <p className="node-inspector-note">Cuts the source input by alpha or brightness from the mask input.</p>
    </div>
  );
}
