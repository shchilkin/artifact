/* eslint-disable react-refresh/only-export-components */
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
import { NoPan } from '../nodes/NoPan';
import type { EffectSectionId } from '../types';
import { effectSectionSummary } from './effectSectionModel';
import { InspectorColorInput, InspectorSection, InspectorSlider } from './fields';

type EffectStringField = {
  [K in keyof EffectLayer]: EffectLayer[K] extends string ? K : never;
}[keyof EffectLayer];

type IndexedColorField =
  | 'indexedColorA'
  | 'indexedColorB'
  | 'indexedColorC'
  | 'indexedColorD'
  | 'indexedColorE'
  | 'indexedColorF';

export type EffectSliderValueFormat = 'number' | 'percent' | 'px' | 'deg' | 'bands' | 'steps';

export type EffectSliderControl = {
  type: 'slider';
  presets: readonly EffectPreset[];
  label: string;
  field: EffectNumericField;
  min: number;
  max: number;
  valueFormat?: EffectSliderValueFormat;
  overrideMax?: number;
  effectKey?: string;
};

export type EffectColorControl = {
  type: 'color';
  presets: readonly EffectPreset[];
  label: string;
  field: EffectStringField;
};

export type EffectControl = EffectSliderControl | EffectColorControl;

export type EffectSectionDefinition = {
  id: EffectSectionId;
  title: string;
  presets: readonly EffectPreset[];
  controls: EffectControl[];
};

export function formatEffectSliderValue(value: number, format: EffectSliderValueFormat = 'number'): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  switch (format) {
    case 'percent':
      return `${rounded}%`;
    case 'px':
      return `${rounded}px`;
    case 'deg':
      return `${rounded}deg`;
    case 'bands':
      return `${rounded} bands`;
    case 'steps':
      return `${rounded} steps`;
    case 'number':
    default:
      return rounded;
  }
}

const INDEXED_COLOR_FIELDS = [
  'indexedColorA',
  'indexedColorB',
  'indexedColorC',
  'indexedColorD',
  'indexedColorE',
  'indexedColorF',
] as const satisfies readonly IndexedColorField[];

export type IndexedPalettePreset = {
  name: string;
  colors: readonly string[];
};

export const INDEXED_PALETTE_PRESETS: readonly IndexedPalettePreset[] = [
  { name: 'Doom dusk', colors: ['#09001f', '#341052', '#852158', '#df3b33', '#ffd65a', '#fff1df'] },
  { name: 'Sepia print', colors: ['#070611', '#392044', '#80515e', '#d58b62', '#f1d17d', '#f6f0cf'] },
  { name: 'Acid swamp', colors: ['#031d2d', '#07646d', '#37a77a', '#c8db64', '#fff07a', '#fff7db'] },
  { name: 'Neon pit', colors: ['#150033', '#4b128b', '#b62280', '#ff3c4f', '#ffb531', '#fff0c7'] },
  { name: 'Bruised gold', colors: ['#03020b', '#20264a', '#5f3b78', '#b15d72', '#f2a45f', '#f8e7ca'] },
  { name: 'Dust violet', colors: ['#100019', '#372457', '#6e4e82', '#ad7fa4', '#e4c5d9', '#f7efe8'] },
  { name: 'Toxic olive', colors: ['#061015', '#243b32', '#687348', '#b7a64b', '#f0d767', '#fff6d7'] },
  { name: 'PS fire', colors: ['#12002b', '#3b1590', '#d400b8', '#ff1d1d', '#f6c400', '#fff1df'] },
];

export function activeIndexedPaletteCount(layer: Pick<EffectLayer, 'indexedPaletteCount'>): number {
  return Math.min(6, Math.max(2, Math.round(layer.indexedPaletteCount ?? 6)));
}

