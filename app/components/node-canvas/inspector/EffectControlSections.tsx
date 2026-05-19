import type { EffectLayer, EffectNumericField, EffectPreset } from '../../../types/config';
import {
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
import { effectSectionSummary } from './effectSectionModel';
import { InspectorColorInput, InspectorSection, InspectorSlider } from './fields';

type EffectStringField = {
  [K in keyof EffectLayer]: EffectLayer[K] extends string ? K : never;
}[keyof EffectLayer];

type EffectSliderControl = {
  type: 'slider';
  presets: readonly EffectPreset[];
  label: string;
  field: EffectNumericField;
  min: number;
  max: number;
  overrideMax?: number;
  effectKey?: string;
};

type EffectColorControl = {
  type: 'color';
  presets: readonly EffectPreset[];
  label: string;
  field: EffectStringField;
};

type EffectControl = EffectSliderControl | EffectColorControl;

type EffectSectionDefinition = {
  id: EffectSectionId;
  title: string;
  presets: readonly EffectPreset[];
  controls: EffectControl[];
};

const EFFECT_SECTION_DEFINITIONS: EffectSectionDefinition[] = [
  {
    id: 'rays',
    title: 'Light Rays',
    presets: RAYS_PRESETS,
    controls: [
      { type: 'color', presets: ['rays'], label: 'Ray Color', field: 'rayColor' },
      { type: 'slider', presets: ['rays'], label: 'Intensity', field: 'rayInt', min: 0, max: 100 },
      {
        type: 'slider',
        presets: ['rays'],
        label: 'Count',
        field: 'rays',
        min: 0,
        max: 96,
        overrideMax: 240,
      },
      { type: 'slider', presets: ['bloom'], label: 'Bloom', field: 'bloom', min: 0, max: 100 },
      { type: 'slider', presets: ['filmBurn'], label: 'Film Burn', field: 'filmBurn', min: 0, max: 100 },
      { type: 'slider', presets: ['neonGlow'], label: 'Neon Glow', field: 'neonGlow', min: 0, max: 100 },
      { type: 'color', presets: ['neonGlow'], label: 'Glow Color', field: 'neonColor' },
      { type: 'slider', presets: ['fog'], label: 'Haze', field: 'fog', min: 0, max: 100 },
      { type: 'color', presets: ['fog'], label: 'Haze Color', field: 'fogColor' },
      {
        type: 'slider',
        presets: ['speedLines'],
        label: 'Speed Lines',
        field: 'speedLines',
        min: 0,
        max: 140,
        overrideMax: 300,
      },
    ],
  },
  {
    id: 'glitch',
    title: 'Glitch',
    presets: GLITCH_PRESETS,
    controls: [
      { type: 'slider', presets: ['glitch'], label: 'VHS Streaks', field: 'glitch', min: 0, max: 24 },
      { type: 'slider', presets: ['rgbSplit'], label: 'Chromatic', field: 'rgbSplit', min: 0, max: 15 },
      { type: 'slider', presets: ['ca'], label: 'Radial CA', field: 'ca', min: 0, max: 40 },
      { type: 'slider', presets: ['interlace'], label: 'Interlace', field: 'interlace', min: 0, max: 100 },
      { type: 'slider', presets: ['dataMosh'], label: 'Data Mosh', field: 'dataMosh', min: 0, max: 100 },
      { type: 'slider', presets: ['vhsTracking'], label: 'VHS Tracking', field: 'vhsTracking', min: 0, max: 100 },
    ],
  },
  {
    id: 'texture',
    title: 'Texture',
    presets: TEXTURE_PRESETS,
    controls: [
      { type: 'slider', presets: ['grain'], label: 'Grain', field: 'grain', min: 0, max: 70 },
      { type: 'slider', presets: ['scanlines'], label: 'Scanlines', field: 'scanlines', min: 0, max: 100 },
      { type: 'slider', presets: ['scanlines'], label: 'Line Width', field: 'scanlineWidth', min: 1, max: 12 },
      { type: 'slider', presets: ['matte'], label: 'Matte', field: 'matte', min: 0, max: 100 },
      { type: 'slider', presets: ['dither'], label: 'Dither', field: 'dither', min: 0, max: 100 },
      { type: 'slider', presets: ['emboss'], label: 'Emboss', field: 'emboss', min: 0, max: 100 },
      { type: 'slider', presets: ['linocut'], label: 'Linocut', field: 'linocut', min: 0, max: 100 },
    ],
  },
  {
    id: 'tint',
    title: 'Tint',
    presets: TINT_PRESETS,
    controls: [
      { type: 'color', presets: ['tint'], label: 'Tint Color', field: 'tint' },
      { type: 'slider', presets: ['tint'], label: 'Opacity', field: 'tintOp', min: 0, max: 80 },
    ],
  },
  {
    id: 'warp',
    title: 'Warp',
    presets: WARP_PRESETS,
    controls: [
      { type: 'slider', presets: ['noiseWarp'], label: 'Noise Warp', field: 'noiseWarp', min: 0, max: 100 },
      { type: 'slider', presets: ['morph'], label: 'Liquid Morph', field: 'morphAmt', min: 0, max: 100 },
      { type: 'slider', presets: ['morph'], label: 'Morph Freq', field: 'morphFreq', min: 1, max: 20 },
      { type: 'slider', presets: ['vortex'], label: 'Vortex', field: 'vortex', min: 0, max: 100 },
      { type: 'slider', presets: ['barrel'], label: 'Barrel', field: 'barrel', min: 0, max: 100 },
      { type: 'slider', presets: ['tear'], label: 'Chunk Tear', field: 'tearAmt', min: 0, max: 20 },
      { type: 'slider', presets: ['tear'], label: 'Tear Size', field: 'tearSize', min: 1, max: 20 },
      { type: 'slider', presets: ['mirror'], label: 'Mirror', field: 'mirror', min: 0, max: 3 },
      { type: 'slider', presets: ['wave'], label: 'Wave', field: 'waveAmt', min: 0, max: 80 },
      { type: 'slider', presets: ['wave'], label: 'Wave Freq', field: 'waveFreq', min: 1, max: 24 },
      { type: 'slider', presets: ['zoomBlur'], label: 'Zoom Blur', field: 'zoomBlur', min: 0, max: 100 },
      { type: 'slider', presets: ['ripple'], label: 'Ripple', field: 'rippleAmt', min: 0, max: 100 },
      { type: 'slider', presets: ['ripple'], label: 'Ripple Freq', field: 'rippleFreq', min: 1, max: 24 },
      { type: 'slider', presets: ['kaleidoscope'], label: 'Kaleidoscope', field: 'kaleidoscope', min: 0, max: 100 },
      { type: 'slider', presets: ['squeeze'], label: 'Squeeze X', field: 'squeezeX', min: -80, max: 80 },
      { type: 'slider', presets: ['squeeze'], label: 'Squeeze Y', field: 'squeezeY', min: -80, max: 80 },
    ],
  },
  {
    id: 'color',
    title: 'Color',
    presets: COLOR_PRESETS,
    controls: [
      { type: 'slider', presets: ['hueShift'], label: 'Hue Shift', field: 'hueShift', min: 0, max: 360 },
      { type: 'slider', presets: ['rgbSplit'], label: 'RGB Split', field: 'rgbSplit', min: 0, max: 30 },
      { type: 'slider', presets: ['vignette'], label: 'Vignette', field: 'vignette', min: 0, max: 100 },
      { type: 'slider', presets: ['pixelate'], label: 'Pixelate', field: 'pixelate', min: 0, max: 20 },
      { type: 'slider', presets: ['posterize'], label: 'Posterize', field: 'posterize', min: 0, max: 16 },
      { type: 'slider', presets: ['sepia'], label: 'Sepia', field: 'sepia', min: 0, max: 100 },
      { type: 'slider', presets: ['infrared'], label: 'Infrared', field: 'infrared', min: 0, max: 100 },
      { type: 'slider', presets: ['solarize'], label: 'Solarize', field: 'solarize', min: 0, max: 100 },
      { type: 'slider', presets: ['bleachBypass'], label: 'Bleach', field: 'bleachBypass', min: 0, max: 100 },
      { type: 'slider', presets: ['cyanotype'], label: 'Cyanotype', field: 'cyanotype', min: 0, max: 100 },
      { type: 'slider', presets: ['splitTone'], label: 'Split Tone', field: 'splitToneAmt', min: 0, max: 100 },
      { type: 'color', presets: ['splitTone'], label: 'Shadow', field: 'splitShadow' },
      { type: 'color', presets: ['splitTone'], label: 'Highlight', field: 'splitHighlight' },
    ],
  },
  {
    id: 'riso',
    title: 'Riso',
    presets: RISO_PRESETS,
    controls: [
      { type: 'slider', presets: ['duotone'], label: 'Duotone', field: 'duotone', min: 0, max: 100 },
      { type: 'color', presets: ['duotone'], label: 'Shadow Color', field: 'duoA' },
      { type: 'color', presets: ['duotone'], label: 'Light Color', field: 'duoB' },
      { type: 'slider', presets: ['halftone'], label: 'Halftone', field: 'halftone', min: 0, max: 30 },
      { type: 'slider', presets: ['risoShift'], label: 'Misreg Shift', field: 'risoShift', min: 0, max: 40 },
      { type: 'slider', presets: ['risoShift'], label: 'Misreg Angle', field: 'risoAngle', min: 0, max: 360 },
      { type: 'slider', presets: ['overprint'], label: 'Overprint', field: 'overprint', min: 0, max: 100 },
    ],
  },
  {
    id: 'graphic',
    title: 'Graphic',
    presets: GRAPHIC_PRESETS,
    controls: [
      { type: 'slider', presets: ['blur'], label: 'Blur', field: 'blurAmt', min: 0, max: 100, effectKey: 'blur' },
      { type: 'slider', presets: ['threshold'], label: 'Cutoff', field: 'threshold', min: 0, max: 100 },
      { type: 'slider', presets: ['edgeDetect'], label: 'Linework', field: 'edgeDetect', min: 0, max: 100 },
      {
        type: 'slider',
        presets: ['gradientOverlay'],
        label: 'Overlay Mix',
        field: 'gradMix',
        min: 0,
        max: 100,
        effectKey: 'gradientOverlay',
      },
      { type: 'color', presets: ['gradientOverlay'], label: 'Start Color', field: 'gradA' },
      { type: 'color', presets: ['gradientOverlay'], label: 'End Color', field: 'gradB' },
      { type: 'slider', presets: ['gradientOverlay'], label: 'Direction', field: 'gradAngle', min: 0, max: 360 },
    ],
  },
];

interface Props {
  layer: EffectLayer;
  openSection: EffectSectionId | null;
  setOpenSection: (updater: (current: EffectSectionId | null) => EffectSectionId | null) => void;
  showSection: (presets: readonly EffectPreset[]) => boolean;
  showControl: (presets: readonly EffectPreset[]) => boolean;
  onChange: (patch: Partial<EffectLayer>) => void;
  onInfoEnter: (key: string, rect: DOMRect) => void;
  onInfoLeave: () => void;
}

function renderControl(control: EffectControl, props: Props) {
  const { layer, showControl, onChange, onInfoEnter, onInfoLeave } = props;
  if (!showControl(control.presets)) return null;

  if (control.type === 'color') {
    return (
      <InspectorColorInput
        key={control.field}
        label={control.label}
        value={String(layer[control.field])}
        onChange={(value) => onChange({ [control.field]: value } as Partial<EffectLayer>)}
      />
    );
  }

  const effectKey = control.effectKey ?? control.field;
  return (
    <InspectorSlider
      key={control.field}
      label={control.label}
      value={Number(layer[control.field])}
      min={control.min}
      max={control.max}
      overrideMax={control.overrideMax}
      effectKey={effectKey}
      onInfoEnter={onInfoEnter}
      onInfoLeave={onInfoLeave}
      onChange={(value) => onChange({ [control.field]: value } as Partial<EffectLayer>)}
    />
  );
}

export function EffectControlSections(props: Props) {
  const { layer, openSection, setOpenSection, showSection } = props;

  return (
    <>
      {EFFECT_SECTION_DEFINITIONS.map((section) => {
        if (!showSection(section.presets)) return null;

        return (
          <InspectorSection
            key={section.id}
            title={section.title}
            summary={effectSectionSummary(layer, section.id)}
            open={openSection === section.id}
            onToggle={() => setOpenSection((current) => (current === section.id ? null : section.id))}
          >
            {section.controls.map((control) => renderControl(control, props))}
          </InspectorSection>
        );
      })}
    </>
  );
}
