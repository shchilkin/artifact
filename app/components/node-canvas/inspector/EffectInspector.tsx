import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectLayer, EffectPreset } from '../../../types/config';
import { EFFECT_PRESETS } from '../../../types/config';
import { EffectInfoPopup } from '../../EffectInfoPopup';
import {
  BLEND_OPTIONS,
  COLOR_PRESETS,
  GLITCH_PRESETS,
  GRAPHIC_PRESETS,
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
  if (layer.preset && GRAPHIC_PRESETS.includes(layer.preset)) return 'graphic';
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
      if (preset === 'neonGlow') return `${layer.neonGlow}% neon`;
      if (preset === 'fog') return `${layer.fog}% fog`;
      if (preset === 'speedLines') return `${layer.speedLines}% speed`;
      return `${layer.rays} rays`;
    case 'glitch':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} chroma`;
      if (preset === 'ca') return `${layer.ca} ca`;
      if (preset === 'interlace') return `${layer.interlace}% interlace`;
      if (preset === 'dataMosh') return `${layer.dataMosh}% mosh`;
      if (preset === 'vhsTracking') return `${layer.vhsTracking}% track`;
      return `${layer.glitch} / ${layer.rgbSplit}`;
    case 'texture':
      if (preset === 'scanlines') return `${layer.scanlines}% / ${layer.scanlineWidth ?? 1}px`;
      if (preset === 'matte') return `${layer.matte}% matte`;
      if (preset === 'dither') return `${layer.dither}% dither`;
      if (preset === 'emboss') return `${layer.emboss}% emboss`;
      if (preset === 'linocut') return `${layer.linocut}% lino`;
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
      if (preset === 'wave') return `${layer.waveAmt}% wave`;
      if (preset === 'zoomBlur') return `${layer.zoomBlur}% zoom`;
      if (preset === 'ripple') return `${layer.rippleAmt}% ripple`;
      if (preset === 'kaleidoscope') return `${layer.kaleidoscope}% kaleido`;
      if (preset === 'squeeze') return `${layer.squeezeX}/${layer.squeezeY}`;
      return `${layer.noiseWarp}%`;
    case 'color':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} split`;
      if (preset === 'vignette') return `${layer.vignette}% vignette`;
      if (preset === 'pixelate') return `${layer.pixelate}px`;
      if (preset === 'posterize') return `${layer.posterize} bands`;
      if (preset === 'sepia') return `${layer.sepia}% sepia`;
      if (preset === 'infrared') return `${layer.infrared}% infrared`;
      if (preset === 'solarize') return `${layer.solarize}% solarize`;
      if (preset === 'bleachBypass') return `${layer.bleachBypass}% bleach`;
      if (preset === 'cyanotype') return `${layer.cyanotype}% cyan`;
      if (preset === 'splitTone') return `${layer.splitToneAmt}% split`;
      return `${layer.hueShift}deg`;
    case 'riso':
      if (preset === 'halftone') return `${layer.halftone} tone`;
      if (preset === 'risoShift') return `${layer.risoShift}px`;
      if (preset === 'overprint') return `${layer.overprint}% overprint`;
      return `${layer.duotone}%`;
    case 'graphic':
      if (preset === 'blur') return `${layer.blurAmt}px blur`;
      if (preset === 'threshold') return `${layer.threshold}% threshold`;
      if (preset === 'edgeDetect') return `${layer.edgeDetect}% edge`;
      return `${layer.gradMix}% mix`;
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
  const showSection = (presets: readonly EffectPreset[]) =>
    showAllSections || (layer.preset ? presets.includes(layer.preset) : false);
  const showControl = (presets: readonly EffectPreset[]) =>
    showAllSections || (layer.preset ? presets.includes(layer.preset) : false);
  const hasPresetControls =
    !layer.preset ||
    [
      ...RAYS_PRESETS,
      ...GLITCH_PRESETS,
      ...TEXTURE_PRESETS,
      ...TINT_PRESETS,
      ...WARP_PRESETS,
      ...COLOR_PRESETS,
      ...RISO_PRESETS,
      ...GRAPHIC_PRESETS,
    ].includes(layer.preset);

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

      {showSection(RAYS_PRESETS) && (
        <InspectorSection
          title="Light Rays"
          summary={effectSectionSummary(layer, 'rays')}
          open={openSection === 'rays'}
          onToggle={() => setOpenSection((current) => (current === 'rays' ? null : 'rays'))}
        >
          {showControl(['rays']) && (
            <>
              <InspectorColorInput
                label="Ray Color"
                value={layer.rayColor}
                onChange={(value) => onChange({ rayColor: value })}
              />
              <InspectorSlider
                label="Intensity"
                value={layer.rayInt}
                min={0}
                max={100}
                effectKey="rayInt"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ rayInt: value })}
              />
              <InspectorSlider
                label="Count"
                value={layer.rays}
                min={0}
                max={96}
                effectKey="rays"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ rays: value })}
              />
            </>
          )}
          {showControl(['bloom']) && (
            <InspectorSlider
              label="Bloom"
              value={layer.bloom}
              min={0}
              max={100}
              effectKey="bloom"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ bloom: value })}
            />
          )}
          {showControl(['filmBurn']) && (
            <InspectorSlider
              label="Film Burn"
              value={layer.filmBurn}
              min={0}
              max={100}
              effectKey="filmBurn"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ filmBurn: value })}
            />
          )}
          {showControl(['neonGlow']) && (
            <>
              <InspectorSlider
                label="Neon Glow"
                value={layer.neonGlow}
                min={0}
                max={100}
                effectKey="neonGlow"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ neonGlow: value })}
              />
              <InspectorColorInput
                label="Glow Color"
                value={layer.neonColor}
                onChange={(value) => onChange({ neonColor: value })}
              />
            </>
          )}
          {showControl(['fog']) && (
            <>
              <InspectorSlider
                label="Fog"
                value={layer.fog}
                min={0}
                max={100}
                effectKey="fog"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ fog: value })}
              />
              <InspectorColorInput
                label="Fog Color"
                value={layer.fogColor}
                onChange={(value) => onChange({ fogColor: value })}
              />
            </>
          )}
          {showControl(['speedLines']) && (
            <InspectorSlider
              label="Speed Lines"
              value={layer.speedLines}
              min={0}
              max={140}
              effectKey="speedLines"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ speedLines: value })}
            />
          )}
        </InspectorSection>
      )}

      {showSection(GLITCH_PRESETS) && (
        <InspectorSection
          title="Glitch"
          summary={effectSectionSummary(layer, 'glitch')}
          open={openSection === 'glitch'}
          onToggle={() => setOpenSection((current) => (current === 'glitch' ? null : 'glitch'))}
        >
          {showControl(['glitch']) && (
            <InspectorSlider
              label="VHS Streaks"
              value={layer.glitch}
              min={0}
              max={24}
              effectKey="glitch"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ glitch: value })}
            />
          )}
          {showControl(['rgbSplit']) && (
            <InspectorSlider
              label="Chromatic"
              value={layer.rgbSplit}
              min={0}
              max={15}
              effectKey="rgbSplit"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ rgbSplit: value })}
            />
          )}
          {showControl(['ca']) && (
            <InspectorSlider
              label="Radial CA"
              value={layer.ca}
              min={0}
              max={40}
              effectKey="ca"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ ca: value })}
            />
          )}
          {showControl(['interlace']) && (
            <InspectorSlider
              label="Interlace"
              value={layer.interlace}
              min={0}
              max={100}
              effectKey="interlace"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ interlace: value })}
            />
          )}
          {showControl(['dataMosh']) && (
            <InspectorSlider
              label="Data Mosh"
              value={layer.dataMosh}
              min={0}
              max={100}
              effectKey="dataMosh"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ dataMosh: value })}
            />
          )}
          {showControl(['vhsTracking']) && (
            <InspectorSlider
              label="VHS Tracking"
              value={layer.vhsTracking}
              min={0}
              max={100}
              effectKey="vhsTracking"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ vhsTracking: value })}
            />
          )}
        </InspectorSection>
      )}

      {showSection(TEXTURE_PRESETS) && (
        <InspectorSection
          title="Texture"
          summary={effectSectionSummary(layer, 'texture')}
          open={openSection === 'texture'}
          onToggle={() => setOpenSection((current) => (current === 'texture' ? null : 'texture'))}
        >
          {showControl(['grain']) && (
            <InspectorSlider
              label="Grain"
              value={layer.grain}
              min={0}
              max={70}
              effectKey="grain"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ grain: value })}
            />
          )}
          {showControl(['scanlines']) && (
            <>
              <InspectorSlider
                label="Scanlines"
                value={layer.scanlines}
                min={0}
                max={100}
                effectKey="scanlines"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ scanlines: value })}
              />
              <InspectorSlider
                label="Line Width"
                value={layer.scanlineWidth ?? 1}
                min={1}
                max={12}
                effectKey="scanlineWidth"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ scanlineWidth: value })}
              />
            </>
          )}
          {showControl(['matte']) && (
            <InspectorSlider
              label="Matte"
              value={layer.matte}
              min={0}
              max={100}
              effectKey="matte"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ matte: value })}
            />
          )}
          {showControl(['dither']) && (
            <InspectorSlider
              label="Dither"
              value={layer.dither}
              min={0}
              max={100}
              effectKey="dither"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ dither: value })}
            />
          )}
          {showControl(['emboss']) && (
            <InspectorSlider
              label="Emboss"
              value={layer.emboss}
              min={0}
              max={100}
              effectKey="emboss"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ emboss: value })}
            />
          )}
          {showControl(['linocut']) && (
            <InspectorSlider
              label="Linocut"
              value={layer.linocut}
              min={0}
              max={100}
              effectKey="linocut"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ linocut: value })}
            />
          )}
        </InspectorSection>
      )}

      {showSection(TINT_PRESETS) && (
        <InspectorSection
          title="Tint"
          summary={effectSectionSummary(layer, 'tint')}
          open={openSection === 'tint'}
          onToggle={() => setOpenSection((current) => (current === 'tint' ? null : 'tint'))}
        >
          <InspectorColorInput label="Tint Color" value={layer.tint} onChange={(value) => onChange({ tint: value })} />
          <InspectorSlider
            label="Opacity"
            value={layer.tintOp}
            min={0}
            max={80}
            effectKey="tintOp"
            onInfoEnter={handleInfoEnter}
            onInfoLeave={handleInfoLeave}
            onChange={(value) => onChange({ tintOp: value })}
          />
        </InspectorSection>
      )}

      {showSection(WARP_PRESETS) && (
        <InspectorSection
          title="Warp"
          summary={effectSectionSummary(layer, 'warp')}
          open={openSection === 'warp'}
          onToggle={() => setOpenSection((current) => (current === 'warp' ? null : 'warp'))}
        >
          {showControl(['noiseWarp']) && (
            <InspectorSlider
              label="Noise Warp"
              value={layer.noiseWarp}
              min={0}
              max={100}
              effectKey="noiseWarp"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ noiseWarp: value })}
            />
          )}
          {showControl(['morph']) && (
            <>
              <InspectorSlider
                label="Liquid Morph"
                value={layer.morphAmt}
                min={0}
                max={100}
                effectKey="morphAmt"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ morphAmt: value })}
              />
              <InspectorSlider
                label="Morph Freq"
                value={layer.morphFreq}
                min={1}
                max={20}
                effectKey="morphFreq"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ morphFreq: value })}
              />
            </>
          )}
          {showControl(['vortex']) && (
            <InspectorSlider
              label="Vortex"
              value={layer.vortex}
              min={0}
              max={100}
              effectKey="vortex"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ vortex: value })}
            />
          )}
          {showControl(['barrel']) && (
            <InspectorSlider
              label="Barrel"
              value={layer.barrel}
              min={0}
              max={100}
              effectKey="barrel"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ barrel: value })}
            />
          )}
          {showControl(['tear']) && (
            <>
              <InspectorSlider
                label="Chunk Tear"
                value={layer.tearAmt}
                min={0}
                max={20}
                effectKey="tearAmt"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ tearAmt: value })}
              />
              <InspectorSlider
                label="Tear Size"
                value={layer.tearSize}
                min={1}
                max={20}
                effectKey="tearSize"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ tearSize: value })}
              />
            </>
          )}
          {showControl(['mirror']) && (
            <InspectorSlider
              label="Mirror"
              value={layer.mirror}
              min={0}
              max={3}
              effectKey="mirror"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ mirror: value })}
            />
          )}
          {showControl(['wave']) && (
            <>
              <InspectorSlider
                label="Wave"
                value={layer.waveAmt}
                min={0}
                max={80}
                effectKey="waveAmt"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ waveAmt: value })}
              />
              <InspectorSlider
                label="Wave Freq"
                value={layer.waveFreq}
                min={1}
                max={24}
                effectKey="waveFreq"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ waveFreq: value })}
              />
            </>
          )}
          {showControl(['zoomBlur']) && (
            <InspectorSlider
              label="Zoom Blur"
              value={layer.zoomBlur}
              min={0}
              max={100}
              effectKey="zoomBlur"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ zoomBlur: value })}
            />
          )}
          {showControl(['ripple']) && (
            <>
              <InspectorSlider
                label="Ripple"
                value={layer.rippleAmt}
                min={0}
                max={100}
                effectKey="rippleAmt"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ rippleAmt: value })}
              />
              <InspectorSlider
                label="Ripple Freq"
                value={layer.rippleFreq}
                min={1}
                max={24}
                effectKey="rippleFreq"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ rippleFreq: value })}
              />
            </>
          )}
          {showControl(['kaleidoscope']) && (
            <InspectorSlider
              label="Kaleidoscope"
              value={layer.kaleidoscope}
              min={0}
              max={100}
              effectKey="kaleidoscope"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ kaleidoscope: value })}
            />
          )}
          {showControl(['squeeze']) && (
            <>
              <InspectorSlider
                label="Squeeze X"
                value={layer.squeezeX}
                min={-80}
                max={80}
                effectKey="squeezeX"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ squeezeX: value })}
              />
              <InspectorSlider
                label="Squeeze Y"
                value={layer.squeezeY}
                min={-80}
                max={80}
                effectKey="squeezeY"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ squeezeY: value })}
              />
            </>
          )}
        </InspectorSection>
      )}

      {showSection(COLOR_PRESETS) && (
        <InspectorSection
          title="Color"
          summary={effectSectionSummary(layer, 'color')}
          open={openSection === 'color'}
          onToggle={() => setOpenSection((current) => (current === 'color' ? null : 'color'))}
        >
          {showControl(['hueShift']) && (
            <InspectorSlider
              label="Hue Shift"
              value={layer.hueShift}
              min={0}
              max={360}
              effectKey="hueShift"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ hueShift: value })}
            />
          )}
          {showControl(['rgbSplit']) && (
            <InspectorSlider
              label="RGB Split"
              value={layer.rgbSplit}
              min={0}
              max={30}
              effectKey="rgbSplit"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ rgbSplit: value })}
            />
          )}
          {showControl(['vignette']) && (
            <InspectorSlider
              label="Vignette"
              value={layer.vignette}
              min={0}
              max={100}
              effectKey="vignette"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ vignette: value })}
            />
          )}
          {showControl(['pixelate']) && (
            <InspectorSlider
              label="Pixelate"
              value={layer.pixelate}
              min={0}
              max={20}
              effectKey="pixelate"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ pixelate: value })}
            />
          )}
          {showControl(['posterize']) && (
            <InspectorSlider
              label="Posterize"
              value={layer.posterize}
              min={0}
              max={16}
              effectKey="posterize"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ posterize: value })}
            />
          )}
          {showControl(['sepia']) && (
            <InspectorSlider
              label="Sepia"
              value={layer.sepia}
              min={0}
              max={100}
              effectKey="sepia"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ sepia: value })}
            />
          )}
          {showControl(['infrared']) && (
            <InspectorSlider
              label="Infrared"
              value={layer.infrared}
              min={0}
              max={100}
              effectKey="infrared"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ infrared: value })}
            />
          )}
          {showControl(['solarize']) && (
            <InspectorSlider
              label="Solarize"
              value={layer.solarize}
              min={0}
              max={100}
              effectKey="solarize"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ solarize: value })}
            />
          )}
          {showControl(['bleachBypass']) && (
            <InspectorSlider
              label="Bleach"
              value={layer.bleachBypass}
              min={0}
              max={100}
              effectKey="bleachBypass"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ bleachBypass: value })}
            />
          )}
          {showControl(['cyanotype']) && (
            <InspectorSlider
              label="Cyanotype"
              value={layer.cyanotype}
              min={0}
              max={100}
              effectKey="cyanotype"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ cyanotype: value })}
            />
          )}
          {showControl(['splitTone']) && (
            <>
              <InspectorSlider
                label="Split Tone"
                value={layer.splitToneAmt}
                min={0}
                max={100}
                effectKey="splitToneAmt"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ splitToneAmt: value })}
              />
              <InspectorColorInput
                label="Shadow"
                value={layer.splitShadow}
                onChange={(value) => onChange({ splitShadow: value })}
              />
              <InspectorColorInput
                label="Highlight"
                value={layer.splitHighlight}
                onChange={(value) => onChange({ splitHighlight: value })}
              />
            </>
          )}
        </InspectorSection>
      )}

      {showSection(RISO_PRESETS) && (
        <InspectorSection
          title="Riso"
          summary={effectSectionSummary(layer, 'riso')}
          open={openSection === 'riso'}
          onToggle={() => setOpenSection((current) => (current === 'riso' ? null : 'riso'))}
        >
          {showControl(['duotone']) && (
            <>
              <InspectorSlider
                label="Duotone"
                value={layer.duotone}
                min={0}
                max={100}
                effectKey="duotone"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ duotone: value })}
              />
              <InspectorColorInput
                label="Shadow Color"
                value={layer.duoA}
                onChange={(value) => onChange({ duoA: value })}
              />
              <InspectorColorInput
                label="Light Color"
                value={layer.duoB}
                onChange={(value) => onChange({ duoB: value })}
              />
            </>
          )}
          {showControl(['halftone']) && (
            <InspectorSlider
              label="Halftone"
              value={layer.halftone}
              min={0}
              max={30}
              effectKey="halftone"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ halftone: value })}
            />
          )}
          {showControl(['risoShift']) && (
            <>
              <InspectorSlider
                label="Misreg Shift"
                value={layer.risoShift}
                min={0}
                max={40}
                effectKey="risoShift"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ risoShift: value })}
              />
              <InspectorSlider
                label="Misreg Angle"
                value={layer.risoAngle}
                min={0}
                max={360}
                effectKey="risoAngle"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ risoAngle: value })}
              />
            </>
          )}
          {showControl(['overprint']) && (
            <InspectorSlider
              label="Overprint"
              value={layer.overprint}
              min={0}
              max={100}
              effectKey="overprint"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ overprint: value })}
            />
          )}
        </InspectorSection>
      )}
      {showSection(GRAPHIC_PRESETS) && (
        <InspectorSection
          title="Graphic"
          summary={effectSectionSummary(layer, 'graphic')}
          open={openSection === 'graphic'}
          onToggle={() => setOpenSection((current) => (current === 'graphic' ? null : 'graphic'))}
        >
          {showControl(['blur']) && (
            <InspectorSlider
              label="Blur"
              value={layer.blurAmt}
              min={0}
              max={100}
              effectKey="blur"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ blurAmt: value })}
            />
          )}
          {showControl(['threshold']) && (
            <InspectorSlider
              label="Threshold"
              value={layer.threshold}
              min={0}
              max={100}
              effectKey="threshold"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ threshold: value })}
            />
          )}
          {showControl(['edgeDetect']) && (
            <InspectorSlider
              label="Edge"
              value={layer.edgeDetect}
              min={0}
              max={100}
              effectKey="edgeDetect"
              onInfoEnter={handleInfoEnter}
              onInfoLeave={handleInfoLeave}
              onChange={(value) => onChange({ edgeDetect: value })}
            />
          )}
          {showControl(['gradientOverlay']) && (
            <>
              <InspectorSlider
                label="Mix"
                value={layer.gradMix}
                min={0}
                max={100}
                effectKey="gradientOverlay"
                onInfoEnter={handleInfoEnter}
                onInfoLeave={handleInfoLeave}
                onChange={(value) => onChange({ gradMix: value })}
              />
              <InspectorColorInput
                label="Shadow"
                value={layer.gradA}
                onChange={(value) => onChange({ gradA: value })}
              />
              <InspectorColorInput
                label="Highlight"
                value={layer.gradB}
                onChange={(value) => onChange({ gradB: value })}
              />
              <InspectorSlider
                label="Angle"
                value={layer.gradAngle}
                min={0}
                max={360}
                onChange={(value) => onChange({ gradAngle: value })}
              />
            </>
          )}
        </InspectorSection>
      )}
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
