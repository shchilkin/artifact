import type { GraphRepeatNode } from '../../../types/config';
import { ARRAY_PATTERN_OPTIONS } from '../../layer-controls/fieldDefs';
import { BLEND_OPTIONS } from '../constants';
import { InspectorSelect, InspectorSlider, InspectorTextInput } from './fields';

export function RepeatInspector({
  repeatNode,
  onChange,
  detached = false,
}: {
  repeatNode: GraphRepeatNode;
  onChange: (patch: Partial<GraphRepeatNode>) => void;
  detached?: boolean;
}) {
  const isRadial = repeatNode.pattern === 'radial';
  const isGrid = repeatNode.pattern === 'grid';

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={repeatNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Pattern"
        value={repeatNode.pattern}
        options={[...ARRAY_PATTERN_OPTIONS]}
        onChange={(value) => onChange({ pattern: value as GraphRepeatNode['pattern'] })}
      />
      <InspectorSlider
        label={isGrid ? 'Columns' : isRadial ? 'Per Ring' : 'Items'}
        value={repeatNode.count}
        min={1}
        max={24}
        overrideMax={96}
        onChange={(value) => onChange({ count: value })}
      />
      <InspectorSlider
        label={isRadial ? 'Rings' : 'Rows'}
        value={repeatNode.rows}
        min={1}
        max={12}
        overrideMax={48}
        onChange={(value) => onChange({ rows: value })}
      />
      <InspectorSlider
        label={isRadial ? 'Ring Gap' : 'Gap'}
        value={repeatNode.gap}
        min={12}
        max={220}
        overrideMax={480}
        onChange={(value) => onChange({ gap: value })}
      />
      {isRadial && (
        <InspectorSlider
          label="Start Radius"
          value={repeatNode.radius}
          min={0}
          max={220}
          overrideMax={480}
          onChange={(value) => onChange({ radius: value })}
        />
      )}
      <InspectorSlider
        label="Scale"
        value={repeatNode.scale}
        min={4}
        max={120}
        overrideMax={300}
        onChange={(value) => onChange({ scale: value })}
      />
      <InspectorSlider
        label="Jitter"
        value={repeatNode.jitter}
        min={0}
        max={100}
        overrideMax={260}
        onChange={(value) => onChange({ jitter: value })}
      />
      <InspectorSlider
        label="Rotation"
        value={repeatNode.rotation}
        min={-180}
        max={180}
        onChange={(value) => onChange({ rotation: value })}
      />
      <InspectorSlider
        label="Seed Offset"
        value={Math.round(repeatNode.seedOffset ?? 0)}
        min={-999}
        max={999}
        overrideMax={9999}
        onChange={(value) => onChange({ seedOffset: value })}
      />
      <InspectorSelect
        label="Blend"
        value={repeatNode.blendMode}
        options={BLEND_OPTIONS}
        onChange={(value) => onChange({ blendMode: value })}
      />
      <InspectorSlider
        label="Opacity"
        value={repeatNode.opacity}
        min={0}
        max={100}
        onChange={(value) => onChange({ opacity: value })}
      />
      <p className="node-inspector-note">Repeats the source input over the optional backdrop input.</p>
    </div>
  );
}
