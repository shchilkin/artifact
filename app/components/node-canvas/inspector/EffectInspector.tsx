import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectLayer, EffectPreset } from '../../../types/config';
import { EFFECT_PRESETS } from '../../../types/config';
import { EffectInfoPopup } from '../../EffectInfoPopup';
import { BLEND_OPTIONS } from '../constants';
import type { EffectSectionId } from '../types';
import { EffectControlSections } from './EffectControlSections';
import { EFFECT_CONTROL_PRESETS, effectSectionSummary, initialEffectSection } from './effectSectionModel';
import { InspectorSection, InspectorSelect, InspectorTextInput, InspectorToggle } from './fields';

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

  const showAllSections = !layer.preset;
  const showSection = (presets: readonly EffectPreset[]) =>
    showAllSections || (layer.preset ? presets.includes(layer.preset) : false);
  const showControl = showSection;
  const hasPresetControls = !layer.preset || (layer.preset ? EFFECT_CONTROL_PRESETS.includes(layer.preset) : false);

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <div className="node-badge-row">
        <span className="node-badge">
          {layer.preset ? (EFFECT_PRESETS[layer.preset]?.name ?? layer.preset) : 'custom'}
        </span>
      </div>

      <InspectorSection
        title="Node"
        summary={effectSectionSummary(layer, 'node')}
        open={openSection === 'node'}
        onToggle={() => setOpenSection((current) => (current === 'node' ? null : 'node'))}
      >
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
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
      </InspectorSection>

      {!hasPresetControls && (
        <div className="node-inspector-note">
          This effect uses fixed defaults in the node inspector for now. You can still rename it, change blend/mask
          behavior, or add another focused effect node after it.
        </div>
      )}

      <EffectControlSections
        layer={layer}
        openSection={openSection}
        setOpenSection={setOpenSection}
        showSection={showSection}
        showControl={showControl}
        onChange={onChange}
        onInfoEnter={handleInfoEnter}
        onInfoLeave={handleInfoLeave}
      />

      {infoState &&
        typeof document !== 'undefined' &&
        createPortal(
          <EffectInfoPopup
            effectKey={infoState.key}
            anchorRect={infoState.rect}
            sidebarRight={infoState.rect.right}
            onMouseEnter={() => clearTimeout(closeTimerRef.current)}
            onMouseLeave={handleInfoLeave}
          />,
          document.body,
        )}
    </div>
  );
}
