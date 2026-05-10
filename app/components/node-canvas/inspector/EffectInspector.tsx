import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { EffectInfoPopup } from '../../EffectInfoPopup';
import type { EffectLayer, EffectPreset } from '../../../types/config';
import { EFFECT_PRESETS } from '../../../types/config';
import {
  BLEND_OPTIONS,
  COLOR_PRESETS,
  GLITCH_PRESETS,
  RAYS_PRESETS,
  RISO_PRESETS,
  TEXTURE_PRESETS,
  TINT_PRESETS,
  WARP_PRESETS,
} from '../constants';
import type { EffectSectionId } from '../types';
import {
  InspectorColorInput,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextInput,
  InspectorToggle,
} from './fields';

function initialEffectSection(layer: EffectLayer): EffectSectionId {
  if (layer.preset && RAYS_PRESETS.includes(layer.preset)) return 'rays';
  if (layer.preset && GLITCH_PRESETS.includes(layer.preset)) return 'glitch';
  if (layer.preset && TEXTURE_PRESETS.includes(layer.preset)) return 'texture';
  if (layer.preset && TINT_PRESETS.includes(layer.preset)) return 'tint';
  if (layer.preset && WARP_PRESETS.includes(layer.preset)) return 'warp';
  if (layer.preset && COLOR_PRESETS.includes(layer.preset)) return 'color';
  if (layer.preset && RISO_PRESETS.includes(layer.preset)) return 'riso';
  return 'node';
}

