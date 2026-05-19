import type { GraphMergeNode } from '../../../types/config';
import { BLEND_OPTIONS } from '../constants';
import { BlendModeNote, InspectorSelect, InspectorSlider, InspectorTextInput } from './fields';

export function MergeInspector({
  mergeNode,
  onChange,
  detached = false,
}: {
  mergeNode: GraphMergeNode;
  onChange: (patch: Partial<GraphMergeNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={mergeNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Blend"
        value={mergeNode.blendMode}
        options={BLEND_OPTIONS}
        onChange={(value) => onChange({ blendMode: value })}
      />
      <BlendModeNote value={mergeNode.blendMode} />
      <InspectorSlider
        label="Opacity"
        value={mergeNode.opacity}
        min={0}
        max={100}
        onChange={(value) => onChange({ opacity: value })}
      />
    </div>
  );
}
