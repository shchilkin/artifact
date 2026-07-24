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
      <RetroRecipeNote preset={layer.preset} />

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
      <InspectorTextInput label="Name" value={layer.name} onChange={(value) => onChange({ name: value })} />
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

const RETRO_RECIPE_STEPS: Partial<
  Record<
    EffectPreset,
    {
      step: string;
      title: string;
      detail: string;
    }
  >
> = {
  retroResolution: {
    step: '1 / 4',
    title: 'Sample down',
    detail: 'Start the PS-era finish by lowering the source resolution before color mapping.',
  },
  indexedPalette: {
    step: '2 / 4',
    title: 'Map colors',
    detail: 'Choose the limited swatches that the next texture nodes will bite into.',
  },
  dotGrain: {
    step: '3 / 4',
    title: 'Round grain',
    detail: 'Add stochastic dot texture after palette mapping for the old-render surface.',
  },
  edgeCrush: {
    step: '4 / 4',
    title: 'Harden alpha',
    detail: 'Remove soft transparent antialiasing before a harsher silhouette pass.',
  },
  silhouetteCrush: {
    step: '4 / 4',
    title: 'Chip silhouette',
    detail: 'Finish by breaking alpha and high-contrast silhouette borders into chipped sprite pixels.',
  },
  dither: {
    step: 'ALT',
    title: 'Pattern texture',
    detail: 'Use as a stricter grid alternative to round grain inside the same retro chain.',
  },
  halftone: {
    step: 'ALT',
    title: 'Print screen',
    detail: 'Use as a print-dot alternative when the finish should feel offset instead of sampled.',
  },
};

function RetroRecipeNote({ preset }: { preset: EffectPreset | undefined }) {
  if (!preset) return null;
  const step = RETRO_RECIPE_STEPS[preset];
  if (!step) return null;
  return (
    <div className="retro-recipe-card" aria-label="Retro finish recipe">
      <span className="retro-recipe-kicker">Retro finish</span>
      <div className="retro-recipe-main">
        <strong>{step.title}</strong>
        <span>{step.step}</span>
      </div>
      <p>{step.detail}</p>
    </div>
  );
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