function effectSectionSummary(layer: EffectLayer, section: EffectSectionId): string {
  const preset = layer.preset;
  switch (section) {
    case 'node':
      return layer.preset ?? 'custom';
    case 'rays':
      if (preset === 'bloom') return `${layer.bloom}% bloom`;
      if (preset === 'filmBurn') return `${layer.filmBurn}% burn`;
      return `${layer.rays} rays`;
    case 'glitch':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} chroma`;
      if (preset === 'interlace') return `${layer.interlace}% interlace`;
      if (preset === 'dataMosh') return `${layer.dataMosh}% mosh`;
      return `${layer.glitch} / ${layer.rgbSplit}`;
    case 'texture':
      if (preset === 'scanlines') return `${layer.scanlines} lines`;
      return `${layer.grain} grain`;
    case 'tint':
      return `${layer.tintOp}%`;
    case 'warp':
      if (preset === 'noiseWarp') return `${layer.noiseWarp}%`;
      if (preset === 'morph') return `${layer.morphAmt}% morph`;
      if (preset === 'vortex') return `${layer.vortex}% vortex`;
      if (preset === 'barrel') return `${layer.barrel}% barrel`;
      if (preset === 'tear') return `${layer.tearAmt} tear`;
      if (preset === 'mirror') return `${layer.mirror}x mirror`;
      return `${layer.noiseWarp}%`;
    case 'color':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} split`;
      if (preset === 'vignette') return `${layer.vignette}% vignette`;
      if (preset === 'pixelate') return `${layer.pixelate}px`;
      if (preset === 'posterize') return `${layer.posterize} bands`;
      return `${layer.hueShift}deg`;
    case 'riso':
      if (preset === 'halftone') return `${layer.halftone} tone`;
      if (preset === 'risoShift') return `${layer.risoShift}px`;
      return `${layer.duotone}%`;
  }
}

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
  const showSection = (presets: readonly EffectPreset[]) => showAllSections || (layer.preset ? presets.includes(layer.preset) : false);
  const showControl = (presets: readonly EffectPreset[]) => showAllSections || (layer.preset ? presets.includes(layer.preset) : false);

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <div className="node-badge-row">
        <span className="node-badge">
          {layer.preset ? EFFECT_PRESETS[layer.preset]?.name ?? layer.preset : 'custom'}
        </span>
        {showAllSections && (
          <span className="node-badge node-badge-accent">
            combined FX
          </span>
        )}
      </div>

      <InspectorSection
        title="Node"
        summary={effectSectionSummary(layer, 'node')}
        open={openSection === 'node'}
        onToggle={() => setOpenSection((current) => current === 'node' ? null : 'node')}
      >
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorToggle label="Mask To Alpha" checked={layer.maskAlpha} onChange={(value) => onChange({ maskAlpha: value })} />
        <InspectorSelect label="Blend" value={layer.blendMode ?? 'normal'} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      </InspectorSection>

      {showSection(RAYS_PRESETS) && (
        <InspectorSection
          title="Light Rays"
          summary={effectSectionSummary(layer, 'rays')}
          open={openSection === 'rays'}
          onToggle={() => setOpenSection((current) => current === 'rays' ? null : 'rays')}
        >
          {showControl(['rays']) && (
            <>
              <InspectorColorInput label="Ray Color" value={layer.rayColor} onChange={(value) => onChange({ rayColor: value })} />
              <InspectorSlider label="Intensity" value={layer.rayInt} min={0} max={100} effectKey="rayInt" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rayInt: value })} />
              <InspectorSlider label="Count" value={layer.rays} min={0} max={32} effectKey="rays" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rays: value })} />
            </>
          )}
          {showControl(['bloom']) && <InspectorSlider label="Bloom" value={layer.bloom} min={0} max={100} effectKey="bloom" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ bloom: value })} />}
          {showControl(['filmBurn']) && <InspectorSlider label="Film Burn" value={layer.filmBurn} min={0} max={100} effectKey="filmBurn" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ filmBurn: value })} />}
        </InspectorSection>
      )}

      {showSection(GLITCH_PRESETS) && (
        <InspectorSection
          title="Glitch"
          summary={effectSectionSummary(layer, 'glitch')}
          open={openSection === 'glitch'}
          onToggle={() => setOpenSection((current) => current === 'glitch' ? null : 'glitch')}
        >
          {showControl(['glitch']) && <InspectorSlider label="VHS Streaks" value={layer.glitch} min={0} max={24} effectKey="glitch" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ glitch: value })} />}
          {showControl(['rgbSplit']) && <InspectorSlider label="Chromatic" value={layer.rgbSplit} min={0} max={15} effectKey="rgbSplit" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rgbSplit: value })} />}
          {showControl(['interlace']) && <InspectorSlider label="Interlace" value={layer.interlace} min={0} max={100} effectKey="interlace" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ interlace: value })} />}
          {showControl(['dataMosh']) && <InspectorSlider label="Data Mosh" value={layer.dataMosh} min={0} max={100} effectKey="dataMosh" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ dataMosh: value })} />}
        </InspectorSection>
      )}

      {showSection(TEXTURE_PRESETS) && (
        <InspectorSection
          title="Texture"
          summary={effectSectionSummary(layer, 'texture')}
          open={openSection === 'texture'}
          onToggle={() => setOpenSection((current) => current === 'texture' ? null : 'texture')}
        >
          {showControl(['grain']) && <InspectorSlider label="Grain" value={layer.grain} min={0} max={70} effectKey="grain" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ grain: value })} />}
          {showControl(['scanlines']) && <InspectorSlider label="Scanlines" value={layer.scanlines} min={0} max={50} effectKey="scanlines" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ scanlines: value })} />}
        </InspectorSection>
      )}

      {showSection(TINT_PRESETS) && (
        <InspectorSection
          title="Tint"
          summary={effectSectionSummary(layer, 'tint')}
          open={openSection === 'tint'}
          onToggle={() => setOpenSection((current) => current === 'tint' ? null : 'tint')}
        >
          <InspectorColorInput label="Tint Color" value={layer.tint} onChange={(value) => onChange({ tint: value })} />
          <InspectorSlider label="Opacity" value={layer.tintOp} min={0} max={80} effectKey="tintOp" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ tintOp: value })} />
        </InspectorSection>
      )}

      {showSection(WARP_PRESETS) && (
        <InspectorSection
          title="Warp"
          summary={effectSectionSummary(layer, 'warp')}
          open={openSection === 'warp'}
          onToggle={() => setOpenSection((current) => current === 'warp' ? null : 'warp')}
        >
          {showControl(['noiseWarp', 'warp']) && <InspectorSlider label="Noise Warp" value={layer.noiseWarp} min={0} max={100} effectKey="noiseWarp" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ noiseWarp: value })} />}
          {showControl(['morph', 'warp']) && (
            <>
              <InspectorSlider label="Liquid Morph" value={layer.morphAmt} min={0} max={100} effectKey="morphAmt" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ morphAmt: value })} />
              <InspectorSlider label="Morph Freq" value={layer.morphFreq} min={1} max={20} effectKey="morphFreq" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ morphFreq: value })} />
            </>
          )}
          {showControl(['vortex', 'warp']) && <InspectorSlider label="Vortex" value={layer.vortex} min={0} max={100} effectKey="vortex" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ vortex: value })} />}
          {showControl(['barrel', 'warp']) && <InspectorSlider label="Barrel" value={layer.barrel} min={0} max={100} effectKey="barrel" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ barrel: value })} />}
          {showControl(['tear', 'warp']) && (
            <>
              <InspectorSlider label="Chunk Tear" value={layer.tearAmt} min={0} max={20} effectKey="tearAmt" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ tearAmt: value })} />
              <InspectorSlider label="Tear Size" value={layer.tearSize} min={1} max={20} effectKey="tearSize" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ tearSize: value })} />
            </>
          )}
          {showControl(['mirror', 'warp']) && <InspectorSlider label="Mirror" value={layer.mirror} min={0} max={3} effectKey="mirror" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ mirror: value })} />}
        </InspectorSection>
      )}

      {showSection(COLOR_PRESETS) && (
        <InspectorSection
          title="Color FX"
          summary={effectSectionSummary(layer, 'color')}
          open={openSection === 'color'}
          onToggle={() => setOpenSection((current) => current === 'color' ? null : 'color')}
        >
          {showControl(['hueShift', 'color']) && <InspectorSlider label="Hue Shift" value={layer.hueShift} min={0} max={360} effectKey="hueShift" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ hueShift: value })} />}
          {showControl(['rgbSplit']) && <InspectorSlider label="RGB Split" value={layer.rgbSplit} min={0} max={30} effectKey="rgbSplit" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rgbSplit: value })} />}
          {showControl(['vignette']) && <InspectorSlider label="Vignette" value={layer.vignette} min={0} max={100} effectKey="vignette" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ vignette: value })} />}
          {showControl(['pixelate']) && <InspectorSlider label="Pixelate" value={layer.pixelate} min={0} max={20} effectKey="pixelate" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ pixelate: value })} />}
          {showControl(['posterize', 'color']) && <InspectorSlider label="Posterize" value={layer.posterize} min={0} max={16} effectKey="posterize" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ posterize: value })} />}
        </InspectorSection>
      )}

      {showSection(RISO_PRESETS) && (
        <InspectorSection
          title="Riso"
          summary={effectSectionSummary(layer, 'riso')}
          open={openSection === 'riso'}
          onToggle={() => setOpenSection((current) => current === 'riso' ? null : 'riso')}
        >
          {showControl(['duotone', 'riso']) && (
            <>
              <InspectorSlider label="Duotone" value={layer.duotone} min={0} max={100} effectKey="duotone" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ duotone: value })} />
              <InspectorColorInput label="Shadow Color" value={layer.duoA} onChange={(value) => onChange({ duoA: value })} />
              <InspectorColorInput label="Light Color" value={layer.duoB} onChange={(value) => onChange({ duoB: value })} />
            </>
          )}
          {showControl(['halftone', 'riso']) && <InspectorSlider label="Halftone" value={layer.halftone} min={0} max={30} effectKey="halftone" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ halftone: value })} />}
          {showControl(['risoShift', 'riso']) && (
            <>
              <InspectorSlider label="Misreg Shift" value={layer.risoShift} min={0} max={40} effectKey="risoShift" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ risoShift: value })} />
              <InspectorSlider label="Misreg Angle" value={layer.risoAngle} min={0} max={360} effectKey="risoAngle" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ risoAngle: value })} />
            </>
          )}
        </InspectorSection>
      )}
      {infoState && typeof document !== 'undefined' && createPortal(
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
