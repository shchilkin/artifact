/* eslint-disable react-refresh/only-export-components */
import {
  EFFECT_PRESET_MENU_ORDER,
  type EffectLayer,
  type EffectNumericField,
  type EffectPreset,
} from '../../../types/config';
import {
  EFFECT_SECTIONS,
  type EffectParamKey,
  type EffectSliderValueFormat,
  effectParam,
  presetParamKeys,
} from '../../../types/effectSchema';
import { hasEffectInfo } from '../../../utils/effectInfo';
import { EffectInfoContent } from '../../EffectInfoContent';
import { NoPan } from '../nodes/NoPan';
import type { EffectSectionId } from '../types';
import { effectSectionPresets, effectSectionSummary } from './effectSectionModel';
import { InspectorColorInput, InspectorSection, InspectorSlider } from './fields';

type EffectStringField = {
  [K in keyof EffectLayer]-?: EffectLayer[K] extends string ? K : never;
}[keyof EffectLayer];

type IndexedColorField =
  | 'indexedColorA'
  | 'indexedColorB'
  | 'indexedColorC'
  | 'indexedColorD'
  | 'indexedColorE'
  | 'indexedColorF';

export type { EffectSliderValueFormat };

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

/** The unit shown after a slider's numeric entry; counted formats such as `bands` read out through the slider. */
export function effectSliderUnit(format: EffectSliderValueFormat = 'number'): string | undefined {
  switch (format) {
    case 'percent':
      return '%';
    case 'px':
      return 'px';
    case 'deg':
      return '°';
    default:
      return undefined;
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

type IndexedPalettePreset = {
  name: string;
  colors: readonly string[];
};

const INDEXED_PALETTE_PRESETS: readonly IndexedPalettePreset[] = [
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

function indexedPalettePresetPatch(preset: IndexedPalettePreset): Partial<EffectLayer> {
  return Object.fromEntries(
    INDEXED_COLOR_FIELDS.map((field, index) => [field, preset.colors[index] ?? '#000000']),
  ) as Partial<EffectLayer>;
}

export function randomIndexedPalettePatch(random: () => number = Math.random): Partial<EffectLayer> {
  const preset =
    INDEXED_PALETTE_PRESETS[Math.floor(random() * INDEXED_PALETTE_PRESETS.length)] ?? INDEXED_PALETTE_PRESETS[0];
  return indexedPalettePresetPatch(preset);
}

function effectControl(field: EffectParamKey): EffectControl {
  const param = effectParam(field);
  const presets = EFFECT_PRESET_MENU_ORDER.filter((preset) => presetParamKeys(preset).includes(field));
  if (param.type === 'color') return { type: 'color', presets, label: param.label, field: field as EffectStringField };
  return {
    type: 'slider',
    presets,
    label: param.label,
    field: field as EffectNumericField,
    min: param.min,
    max: param.max,
    valueFormat: param.format,
    overrideMax: param.overrideMax,
    effectKey: param.help,
  };
}

/** Inspector sections and their controls, from the effect parameter schema. */
export const EFFECT_SECTION_DEFINITIONS: EffectSectionDefinition[] = EFFECT_SECTIONS.map((section) => ({
  id: section.id,
  title: section.title,
  presets: effectSectionPresets(section.id),
  controls: section.params.map(effectControl),
}));

interface Props {
  layer: EffectLayer;
  openSection: EffectSectionId | null;
  setOpenSection: (updater: (current: EffectSectionId | null) => EffectSectionId | null) => void;
  showSection: (presets: readonly EffectPreset[]) => boolean;
  showControl: (presets: readonly EffectPreset[]) => boolean;
  onChange: (patch: Partial<EffectLayer>) => void;
}

function renderControl(control: EffectControl, props: Props) {
  const { layer, showControl, onChange } = props;
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
      formatValue={(value) => formatEffectSliderValue(value, control.valueFormat)}
      unit={effectSliderUnit(control.valueFormat)}
      overrideMax={control.overrideMax}
      help={hasEffectInfo(effectKey) ? <EffectInfoContent effectKey={effectKey} /> : undefined}
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
            <span className="artifact-inspector-label">Active swatches</span>
            <span className="indexed-palette-panel-note">
              {activeCount} of 6 map pixels; parked colors are ignored.
            </span>
          </div>
          <NoPan
            as="button"
            type="button"
            className="artifact-inspector-action indexed-palette-random"
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
