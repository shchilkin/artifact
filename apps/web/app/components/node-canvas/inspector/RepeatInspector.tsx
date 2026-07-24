import type { GraphRepeatNode } from '../../../types/config';
import { ARRAY_PATTERN_OPTIONS } from '../../layer-controls/fieldDefs';
import { BLEND_OPTIONS } from '../constants';
import { BlendModeNote, InspectorSelect, InspectorSlider, InspectorTextInput } from './fields';

export function RepeatInspector({
  repeatNode,
  onChange,
  detached = false,
}: {
  repeatNode: GraphRepeatNode;
  onChange: (patch: Partial<GraphRepeatNode>) => void;
  detached?: boolean;
}) {
  const copy = repeatInspectorCopy(repeatNode.pattern);
  const rotationMode = repeatNode.rotationMode ?? 'fixed';

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput label="Name" value={repeatNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Pattern"
        value={repeatNode.pattern}
        options={[...ARRAY_PATTERN_OPTIONS]}
        onChange={(value) => onChange({ pattern: value as GraphRepeatNode['pattern'] })}
      />
      <InspectorSlider
        label={copy.countLabel}
        value={repeatNode.count}
        min={1}
        max={24}
        overrideMax={96}
        onChange={(value) => onChange({ count: value })}
      />
      <InspectorSlider
        label={copy.rowsLabel}
        value={repeatNode.rows}
        min={1}
        max={12}
        overrideMax={48}
        onChange={(value) => onChange({ rows: value })}
      />
      <InspectorSlider
        label={copy.gapLabel}
        value={repeatNode.gap}
        min={12}
        max={220}
        overrideMax={480}
        onChange={(value) => onChange({ gap: value })}
      />
      <RepeatRadiusSlider repeatNode={repeatNode} onChange={onChange} />
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
      <InspectorSelect
        label="Rotation Mode"
        value={rotationMode}
        options={['fixed', 'radial', 'step', 'random']}
        onChange={(value) => onChange({ rotationMode: value as GraphRepeatNode['rotationMode'] })}
      />
      <RepeatRotationControls repeatNode={repeatNode} rotationMode={rotationMode} onChange={onChange} />
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
      <BlendModeNote value={repeatNode.blendMode} />
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

function repeatInspectorCopy(pattern: GraphRepeatNode['pattern']) {
  return REPEAT_COPY[pattern] ?? REPEAT_COPY.stack;
}

const REPEAT_COPY = {
  radial: { countLabel: 'Per Ring', rowsLabel: 'Rings', gapLabel: 'Ring Gap' },
  grid: { countLabel: 'Columns', rowsLabel: 'Rows', gapLabel: 'Gap' },
  stack: { countLabel: 'Items', rowsLabel: 'Rows', gapLabel: 'Gap' },
} as const;

function RepeatRotationControls({
  repeatNode,
  rotationMode,
  onChange,
}: {
  repeatNode: GraphRepeatNode;
  rotationMode: GraphRepeatNode['rotationMode'];
  onChange: (patch: Partial<GraphRepeatNode>) => void;
}) {
  return (
    <>
      <RepeatRotationStepSlider repeatNode={repeatNode} rotationMode={rotationMode} onChange={onChange} />
      <InspectorSlider
        label="Rotation Jitter"
        value={repeatNode.rotationJitter ?? 0}
        min={0}
        max={180}
        onChange={(value) => onChange({ rotationJitter: value })}
      />
    </>
  );
}

function RepeatRotationStepSlider({
  repeatNode,
  rotationMode,
  onChange,
}: {
  repeatNode: GraphRepeatNode;
  rotationMode: GraphRepeatNode['rotationMode'];
  onChange: (patch: Partial<GraphRepeatNode>) => void;
}) {
  if (rotationMode !== 'step') return null;
  return (
    <InspectorSlider
      label="Rotation Step"
      value={repeatNode.rotationStep ?? 0}
      min={-180}
      max={180}
      onChange={(value) => onChange({ rotationStep: value })}
    />
  );
}

function RepeatRadiusSlider({
  repeatNode,
  onChange,
}: {
  repeatNode: GraphRepeatNode;
  onChange: (patch: Partial<GraphRepeatNode>) => void;
}) {
  if (repeatNode.pattern !== 'radial') return null;
  return (
    <InspectorSlider
      label="Start Radius"
      value={repeatNode.radius}
      min={0}
      max={220}
      overrideMax={480}
      onChange={(value) => onChange({ radius: value })}
    />
  );
}
