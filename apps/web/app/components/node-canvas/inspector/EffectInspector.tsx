import { useState } from 'react';
import type { EffectEntry, EffectLayer, EffectPreset } from '../../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../../../types/config';
import {
  type EffectId,
  type EffectParamKey,
  effectDefinition,
  effectParam,
  isEffectActive,
  isEffectId,
} from '../../../types/effectSchema';
import { EFFECT_META } from '../../../utils/effectInfo';
import { addEffectEntry, moveEffectEntry, removeEffectEntry, updateEffectEntry } from '../../../utils/effectStack';
import { FIELD_RANGES } from '../../layer-controls/fieldDefs';
import { BLEND_OPTIONS } from '../constants';
import { NoPan } from '../nodes/NoPan';
import { EffectEntryControls, formatEffectSliderValue } from './EffectControlSections';
import {
  BlendModeNote,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextInput,
  InspectorToggle,
} from './fields';

const NODE_SECTION = 'node';

/** Effects the "Add effect" picker offers, in library order. */
const ADDABLE_EFFECTS = EFFECT_PRESET_MENU_ORDER.filter((preset): preset is EffectPreset & EffectId =>
  isEffectId(preset),
);

export function EffectInspector({
  layer,
  onChange,
  detached = false,
}: {
  layer: EffectLayer;
  onChange: (patch: Partial<EffectLayer>) => void;
  detached?: boolean;
}) {
  const [openSection, setOpenSection] = useState<string | null>(() => layer.effects[0]?.id ?? NODE_SECTION);
  const toggleSection = (id: string) => setOpenSection((current) => (current === id ? null : id));
  const setEffects = (effects: EffectEntry[]) => onChange({ effects });

  return (
    <div className={effectInspectorClassName(detached)}>
      <EffectDescription preset={layer.preset} />
      {layer.effects.map((entry, index) => (
        <EffectEntrySection
          key={entry.id}
          entry={entry}
          index={index}
          count={layer.effects.length}
          open={openSection === entry.id}
          onToggle={() => toggleSection(entry.id)}
          onParamsChange={(params) => setEffects(updateEffectEntry(layer.effects, entry.id, { params }))}
          onEnabledChange={(enabled) => setEffects(updateEffectEntry(layer.effects, entry.id, { enabled }))}
          onMove={(delta) => setEffects(moveEffectEntry(layer.effects, entry.id, delta))}
          onRemove={() => setEffects(removeEffectEntry(layer.effects, entry.id))}
        />
      ))}
      <AddEffectControl
        onAdd={(effect) => {
          const effects = addEffectEntry(layer.effects, effect, EFFECT_PRESETS[effect].partial);
          setEffects(effects);
          setOpenSection(effects.at(-1)?.id ?? null);
        }}
      />
      <EffectNodeSection
        layer={layer}
        open={openSection === NODE_SECTION}
        onToggle={() => toggleSection(NODE_SECTION)}
        onChange={onChange}
      />
    </div>
  );
}

function effectInspectorClassName(detached: boolean) {
  return detached ? 'artifact-inspector-stack' : 'artifact-inspector-stack artifact-inspector-detached';
}

function effectName(effect: EffectId) {
  return EFFECT_PRESETS[effect].name;
}

/** The section summary: the effect's first amount, or "off". */
function effectEntrySummary(entry: EffectEntry) {
  if (!entry.enabled) return 'off';
  if (!isEffectActive(entry.params, entry.effect)) return 'no effect';
  const amountKey = effectDefinition(entry.effect).amounts[0] as EffectParamKey;
  const param = effectParam(amountKey);
  const amount = entry.params[amountKey];
  if (param.type !== 'number' || typeof amount !== 'number') return '';
  return `${formatEffectSliderValue(amount, param.format)} ${param.label.toLowerCase()}`;
}

function EffectEntrySection({
  entry,
  index,
  count,
  open,
  onToggle,
  onParamsChange,
  onEnabledChange,
  onMove,
  onRemove,
}: {
  entry: EffectEntry;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onParamsChange: (params: EffectEntry['params']) => void;
  onEnabledChange: (enabled: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const name = effectName(entry.effect);
  return (
    <InspectorSection title={name} summary={effectEntrySummary(entry)} open={open} onToggle={onToggle}>
      <EffectEntryControls entry={entry} onChange={onParamsChange} />
      <InspectorToggle label="On" checked={entry.enabled} onChange={onEnabledChange} />
      <div className="artifact-inspector-effect-actions">
        <NoPan
          as="button"
          type="button"
          className="artifact-inspector-action"
          aria-label={`Move ${name} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          Up
        </NoPan>
        <NoPan
          as="button"
          type="button"
          className="artifact-inspector-action"
          aria-label={`Move ${name} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          Down
        </NoPan>
        <NoPan
          as="button"
          type="button"
          className="artifact-inspector-action"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        >
          Remove
        </NoPan>
      </div>
    </InspectorSection>
  );
}

const ADD_EFFECT_PLACEHOLDER = '';

function AddEffectControl({ onAdd }: { onAdd: (effect: EffectId) => void }) {
  return (
    <InspectorSelect
      label="Add effect"
      value={ADD_EFFECT_PLACEHOLDER}
      options={[
        { value: ADD_EFFECT_PLACEHOLDER, label: 'Choose…' },
        ...ADDABLE_EFFECTS.map((effect) => ({ value: effect, label: effectName(effect) })),
      ]}
      onChange={(value) => {
        if (isEffectId(value)) onAdd(value);
      }}
    />
  );
}

function EffectNodeSection({
  layer,
  open,
  onToggle,
  onChange,
}: {
  layer: EffectLayer;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<EffectLayer>) => void;
}) {
  return (
    <InspectorSection title="Blend" summary={`${Math.round(layer.mix)}% mix`} open={open} onToggle={onToggle}>
      <InspectorTextInput label="Name" value={layer.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSlider
        label="Mix"
        value={Math.round(layer.mix)}
        min={0}
        max={100}
        formatValue={(value) => formatEffectSliderValue(value, 'percent')}
        unit="%"
        onChange={(value) => onChange({ mix: value })}
      />
      <InspectorSlider
        label="Seed"
        value={Math.round(layer.seedOffset ?? 0)}
        {...FIELD_RANGES.seedOffset}
        onChange={(value) => onChange({ seedOffset: value })}
      />
      <InspectorToggle
        label="Use source alpha"
        checked={layer.maskAlpha}
        onChange={(value) => onChange({ maskAlpha: value })}
      />
      <InspectorSelect
        label="Blend"
        value={layer.blendMode ?? 'normal'}
        options={BLEND_OPTIONS}
        onChange={(value) => onChange({ blendMode: value })}
      />
      <BlendModeNote value={layer.blendMode ?? 'normal'} />
    </InspectorSection>
  );
}

function EffectDescription({ preset }: { preset: EffectPreset | undefined }) {
  const primary = preset ? EFFECT_PRESETS[preset]?.primary : null;
  const description = primary ? EFFECT_META[primary]?.description : null;
  return description ? <p className="artifact-inspector-effect-description">{description}</p> : null;
}
