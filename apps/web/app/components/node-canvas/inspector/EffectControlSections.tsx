/* eslint-disable react-refresh/only-export-components */
import type { EffectEntry } from '../../../types/config';
import {
  type EffectParamKey,
  type EffectParamValues,
  type EffectSliderValueFormat,
  effectParam,
  effectParamKeys,
} from '../../../types/effectSchema';
import { hasEffectInfo } from '../../../utils/effectInfo';
import { EffectInfoContent } from '../../EffectInfoContent';
import { NoPan } from '../nodes/NoPan';
import { InspectorColorInput, InspectorSelect, InspectorSlider } from './fields';

export type { EffectSliderValueFormat };

type EffectParamsPatch = Partial<EffectParamValues>;

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
] as const satisfies readonly EffectParamKey[];

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

export function activeIndexedPaletteCount(params: Pick<EffectParamsPatch, 'indexedPaletteCount'>): number {
  return Math.min(6, Math.max(2, Math.round(params.indexedPaletteCount ?? 6)));
}

function indexedPalettePresetPatch(preset: IndexedPalettePreset): EffectParamsPatch {
  return Object.fromEntries(INDEXED_COLOR_FIELDS.map((field, index) => [field, preset.colors[index] ?? '#000000']));
}

export function randomIndexedPalettePatch(random: () => number = Math.random): EffectParamsPatch {
  const preset =
    INDEXED_PALETTE_PRESETS[Math.floor(random() * INDEXED_PALETTE_PRESETS.length)] ?? INDEXED_PALETTE_PRESETS[0];
  return indexedPalettePresetPatch(preset);
}

interface EntryControlProps {
  entry: EffectEntry;
  onChange: (patch: EffectParamsPatch) => void;
}

function EffectParamControl({ field, entry, onChange }: EntryControlProps & { field: EffectParamKey }) {
  const param = effectParam(field);
  const value = entry.params[field] ?? param.default;
  if (param.type === 'color') {
    return (
      <InspectorColorInput label={param.label} value={String(value)} onChange={(next) => onChange({ [field]: next })} />
    );
  }
  if (param.type === 'choice') {
    return (
      <InspectorSelect
        label={param.label}
        value={String(value)}
        options={param.options}
        onChange={(next) => onChange({ [field]: next })}
      />
    );
  }
  const helpKey = param.help ?? field;
  return (
    <InspectorSlider
      label={param.label}
      value={Number(value)}
      min={param.min}
      max={param.max}
      formatValue={(next) => formatEffectSliderValue(next, param.format)}
      unit={effectSliderUnit(param.format)}
      overrideMax={param.overrideMax}
      help={hasEffectInfo(helpKey) ? <EffectInfoContent effectKey={helpKey} /> : undefined}
      onChange={(next) => onChange({ [field]: next })}
    />
  );
}

function IndexedPalettePanel({ entry, onChange }: EntryControlProps) {
  const activeCount = activeIndexedPaletteCount(entry.params);
  return (
    <>
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
                style={{ backgroundColor: String(entry.params[field]) }}
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
      {INDEXED_COLOR_FIELDS.map((field, index) => {
        const param = effectParam(field);
        return (
          <InspectorColorInput
            key={field}
            label={`${param.label} ${index < activeCount ? 'active' : 'parked'}`}
            value={String(entry.params[field] ?? param.default)}
            inactive={index >= activeCount}
            onChange={(value) => onChange({ [field]: value })}
          />
        );
      })}
    </>
  );
}

/** The controls of one stack entry: every parameter its effect owns, in schema order. */
export function EffectEntryControls({ entry, onChange }: EntryControlProps) {
  const fields = effectParamKeys(entry.effect);
  if (entry.effect === 'indexedPalette') {
    const isColor = (field: EffectParamKey) => (INDEXED_COLOR_FIELDS as readonly string[]).includes(field);
    return (
      <>
        {fields
          .filter((field) => !isColor(field))
          .map((field) => (
            <EffectParamControl key={field} field={field} entry={entry} onChange={onChange} />
          ))}
        <IndexedPalettePanel entry={entry} onChange={onChange} />
      </>
    );
  }
  return (
    <>
      {fields.map((field) => (
        <EffectParamControl key={field} field={field} entry={entry} onChange={onChange} />
      ))}
    </>
  );
}