export function indexedPalettePresetPatch(preset: IndexedPalettePreset): Partial<EffectLayer> {
  return Object.fromEntries(
    INDEXED_COLOR_FIELDS.map((field, index) => [field, preset.colors[index] ?? '#000000']),
  ) as Partial<EffectLayer>;
}

export function randomIndexedPalettePatch(random: () => number = Math.random): Partial<EffectLayer> {
  const preset =
    INDEXED_PALETTE_PRESETS[Math.floor(random() * INDEXED_PALETTE_PRESETS.length)] ?? INDEXED_PALETTE_PRESETS[0];
  return indexedPalettePresetPatch(preset);
}

export const EFFECT_SECTION_DEFINITIONS: EffectSectionDefinition[] = [
  {
    id: 'rays',
    title: 'Light Rays',
    presets: RAYS_PRESETS,
    controls: [
      { type: 'color', presets: ['rays'], label: 'Ray Color', field: 'rayColor' },
      {
        type: 'slider',
        presets: ['rays'],
        label: 'Intensity',
        field: 'rayInt',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['rays'],
        label: 'Count',
        field: 'rays',
        min: 0,
        max: 96,
        overrideMax: 240,
      },
      { type: 'slider', presets: ['bloom'], label: 'Bloom', field: 'bloom', min: 0, max: 100, valueFormat: 'percent' },
      {
        type: 'slider',
        presets: ['filmBurn'],
        label: 'Film Burn',
        field: 'filmBurn',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['neonGlow'],
        label: 'Neon Glow',
        field: 'neonGlow',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      { type: 'color', presets: ['neonGlow'], label: 'Glow Color', field: 'neonColor' },
      { type: 'slider', presets: ['fog'], label: 'Haze', field: 'fog', min: 0, max: 100, valueFormat: 'percent' },
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
      {
        type: 'slider',
        presets: ['rgbSplit'],
        label: 'Chromatic',
        field: 'rgbSplit',
        min: 0,
        max: 15,
        valueFormat: 'px',
      },
      { type: 'slider', presets: ['ca'], label: 'Radial CA', field: 'ca', min: 0, max: 40, valueFormat: 'px' },
      {
        type: 'slider',
        presets: ['interlace'],
        label: 'Interlace',
        field: 'interlace',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['dataMosh'],
        label: 'Data Mosh',
        field: 'dataMosh',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['vhsTracking'],
        label: 'VHS Tracking',
        field: 'vhsTracking',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
    ],
  },
  {
    id: 'texture',
    title: 'Texture',
    presets: TEXTURE_PRESETS,
    controls: [
      {
        type: 'slider',
        presets: ['grain'],
        label: 'Grain',
        field: 'grain',
        min: 0,
        max: 50,
        overrideMax: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['dotGrain'],
        label: 'Dot Grain',
        field: 'dotGrain',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['dotGrain'],
        label: 'Dot Size',
        field: 'dotGrainSize',
        min: 1,
        max: 9,
        overrideMax: 18,
        valueFormat: 'px',
      },
      {
        type: 'slider',
        presets: ['dotGrain'],
        label: 'Density',
        field: 'dotGrainDensity',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['dotGrain'],
        label: 'Jitter',
        field: 'dotGrainJitter',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['scanlines'],
        label: 'Scanlines',
        field: 'scanlines',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['scanlines'],
        label: 'Line Width',
        field: 'scanlineWidth',
        min: 1,
        max: 12,
        valueFormat: 'px',
      },
      { type: 'slider', presets: ['matte'], label: 'Matte', field: 'matte', min: 0, max: 100, valueFormat: 'percent' },
      {
        type: 'slider',
        presets: ['dither'],
        label: 'Dither',
        field: 'dither',
        min: 0,
        max: 70,
        overrideMax: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['emboss'],
        label: 'Emboss',
        field: 'emboss',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['linocut'],
        label: 'Linocut',
        field: 'linocut',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
    ],
  },
  {
    id: 'tint',
    title: 'Tint',
    presets: TINT_PRESETS,
    controls: [
      { type: 'color', presets: ['tint'], label: 'Tint Color', field: 'tint' },
      { type: 'slider', presets: ['tint'], label: 'Opacity', field: 'tintOp', min: 0, max: 80, valueFormat: 'percent' },
    ],
  },
  {
    id: 'warp',
    title: 'Warp',
    presets: WARP_PRESETS,
    controls: [
      {
        type: 'slider',
        presets: ['noiseWarp'],
        label: 'Noise Warp',
        field: 'noiseWarp',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['morph'],
        label: 'Liquid Morph',
        field: 'morphAmt',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      { type: 'slider', presets: ['morph'], label: 'Morph Freq', field: 'morphFreq', min: 1, max: 20 },
      {
        type: 'slider',
        presets: ['vortex'],
        label: 'Vortex',
        field: 'vortex',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['barrel'],
        label: 'Barrel',
        field: 'barrel',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      { type: 'slider', presets: ['tear'], label: 'Chunk Tear', field: 'tearAmt', min: 0, max: 20 },
      { type: 'slider', presets: ['tear'], label: 'Tear Size', field: 'tearSize', min: 1, max: 20, valueFormat: 'px' },
      { type: 'slider', presets: ['mirror'], label: 'Mirror', field: 'mirror', min: 0, max: 3 },
      { type: 'slider', presets: ['wave'], label: 'Wave', field: 'waveAmt', min: 0, max: 80, valueFormat: 'px' },
      { type: 'slider', presets: ['wave'], label: 'Wave Freq', field: 'waveFreq', min: 1, max: 24 },
      {
        type: 'slider',
        presets: ['zoomBlur'],
        label: 'Zoom Blur',
        field: 'zoomBlur',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['ripple'],
        label: 'Ripple',
        field: 'rippleAmt',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      { type: 'slider', presets: ['ripple'], label: 'Ripple Freq', field: 'rippleFreq', min: 1, max: 24 },
      {
        type: 'slider',
        presets: ['kaleidoscope'],
        label: 'Kaleidoscope',
        field: 'kaleidoscope',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['squeeze'],
        label: 'Squeeze X',
        field: 'squeezeX',
        min: -80,
        max: 80,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['squeeze'],
        label: 'Squeeze Y',
        field: 'squeezeY',
        min: -80,
        max: 80,
        valueFormat: 'percent',
      },
    ],
  },
  {
    id: 'color',
    title: 'Color',
    presets: COLOR_PRESETS,
    controls: [
      {
        type: 'slider',
        presets: ['hueShift'],
        label: 'Hue Shift',
        field: 'hueShift',
        min: 0,
        max: 360,
        valueFormat: 'deg',
      },
      {
        type: 'slider',
        presets: ['rgbSplit'],
        label: 'RGB Split',
        field: 'rgbSplit',
        min: 0,
        max: 30,
        valueFormat: 'px',
      },
      {
        type: 'slider',
        presets: ['vignette'],
        label: 'Vignette',
        field: 'vignette',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['retroResolution'],
        label: 'Longest Edge',
        field: 'retroResolution',
        min: 64,
        max: 512,
        overrideMax: 1024,
        valueFormat: 'px',
      },
      {
        type: 'slider',
        presets: ['pixelate'],
        label: 'Block Size',
        field: 'pixelate',
        min: 0,
        max: 20,
        overrideMax: 80,
        valueFormat: 'px',
      },
      {
        type: 'slider',
        presets: ['posterize'],
        label: 'Posterize',
        field: 'posterize',
        min: 0,
        max: 16,
        valueFormat: 'bands',
      },
      {
        type: 'slider',
        presets: ['indexedPalette'],
        label: 'Palette Mix',
        field: 'indexedPalette',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['indexedPalette'],
        label: 'Color Count',
        field: 'indexedPaletteCount',
        min: 2,
        max: 6,
        valueFormat: 'steps',
      },
      { type: 'color', presets: ['indexedPalette'], label: 'Color 1', field: 'indexedColorA' },
      { type: 'color', presets: ['indexedPalette'], label: 'Color 2', field: 'indexedColorB' },
      { type: 'color', presets: ['indexedPalette'], label: 'Color 3', field: 'indexedColorC' },
      { type: 'color', presets: ['indexedPalette'], label: 'Color 4', field: 'indexedColorD' },
      { type: 'color', presets: ['indexedPalette'], label: 'Color 5', field: 'indexedColorE' },
      { type: 'color', presets: ['indexedPalette'], label: 'Color 6', field: 'indexedColorF' },
      { type: 'slider', presets: ['sepia'], label: 'Sepia', field: 'sepia', min: 0, max: 100, valueFormat: 'percent' },
      {
        type: 'slider',
        presets: ['infrared'],
        label: 'Infrared',
        field: 'infrared',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['solarize'],
        label: 'Solarize',
        field: 'solarize',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['bleachBypass'],
        label: 'Bleach',
        field: 'bleachBypass',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['cyanotype'],
        label: 'Cyanotype',
        field: 'cyanotype',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['splitTone'],
        label: 'Split Tone',
        field: 'splitToneAmt',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      { type: 'color', presets: ['splitTone'], label: 'Shadow', field: 'splitShadow' },
      { type: 'color', presets: ['splitTone'], label: 'Highlight', field: 'splitHighlight' },
    ],
  },
  {
    id: 'riso',
    title: 'Riso',
    presets: RISO_PRESETS,
    controls: [
      {
        type: 'slider',
        presets: ['duotone'],
        label: 'Duotone',
        field: 'duotone',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      { type: 'color', presets: ['duotone'], label: 'Shadow Color', field: 'duoA' },
      { type: 'color', presets: ['duotone'], label: 'Light Color', field: 'duoB' },
      {
        type: 'slider',
        presets: ['halftone'],
        label: 'Halftone',
        field: 'halftone',
        min: 0,
        max: 30,
        valueFormat: 'px',
      },
      {
        type: 'slider',
        presets: ['risoShift'],
        label: 'Misreg Shift',
        field: 'risoShift',
        min: 0,
        max: 24,
        overrideMax: 60,
        valueFormat: 'px',
      },
      {
        type: 'slider',
        presets: ['risoShift'],
        label: 'Misreg Angle',
        field: 'risoAngle',
        min: 0,
        max: 360,
        valueFormat: 'deg',
      },
      {
        type: 'slider',
        presets: ['overprint'],
        label: 'Overprint',
        field: 'overprint',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
    ],
  },
  {
    id: 'graphic',
    title: 'Graphic',
    presets: GRAPHIC_PRESETS,
    controls: [
      {
        type: 'slider',
        presets: ['blur'],
        label: 'Blur',
        field: 'blurAmt',
        min: 0,
        max: 100,
        valueFormat: 'px',
        effectKey: 'blur',
      },
      {
        type: 'slider',
        presets: ['threshold'],
        label: 'Cutoff',
        field: 'threshold',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['edgeCrush'],
        label: 'Edge Crush',
        field: 'edgeCrush',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['edgeDetect'],
        label: 'Linework',
        field: 'edgeDetect',
        min: 0,
        max: 100,
        valueFormat: 'percent',
      },
      {
        type: 'slider',
        presets: ['gradientOverlay'],
        label: 'Overlay Mix',
        field: 'gradMix',
        min: 0,
        max: 100,
        valueFormat: 'percent',
        effectKey: 'gradientOverlay',
      },
      { type: 'color', presets: ['gradientOverlay'], label: 'Start Color', field: 'gradA' },
      { type: 'color', presets: ['gradientOverlay'], label: 'End Color', field: 'gradB' },
      {
        type: 'slider',
        presets: ['gradientOverlay'],
        label: 'Direction',
        field: 'gradAngle',
        min: 0,
        max: 360,
        valueFormat: 'deg',
      },
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
      valueLabel={formatEffectSliderValue(Number(layer[control.field]), control.valueFormat)}
      overrideMax={control.overrideMax}
      effectKey={effectKey}
      onInfoEnter={onInfoEnter}
      onInfoLeave={onInfoLeave}
      onChange={(value) => onChange({ [control.field]: value } as Partial<EffectLayer>)}
    />
  );
}

function isIndexedPaletteControl(control: EffectControl): boolean {
  return control.presets.includes('indexedPalette');
}

function isIndexedPaletteColorControl(
  control: EffectControl,
): control is EffectColorControl & { field: IndexedColorField } {
  return control.type === 'color' && (INDEXED_COLOR_FIELDS as readonly string[]).includes(control.field);
}

function renderIndexedPaletteControls(section: EffectSectionDefinition, props: Props) {
  const { layer, onChange } = props;
  const activeCount = activeIndexedPaletteCount(layer);
  const sliders = section.controls.filter((control) => control.type === 'slider' && isIndexedPaletteControl(control));
  const colors = section.controls.filter(isIndexedPaletteColorControl);
  return (
    <>
      {sliders.map((control) => renderControl(control, props))}
      <div className="indexed-palette-panel">
        <div className="indexed-palette-panel-head">
          <div className="indexed-palette-panel-copy">
            <span className="node-inspector-label">Active swatches</span>
            <span className="indexed-palette-panel-note">
              {activeCount} of 6 map pixels; parked colors are ignored.
            </span>
          </div>
          <NoPan
            as="button"
            type="button"
            className="node-inspector-action indexed-palette-random"
            onClick={() => onChange(randomIndexedPalettePatch())}
          >
            Rand colors
          </NoPan>
        </div>
        <div className="indexed-palette-strip" aria-label={`${activeCount} active indexed palette colors`}>
          {INDEXED_COLOR_FIELDS.map((field, index) => {
            const active = index < activeCount;
            return (
              <span
                key={field}
                className={`indexed-palette-strip-swatch${active ? ' indexed-palette-strip-swatch-active' : ''}`}
                style={{ backgroundColor: String(layer[field]) }}
                title={`${active ? 'Active' : 'Parked'} color ${index + 1}`}
              />
            );
          })}
        </div>
        <div className="indexed-palette-presets" aria-label="Indexed palette presets">
          {INDEXED_PALETTE_PRESETS.slice(0, 4).map((preset) => (
            <NoPan
              as="button"
              type="button"
              key={preset.name}
              className="indexed-palette-preset"
              onClick={() => onChange(indexedPalettePresetPatch(preset))}
            >
              <span>{preset.name}</span>
              <span className="indexed-palette-mini-strip" aria-hidden="true">
                {preset.colors.slice(0, activeCount).map((color) => (
                  <span key={color} style={{ backgroundColor: color }} />
                ))}
              </span>
            </NoPan>
          ))}
        </div>
      </div>
      {colors.map((control, index) => (
        <InspectorColorInput
          key={control.field}
          label={`${control.label} ${index < activeCount ? 'active' : 'parked'}`}
          value={String(layer[control.field])}
          inactive={index >= activeCount}
          onChange={(value) => onChange({ [control.field]: value } as Partial<EffectLayer>)}
        />
      ))}
    </>
  );
}

function renderSectionControls(section: EffectSectionDefinition, props: Props) {
  if (section.id === 'color' && props.layer.preset === 'indexedPalette') {
    return (
      <>
        {section.controls
          .filter((control) => !isIndexedPaletteControl(control))
          .map((control) => renderControl(control, props))}
        {renderIndexedPaletteControls(section, props)}
      </>
    );
  }
  return section.controls.map((control) => renderControl(control, props));
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
            {renderSectionControls(section, props)}
          </InspectorSection>
        );
      })}
    </>
  );
}
