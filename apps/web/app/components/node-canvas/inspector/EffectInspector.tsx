import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectLayer, EffectPreset } from '../../../types/config';
import { EFFECT_PRESETS } from '../../../types/config';
import { EFFECT_META } from '../../../utils/effectInfo';
import { EffectInfoPopup } from '../../EffectInfoPopup';
import { FIELD_RANGES } from '../../layer-controls/fieldDefs';
import { BLEND_OPTIONS } from '../constants';
import type { EffectSectionId } from '../types';
import { EffectControlSections } from './EffectControlSections';
import { EFFECT_CONTROL_PRESETS, effectSectionSummary, initialEffectSection } from './effectSectionModel';
import {
  BlendModeNote,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextInput,
  InspectorToggle,
} from './fields';

export function EffectInspector({
  layer,
  onChange,
  detached = false,
}: {
  layer: EffectLayer;
  onChange: (patch: Partial<EffectLayer>) => void;
  detached?: boolean;
}) {
  const [openSection, setOpenSection] = useState<EffectSectionId | null>(() => initialEffectSection(layer));
  const [infoState, setInfoState] = useState<{ key: string; rect: DOMRect } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleInfoEnter = useCallback((key: string, rect: DOMRect) => {
    clearTimeout(closeTimerRef.current);
    setInfoState({ key, rect });
  }, []);

  const handleInfoLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setInfoState(null), 150);
  }, []);

  const showSection = (presets: readonly EffectPreset[]) => effectSectionVisible(layer.preset, presets);

  return (
    <div className={effectInspectorClassName(detached)}>
      <EffectInspectorHeader layer={layer} />

      <EffectNodeSection
        layer={layer}
        open={openSection === 'node'}
        onOpenChange={setOpenSection}
        onChange={onChange}
      />

      <EffectPresetControlNote preset={layer.preset} />

      <EffectControlSections
        layer={layer}
        openSection={openSection}
        setOpenSection={setOpenSection}
        showSection={showSection}
        showControl={showSection}
        onChange={onChange}
        onInfoEnter={handleInfoEnter}
        onInfoLeave={handleInfoLeave}
      />

      <EffectInfoPortal
        infoState={infoState}
        onInfoEnter={() => clearTimeout(closeTimerRef.current)}
        onInfoLeave={handleInfoLeave}
      />
    </div>
  );
}

function effectInspectorClassName(detached: boolean) {
  return detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached';
}

function effectSectionVisible(preset: EffectPreset | undefined, presets: readonly EffectPreset[]) {
  return preset ? presets.includes(preset) : true;
}

function EffectInspectorHeader({ layer }: { layer: EffectLayer }) {
  return (
    <>
      <div className="node-badge-row">
        <span className="node-badge">{effectPresetLabel(layer.preset)}</span>
      </div>
      <EffectDescription preset={layer.preset} />
    </>
  );
}

function EffectNodeSection({
  layer,
  open,
  onOpenChange,
  onChange,
}: {
  layer: EffectLayer;
  open: boolean;
  onOpenChange: (section: EffectSectionId | null) => void;
  onChange: (patch: Partial<EffectLayer>) => void;
}) {
  return (
    <InspectorSection
      title="Node"
      summary={effectSectionSummary(layer, 'node')}
      open={open}
      onToggle={() => onOpenChange(open ? null : 'node')}
    >
      <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
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

function effectPresetLabel(preset: EffectPreset | undefined) {
  if (!preset) return 'custom';
  return EFFECT_PRESETS[preset]?.name ?? preset;
}

function EffectDescription({ preset }: { preset: EffectPreset | undefined }) {
  const description = effectPresetDescription(preset);
  return description ? <p className="node-inspector-effect-description">{description}</p> : null;
}

function effectPresetDescription(preset: EffectPreset | undefined) {
  return effectDescription(primaryEffectKeyForPreset(preset));
}

function primaryEffectKeyForPreset(preset: EffectPreset | undefined) {
  if (!preset) return null;
  return EFFECT_PRESETS[preset]?.primary ?? null;
}

function effectDescription(effectKey: keyof typeof EFFECT_META | null) {
  if (!effectKey) return null;
  return EFFECT_META[effectKey]?.description ?? null;
}

function EffectPresetControlNote({ preset }: { preset: EffectPreset | undefined }) {
  if (effectPresetHasControls(preset)) return null;
  return (
    <div className="node-inspector-note">
      This effect uses fixed defaults in the node inspector for now. You can still rename it, change blend/mask
      behavior, or add another focused effect node after it.
    </div>
  );
}

function effectPresetHasControls(preset: EffectPreset | undefined) {
  return !preset || EFFECT_CONTROL_PRESETS.includes(preset);
}

function EffectInfoPortal({
  infoState,
  onInfoEnter,
  onInfoLeave,
}: {
  infoState: { key: string; rect: DOMRect } | null;
  onInfoEnter: () => void;
  onInfoLeave: () => void;
}) {
  if (!infoState || typeof document === 'undefined') return null;
  return createPortal(
    <EffectInfoPopup
      effectKey={infoState.key}
      anchorRect={infoState.rect}
      sidebarRight={infoState.rect.right}
      onMouseEnter={onInfoEnter}
      onMouseLeave={onInfoLeave}
    />,
    document.body,
  );
}
