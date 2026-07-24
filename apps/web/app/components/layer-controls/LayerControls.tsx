/**
 * LayerControls — canonical inspector-style layer control renderer.
 *
 * Both the node canvas inspector and (optionally) the classic sidebar use
 * this component. Field ranges and option lists are imported from fieldDefs
 * so that control behavior never drifts between surfaces.
 */
import {
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useRef,
  useState,
} from 'react';

import {
  type EmojiLayer,
  type FillLayer,
  getBundledFontRegistryItem,
  type ImageLayer,
  type Layer,
  MATERIAL_PRESETS,
  type MaterialPreset,
  type PrimitiveLayer,
  type SourceLayer,
  type TextLayer,
} from '../../types/config';
import {
  getAiGenerationStatusDetail,
  getAiGenerationStatusLabel,
  getAiGenerationUiState,
} from '../../utils/aiGenerationStatus';
import { getCachedImportedFont, isFontUri, normalizeImportedFontLabel } from '../../utils/fontStore';
import { EffectInspector } from '../node-canvas/inspector/EffectInspector';
import {
  BlendModeNote,
  FontPicker,
  InspectorColorInput,
  InspectorReadout,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorStateProvider,
  InspectorTextArea,
  InspectorTextInput,
  InspectorToggle,
  ScaleLockRow,
} from '../node-canvas/inspector/fields';
import { layerHasPlacementControls } from './controlModel';
import {
  ARRAY_PATTERN_OPTIONS,
  ARRAY_SHAPE_OPTIONS,
  BLEND_OPTIONS,
  FIELD_RANGES,
  IMAGE_FIT_OPTIONS,
  LINE_FIELD_DISTORTION_OPTIONS,
  LINE_FIELD_ORIENTATION_OPTIONS,
  MATERIAL_PRESET_OPTIONS,
  NOISE_TYPE_OPTIONS,
  PRIMITIVE_SHADING_OPTIONS,
  PRIMITIVE_SHAPE_OPTIONS,
  TEXT_ALIGN_OPTIONS,
} from './fieldDefs';

const R = FIELD_RANGES;
const DEFAULT_PLACEMENT = { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 };
const ARRAY_DEFAULT_LABELS = {
  count: 'Columns',
  rows: 'Rows',
  gap: 'Cell Gap',
  size: 'Size',
  jitter: 'Jitter',
};
const ARRAY_LINE_LABELS = {
  count: 'Items',
  rows: 'Rows',
  gap: 'Spacing',
  size: 'Size',
  jitter: 'Jitter',
};
const ARRAY_RADIAL_LABELS = {
  count: 'Per Ring',
  rows: 'Rings',
  gap: 'Ring Gap',
  size: 'Size',
  radius: 'Start Radius',
  jitter: 'Scatter',
};
const ARRAY_BAR_LABELS = {
  count: 'Bars',
  rows: 'Rows',
  gap: 'Spacing',
  size: 'Height',
  radius: 'Width',
  jitter: 'Unevenness',
  note: 'Width and height control each bar; rows adds stacked barcode bands.',
};
const MATERIAL_PERCENT_FIELDS = [
  ['materialMetalness', 'Metalness', 'materialMetalness'],
  ['materialRoughness', 'Roughness', 'materialRoughness'],
  ['materialClearcoat', 'Coat', 'materialClearcoat'],
  ['materialRelief', 'Relief', 'materialRelief'],
  ['materialGrain', 'Grain', 'materialGrain'],
] as const;

type LayerControlSection = 'content' | 'placement' | 'style' | 'structure';
type LayerControlsSurface = 'layers' | 'nodes';
type SetOpenSection = Dispatch<SetStateAction<LayerControlSection>>;
type SetScaleLocked = Dispatch<SetStateAction<boolean>>;
type BasicLayerKind = 'text' | 'image' | 'fill' | 'emoji';

const SOURCE_LAYER_KINDS = new Set<Layer['kind']>(['primitive', 'noise', 'array', 'lineField', 'model']);

function PlacementResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="node-inspector-action nodrag nopan nowheel" type="button" onClick={onClick}>
      Reset placement
    </button>
  );
}

function PlacementPositionSliders({
  x,
  y,
  onXChange,
  onYChange,
}: {
  x: number;
  y: number;
  onXChange: (value: number) => void;
  onYChange: (value: number) => void;
}) {
  return (
    <>
      <InspectorSlider label="Horizontal" value={Math.round(x * 100)} {...R.x} onChange={(v) => onXChange(v / 100)} />
      <InspectorSlider label="Vertical" value={Math.round(y * 100)} {...R.y} onChange={(v) => onYChange(v / 100)} />
    </>
  );
}

function PlacementSection({
  x,
  y,
  open,
  children,
  onToggle,
  onReset,
  onChange,
}: {
  x: number;
  y: number;
  open: boolean;
  children: ReactNode;
  onToggle: () => void;
  onReset: () => void;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <InspectorSection
      title="Placement"
      summary={`${Math.round(x * 100)} / ${Math.round(y * 100)}`}
      open={open}
      onToggle={onToggle}
    >
      <PlacementResetButton onClick={onReset} />
      <PlacementPositionSliders
        x={x}
        y={y}
        onXChange={(v) => onChange({ x: v })}
        onYChange={(v) => onChange({ y: v })}
      />
      {children}
    </InspectorSection>
  );
}

function LayerPlacementControls<T extends ImageLayer | TextLayer>({
  layer,
  open,
  children,
  onToggle,
  onChange,
}: {
  layer: T;
  open: boolean;
  children: ReactNode;
  onToggle: () => void;
  onChange: (patch: Partial<T>) => void;
}) {
  return (
    <PlacementSection
      x={layer.x}
      y={layer.y}
      open={open}
      onToggle={onToggle}
      onReset={() => onChange(DEFAULT_PLACEMENT as Partial<T>)}
      onChange={(patch) => onChange(patch as Partial<T>)}
    >
      {children}
    </PlacementSection>
  );
}

function PlacementRotationSlider<T extends ImageLayer | TextLayer>({
  layer,
  onChange,
}: {
  layer: T;
  onChange: (patch: Partial<T>) => void;
}) {
  return (
    <InspectorSlider
      label="Rotation"
      value={Math.round(layer.rotation)}
      {...R.rotation}
      onChange={(v) => onChange({ rotation: v } as Partial<T>)}
    />
  );
}

function PlacementScaleLockRow<T extends ImageLayer | TextLayer>({
  layer,
  locked,
  onLockChange,
  onChange,
}: {
  layer: T;
  locked: boolean;
  onLockChange: (locked: boolean) => void;
  onChange: (patch: Partial<T>) => void;
}) {
  return (
    <ScaleLockRow
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      locked={locked}
      onLockChange={onLockChange}
      onChange={(patch) => onChange(patch as Partial<T>)}
    />
  );
}

function LayerBlendStyleSection({
  opacity,
  blendMode,
  open,
  onToggle,
  onOpacityChange,
  onBlendModeChange,
  children,
}: {
  opacity: number;
  blendMode: string;
  open: boolean;
  onToggle: () => void;
  onOpacityChange: (value: number) => void;
  onBlendModeChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <InspectorSection title="Style" summary={`${opacity}% · ${blendMode}`} open={open} onToggle={onToggle}>
      {children}
      <InspectorSlider label="Opacity" value={opacity} {...R.opacity} onChange={onOpacityChange} />
      <InspectorSelect label="Blend" value={blendMode} options={[...BLEND_OPTIONS]} onChange={onBlendModeChange} />
      <BlendModeNote value={blendMode} />
    </InspectorSection>
  );
}

function LayerContentSection({
  summary,
  open,
  children,
  onToggle,
}: {
  summary: string;
  open: boolean;
  children: ReactNode;
  onToggle: () => void;
}) {
  return (
    <InspectorSection title="Content" summary={summary} open={open} onToggle={onToggle}>
      {children}
    </InspectorSection>
  );
}

function LayerNameInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return <InspectorTextInput label="Name" value={value} placeholder={placeholder} onChange={onChange} />;
}

function parseEmojiInput(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const separated = trimmed.split(/[\s,]+/u).filter(Boolean);
  if (separated.length > 1) return separated;
  return Array.from(trimmed);
}

function sourceColorLabels(layer: SourceLayer): {
  primary: string;
  secondary: string;
} {
  if (layer.kind === 'primitive') return { primary: 'Material', secondary: 'Light' };
  if (layer.kind === 'model') return { primary: 'Material', secondary: 'Light' };
  if (layer.kind === 'noise') return { primary: 'Shadow', secondary: 'Main' };
  return { primary: 'Base', secondary: 'Accent' };
}

function ImageGenerationProvenance({ layer }: { layer: ImageLayer }) {
  const generation = layer.aiGeneration;
  if (!generation?.prompt) return null;
  const state = getAiGenerationUiState(generation);
  const label = getAiGenerationStatusLabel(generation);
  const detail = getAiGenerationStatusDetail(generation);
  return (
    <div className={`ai-generation-provenance ai-generation-provenance-${state}`}>
      <span>{imageGenerationProvenanceLabel(label, state)}</span>
      <p>{generation.prompt}</p>
      <ImageGenerationFailureDetail state={state} detail={detail} />
    </div>
  );
}

function imageGenerationProvenanceLabel(label: string | null, state: ReturnType<typeof getAiGenerationUiState>) {
  if (!label) return 'Current image prompt';
  return state === 'done' ? 'Current image prompt' : label;
}

function ImageGenerationFailureDetail({
  state,
  detail,
}: {
  state: ReturnType<typeof getAiGenerationUiState>;
  detail: string | null;
}) {
  if (state !== 'failed') return null;
  return detail ? <p>{detail}</p> : null;
}

function toggleOpenSection(
  setOpenSection: SetOpenSection,
  section: LayerControlSection,
  fallback: LayerControlSection,
) {
  setOpenSection((current) => (current === section ? fallback : section));
}

function LayerStyleForLayer({
  layer,
  openSection,
  setOpenSection,
  children,
  onChange,
}: {
  layer: Layer;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  children?: ReactNode;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <LayerBlendStyleSection
      opacity={layer.opacity}
      blendMode={layer.blendMode}
      open={openSection === 'style'}
      onToggle={() => toggleOpenSection(setOpenSection, 'style', 'content')}
      onOpacityChange={(v) => onChange({ opacity: v })}
      onBlendModeChange={(v) => onChange({ blendMode: v })}
    >
      {children}
    </LayerBlendStyleSection>
  );
}

function textFontSummary(layer: TextLayer): string {
  return isFontUri(layer.font) ? importedTextFontSummary(layer.font) : getBundledFontRegistryItem(layer.font).label;
}

function importedTextFontSummary(font: string): string {
  const importedFont = getCachedImportedFont(font);
  return normalizeImportedFontLabel(importedFontDisplayName(importedFont));
}

function importedFontDisplayName(importedFont: ReturnType<typeof getCachedImportedFont>): string {
  if (!importedFont) return 'Imported font';
  return importedFont.sourceName || importedFont.label || 'Imported font';
}

function TextLayerControls({
  layer,
  sectionClassName,
  openSection,
  setOpenSection,
  scaleLocked,
  setScaleLocked,
  onChange,
}: {
  layer: TextLayer;
  sectionClassName: string;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  scaleLocked: boolean;
  setScaleLocked: SetScaleLocked;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <div className={sectionClassName}>
      <InspectorSection
        title="Content"
        summary={`${textFontSummary(layer)} · ${layer.size}px`}
        open={openSection === 'content'}
        onToggle={() => toggleOpenSection(setOpenSection, 'content', 'placement')}
      >
        <LayerNameInput value={layer.name} placeholder="Layer name" onChange={(v) => onChange({ name: v })} />
        <InspectorTextArea
          label="Text"
          value={layer.content}
          onChange={(v) => onChange({ content: v } as Partial<TextLayer>)}
        />
        <FontPicker
          label="Font"
          value={layer.font}
          onChange={(v) => onChange({ font: v as TextLayer['font'] } as Partial<TextLayer>)}
        />
        <InspectorSlider
          label="Size"
          value={layer.size}
          {...R.size}
          onChange={(v) => onChange({ size: v } as Partial<TextLayer>)}
        />
        <InspectorSelect
          label="Align"
          value={layer.align}
          options={[...TEXT_ALIGN_OPTIONS]}
          onChange={(v) => onChange({ align: v as TextLayer['align'] } as Partial<TextLayer>)}
        />
      </InspectorSection>
      <LayerPlacementControls
        layer={layer}
        open={openSection === 'placement'}
        onToggle={() => toggleOpenSection(setOpenSection, 'placement', 'style')}
        onChange={(patch) => onChange(patch as Partial<TextLayer>)}
      >
        <PlacementRotationSlider layer={layer} onChange={(patch) => onChange(patch as Partial<TextLayer>)} />
        <PlacementScaleLockRow
          layer={layer}
          locked={scaleLocked}
          onLockChange={setScaleLocked}
          onChange={(patch) => onChange(patch as Partial<TextLayer>)}
        />
      </LayerPlacementControls>
      <LayerStyleForLayer layer={layer} openSection={openSection} setOpenSection={setOpenSection} onChange={onChange}>
        <InspectorColorInput
          label="Color"
          value={layer.color}
          onChange={(v) => onChange({ color: v } as Partial<TextLayer>)}
        />
      </LayerStyleForLayer>
    </div>
  );
}

function ImageLayerControls({
  layer,
  sectionClassName,
  openSection,
  setOpenSection,
  scaleLocked,
  setScaleLocked,
  showAiGenerationProvenance,
  onChange,
}: {
  layer: ImageLayer;
  sectionClassName: string;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  scaleLocked: boolean;
  setScaleLocked: SetScaleLocked;
  showAiGenerationProvenance: boolean;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <div className={sectionClassName}>
      <InspectorSection
        title="Content"
        summary={`${layer.fit} fit`}
        open={openSection === 'content'}
        onToggle={() => toggleOpenSection(setOpenSection, 'content', 'placement')}
      >
        <LayerNameInput value={layer.name} onChange={(v) => onChange({ name: v })} />
        {showAiGenerationProvenance && <ImageGenerationProvenance layer={layer} />}
        <InspectorSelect
          label="Fit"
          value={layer.fit}
          options={[...IMAGE_FIT_OPTIONS]}
          onChange={(v) => onChange({ fit: v } as Partial<ImageLayer>)}
        />
      </InspectorSection>
      <LayerPlacementControls
        layer={layer}
        open={openSection === 'placement'}
        onToggle={() => toggleOpenSection(setOpenSection, 'placement', 'style')}
        onChange={(patch) => onChange(patch as Partial<ImageLayer>)}
      >
        <PlacementScaleLockRow
          layer={layer}
          locked={scaleLocked}
          onLockChange={setScaleLocked}
          onChange={(patch) => onChange(patch as Partial<ImageLayer>)}
        />
        <PlacementRotationSlider layer={layer} onChange={(patch) => onChange(patch as Partial<ImageLayer>)} />
      </LayerPlacementControls>
      <LayerStyleForLayer layer={layer} openSection={openSection} setOpenSection={setOpenSection} onChange={onChange} />
    </div>
  );
}

function FillLayerControls({
  layer,
  sectionClassName,
  openSection,
  setOpenSection,
  onChange,
}: {
  layer: FillLayer;
  sectionClassName: string;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <div className={sectionClassName}>
      <LayerContentSection
        summary="Solid fill"
        open={openSection === 'content'}
        onToggle={() => toggleOpenSection(setOpenSection, 'content', 'style')}
      >
        <LayerNameInput value={layer.name} onChange={(v) => onChange({ name: v })} />
        <InspectorColorInput
          label="Color"
          value={layer.color}
          onChange={(v) => onChange({ color: v } as Partial<FillLayer>)}
        />
      </LayerContentSection>
      <LayerStyleForLayer layer={layer} openSection={openSection} setOpenSection={setOpenSection} onChange={onChange} />
    </div>
  );
}

function EmojiLayerControls({
  layer,
  sectionClassName,
  openSection,
  setOpenSection,
  onChange,
}: {
  layer: EmojiLayer;
  sectionClassName: string;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <div className={sectionClassName}>
      <LayerContentSection
        summary={`${layer.density} density`}
        open={openSection === 'content'}
        onToggle={() => toggleOpenSection(setOpenSection, 'content', 'style')}
      >
        <LayerNameInput value={layer.name} onChange={(v) => onChange({ name: v })} />
        <InspectorTextInput
          label="Emojis"
          value={layer.emojis.join(' ')}
          onChange={(v) => onChange({ emojis: parseEmojiInput(v) } as Partial<EmojiLayer>)}
          placeholder="😂 😭 💔"
          hint="Separate emojis with spaces or commas."
        />
        <InspectorSlider
          label="Density"
          value={layer.density}
          {...R.density}
          onChange={(v) => onChange({ density: v } as Partial<EmojiLayer>)}
        />
        <InspectorSlider
          label="Seed"
          value={Math.round(layer.seedOffset ?? 0)}
          {...R.seedOffset}
          overrideMax={9999}
          onChange={(v) => onChange({ seedOffset: v } as Partial<EmojiLayer>)}
        />
        <InspectorSlider
          label="Smallest"
          value={layer.minSz}
          {...R.minSz}
          onChange={(v) =>
            onChange({
              minSz: v,
              maxSz: Math.max(layer.maxSz, v),
            } as Partial<EmojiLayer>)
          }
        />
        <InspectorSlider
          label="Biggest"
          value={layer.maxSz}
          {...R.maxSz}
          onChange={(v) =>
            onChange({
              maxSz: v,
              minSz: Math.min(layer.minSz, v),
            } as Partial<EmojiLayer>)
          }
        />
      </LayerContentSection>
      <InspectorSection
        title="Style"
        summary={`${layer.opacity}% opacity`}
        open={openSection === 'style'}
        onToggle={() => toggleOpenSection(setOpenSection, 'style', 'content')}
      >
        <InspectorSlider
          label="Opacity"
          value={layer.opacity}
          {...R.opacity}
          onChange={(v) => onChange({ opacity: v })}
        />
      </InspectorSection>
    </div>
  );
}

function sourceSurfaceNote(surface: LayerControlsSurface, layer: SourceLayer): string | null {
  return SOURCE_SURFACE_NOTES[`${surface}:${layer.kind}`] ?? SOURCE_SURFACE_NOTES[layer.kind] ?? null;
}

const SOURCE_SURFACE_NOTES: Partial<
  Record<SourceLayer['kind'] | `${LayerControlsSurface}:${SourceLayer['kind']}`, string>
> = {
  'layers:primitive':
    'Camera framing is node-owned. Switch to Nodes and drag the primitive preview to rotate, pan, or zoom. Spin and depth stay here.',
  noise: 'Noise fills the canvas. Placement controls are unavailable; tune the pattern here or branch it in Nodes.',
  lineField: 'Line Field fills the frame automatically. Tune density, spacing, stroke, and distortion in Pattern.',
  model: 'Model framing is node-owned. GLB rendering will use the source viewport path as this node matures.',
};

function sourceContentFallback(layer: SourceLayer): LayerControlSection {
  return layerHasPlacementControls(layer) ? 'placement' : 'structure';
}

function SourceContentSection({
  layer,
  surface,
  openSection,
  setOpenSection,
  onChange,
}: {
  layer: SourceLayer;
  surface: LayerControlsSurface;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  onChange: (patch: Partial<Layer>) => void;
}) {
  const colorLabels = sourceColorLabels(layer);
  const note = sourceSurfaceNote(surface, layer);
  return (
    <InspectorSection
      title="Content"
      summary={sourceSummary(layer)}
      open={openSection === 'content'}
      onToggle={() => toggleOpenSection(setOpenSection, 'content', sourceContentFallback(layer))}
    >
      <InspectorTextInput label="Name" value={layer.name} onChange={(v) => onChange({ name: v })} />
      <InspectorColorInput
        label={colorLabels.primary}
        value={layer.color}
        onChange={(v) => onChange({ color: v } as Partial<SourceLayer>)}
      />
      <InspectorColorInput
        label={colorLabels.secondary}
        value={layer.accentColor}
        onChange={(v) => onChange({ accentColor: v } as Partial<SourceLayer>)}
      />
      {note && <p className="node-inspector-note">{note}</p>}
      {layer.kind !== 'primitive' && (
        <>
          <InspectorSlider
            label="Node Seed"
            value={Math.round(layer.seedOffset ?? 0)}
            {...R.seedOffset}
            overrideMax={9999}
            onChange={(v) => onChange({ seedOffset: v } as Partial<SourceLayer>)}
          />
          <p className="node-inspector-note">
            Changes this node's generated pattern without changing the document seed.
          </p>
        </>
      )}
    </InspectorSection>
  );
}

function SourcePlacementSection({
  layer,
  openSection,
  setOpenSection,
  scaleLocked,
  setScaleLocked,
  onChange,
}: {
  layer: SourceLayer;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  scaleLocked: boolean;
  setScaleLocked: SetScaleLocked;
  onChange: (patch: Partial<Layer>) => void;
}) {
  if (!layerHasPlacementControls(layer)) return null;
  return (
    <PlacementSection
      x={layer.x}
      y={layer.y}
      open={openSection === 'placement'}
      onToggle={() => toggleOpenSection(setOpenSection, 'placement', 'structure')}
      onReset={() => onChange(DEFAULT_PLACEMENT as Partial<SourceLayer>)}
      onChange={(patch) => onChange(patch as Partial<SourceLayer>)}
    >
      <ScaleLockRow
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        locked={scaleLocked}
        onLockChange={setScaleLocked}
        onChange={(patch) => onChange(patch as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Rotation"
        value={Math.round(layer.rotation)}
        {...R.rotation}
        onChange={(v) => onChange({ rotation: v } as Partial<SourceLayer>)}
      />
    </PlacementSection>
  );
}

function PrimitiveStructureControls({
  layer,
  surface,
  onChange,
}: {
  layer: PrimitiveLayer;
  surface: LayerControlsSurface;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <>
      <InspectorSelect
        label="Shape"
        value={layer.primitiveShape}
        options={[...PRIMITIVE_SHAPE_OPTIONS]}
        onChange={(v) =>
          onChange({
            primitiveShape: v as SourceLayer['primitiveShape'],
          } as Partial<SourceLayer>)
        }
      />
      {surface === 'nodes' && (
        <p className="node-inspector-note">Camera angle is controlled in the preview: drag rotates, wheel zooms.</p>
      )}
      <InspectorSlider
        label="Spin"
        value={Math.round(layer.tiltZ)}
        {...R.tiltZ}
        onChange={(v) => onChange({ tiltZ: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Depth"
        value={Math.round(layer.primitiveDepth)}
        {...R.primitiveDepth}
        onChange={(v) => onChange({ primitiveDepth: v } as Partial<SourceLayer>)}
      />
      <InspectorSelect
        label="Shading"
        value={layer.primitiveShading ?? 'smooth'}
        options={[...PRIMITIVE_SHADING_OPTIONS]}
        onChange={(v) =>
          onChange({
            primitiveShading: v as 'smooth' | 'flat',
          } as Partial<SourceLayer>)
        }
      />
      <PrimitiveMaterialControls layer={layer} onChange={onChange} />
    </>
  );
}

function PrimitiveMaterialControls({
  layer,
  onChange,
}: {
  layer: PrimitiveLayer;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <>
      <InspectorSelect
        label="Material"
        value={layer.materialPreset}
        options={MATERIAL_PRESET_OPTIONS}
        onChange={(value) => onChange(MATERIAL_PRESETS[value as MaterialPreset] as Partial<PrimitiveLayer>)}
      />
      <InspectorColorInput
        label="Base"
        value={layer.materialBaseColor}
        onChange={(value) => onChange({ materialBaseColor: value } as Partial<PrimitiveLayer>)}
      />
      <InspectorColorInput
        label="Accent"
        value={layer.materialAccentColor}
        onChange={(value) => onChange({ materialAccentColor: value } as Partial<PrimitiveLayer>)}
      />
      {MATERIAL_PERCENT_FIELDS.map(([field, label, range]) => (
        <InspectorSlider
          key={field}
          label={label}
          value={Math.round((layer[field] ?? 0) * 100)}
          {...R[range]}
          onChange={(value) => onChange({ [field]: value / 100 } as Partial<PrimitiveLayer>)}
        />
      ))}
    </>
  );
}

function NoiseStructureControls({
  layer,
  onChange,
}: {
  layer: SourceLayer;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <>
      <InspectorSelect
        label="Noise"
        value={layer.noiseType}
        options={[...NOISE_TYPE_OPTIONS]}
        onChange={(v) =>
          onChange({
            noiseType: v as SourceLayer['noiseType'],
          } as Partial<SourceLayer>)
        }
      />
      <InspectorSlider
        label="Scale"
        value={Math.round(layer.noiseScale)}
        {...R.noiseScale}
        onChange={(v) => onChange({ noiseScale: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Detail"
        value={Math.round(layer.noiseDetail)}
        {...R.noiseDetail}
        onChange={(v) => onChange({ noiseDetail: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Contrast"
        value={Math.round(layer.noiseContrast)}
        {...R.noiseContrast}
        onChange={(v) => onChange({ noiseContrast: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Balance"
        value={Math.round(layer.noiseBalance)}
        {...R.noiseBalance}
        onChange={(v) => onChange({ noiseBalance: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Domain Warp"
        value={Math.round(layer.noiseWarp ?? 0)}
        {...R.noiseWarp}
        onChange={(v) => onChange({ noiseWarp: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Turbulence"
        value={Math.round(layer.noiseTurbulence ?? 0)}
        {...R.noiseTurbulence}
        onChange={(v) => onChange({ noiseTurbulence: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Threshold"
        value={Math.round(layer.noiseThreshold ?? 0)}
        {...R.noiseThreshold}
        onChange={(v) => onChange({ noiseThreshold: v } as Partial<SourceLayer>)}
      />
    </>
  );
}

function ArrayStructureControls({
  layer,
  onChange,
}: {
  layer: SourceLayer;
  onChange: (patch: Partial<Layer>) => void;
}) {
  const arrayLabels = getArrayControlLabels(layer);
  return (
    <>
      <InspectorSelect
        label="Pattern"
        value={layer.arrayPattern}
        options={[...ARRAY_PATTERN_OPTIONS]}
        onChange={(v) =>
          onChange({
            arrayPattern: v as SourceLayer['arrayPattern'],
          } as Partial<SourceLayer>)
        }
      />
      <InspectorSelect
        label="Shape"
        value={layer.arrayShape}
        options={[...ARRAY_SHAPE_OPTIONS]}
        onChange={(v) =>
          onChange({
            arrayShape: v as SourceLayer['arrayShape'],
          } as Partial<SourceLayer>)
        }
      />
      <InspectorSlider
        label={arrayLabels.count}
        value={Math.round(layer.arrayCount)}
        {...R.arrayCount}
        overrideMax={64}
        onChange={(v) => onChange({ arrayCount: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label={arrayLabels.rows}
        value={Math.round(layer.arrayRows)}
        {...R.arrayRows}
        overrideMax={48}
        onChange={(v) => onChange({ arrayRows: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label={arrayLabels.gap}
        value={Math.round(layer.arrayGap)}
        {...R.arrayGap}
        overrideMax={240}
        onChange={(v) => onChange({ arrayGap: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label={arrayLabels.size}
        value={Math.round(layer.arraySize)}
        {...R.arraySize}
        onChange={(v) => onChange({ arraySize: v } as Partial<SourceLayer>)}
      />
      {arrayLabels.radius && (
        <InspectorSlider
          label={arrayLabels.radius}
          value={Math.round(layer.arrayRadius)}
          {...R.arrayRadius}
          overrideMax={420}
          onChange={(v) => onChange({ arrayRadius: v } as Partial<SourceLayer>)}
        />
      )}
      <InspectorSlider
        label={arrayLabels.jitter}
        value={Math.round(layer.arrayJitter)}
        {...R.arrayJitter}
        overrideMax={180}
        onChange={(v) => onChange({ arrayJitter: v } as Partial<SourceLayer>)}
      />
      {arrayLabels.note && <p className="node-inspector-note">{arrayLabels.note}</p>}
    </>
  );
}

function LineFieldStructureControls({
  layer,
  onChange,
}: {
  layer: SourceLayer;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <>
      <InspectorSelect
        label="Direction"
        value={layer.lineFieldOrientation}
        options={[...LINE_FIELD_ORIENTATION_OPTIONS]}
        onChange={(v) =>
          onChange({
            lineFieldOrientation: v as SourceLayer['lineFieldOrientation'],
          } as Partial<SourceLayer>)
        }
      />
      <InspectorSelect
        label="Distortion"
        value={layer.lineFieldDistortion}
        options={[...LINE_FIELD_DISTORTION_OPTIONS]}
        onChange={(v) =>
          onChange({
            lineFieldDistortion: v as SourceLayer['lineFieldDistortion'],
          } as Partial<SourceLayer>)
        }
      />
      <InspectorSlider
        label="Lines"
        value={Math.round(layer.lineFieldCount)}
        {...R.lineFieldCount}
        onChange={(v) => onChange({ lineFieldCount: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Spacing"
        value={Math.round(layer.lineFieldSpacing)}
        {...R.lineFieldSpacing}
        onChange={(v) => onChange({ lineFieldSpacing: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Stroke"
        value={Math.round(layer.lineFieldStroke)}
        {...R.lineFieldStroke}
        onChange={(v) => onChange({ lineFieldStroke: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Distort"
        value={Math.round(layer.lineFieldStrength)}
        {...R.lineFieldStrength}
        onChange={(v) => onChange({ lineFieldStrength: v } as Partial<SourceLayer>)}
      />
      <InspectorSlider
        label="Frequency"
        value={Math.round(layer.lineFieldFrequency)}
        {...R.lineFieldFrequency}
        onChange={(v) => onChange({ lineFieldFrequency: v } as Partial<SourceLayer>)}
      />
      <InspectorToggle
        label="Transparent"
        checked={layer.lineFieldTransparent}
        onChange={(v) => onChange({ lineFieldTransparent: v } as Partial<SourceLayer>)}
      />
      {!layer.lineFieldTransparent && (
        <InspectorColorInput
          label="Background"
          value={layer.lineFieldBackground}
          onChange={(v) => onChange({ lineFieldBackground: v } as Partial<SourceLayer>)}
        />
      )}
    </>
  );
}

function ModelFileAction({
  hasModel,
  inputRef,
  onLoadFile,
}: {
  hasModel: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onLoadFile?: (file: File) => void;
}) {
  if (!onLoadFile) return null;
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onLoadFile(file);
  };
  return (
    <>
      <button
        className="node-inspector-action nodrag nopan nowheel"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        {hasModel ? 'Replace model' : 'Load GLB'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,model/gltf-binary,application/octet-stream"
        className="node-hidden-file-input"
        onChange={handleFileChange}
        tabIndex={-1}
      />
    </>
  );
}

function ModelStructureControls({
  layer,
  inputRef,
  onLoadFile,
}: {
  layer: SourceLayer;
  inputRef: RefObject<HTMLInputElement | null>;
  onLoadFile?: (file: File) => void;
}) {
  if (layer.kind !== 'model') return null;
  return (
    <>
      <InspectorReadout label="Asset" value={layer.modelName || 'Imported model'} />
      <InspectorReadout label="Format" value={layer.modelMime || 'model/gltf-binary'} />
      <InspectorReadout label="Size" value={`${Math.max(0, Math.round(layer.modelBytes / 1024))} KB`} />
      <ModelFileAction hasModel={Boolean(layer.modelSrc)} inputRef={inputRef} onLoadFile={onLoadFile} />
    </>
  );
}

function SourceStructureControls({
  layer,
  surface,
  onChange,
  modelFileInputRef,
  onLoadModelFile,
}: {
  layer: SourceLayer;
  surface: LayerControlsSurface;
  onChange: (patch: Partial<Layer>) => void;
  modelFileInputRef: RefObject<HTMLInputElement | null>;
  onLoadModelFile?: (file: File) => void;
}) {
  if (layer.kind === 'primitive')
    return <PrimitiveStructureControls layer={layer as PrimitiveLayer} surface={surface} onChange={onChange} />;
  if (layer.kind === 'noise') return <NoiseStructureControls layer={layer} onChange={onChange} />;
  if (layer.kind === 'lineField') return <LineFieldStructureControls layer={layer} onChange={onChange} />;
  if (layer.kind === 'model')
    return <ModelStructureControls layer={layer} inputRef={modelFileInputRef} onLoadFile={onLoadModelFile} />;
  return <ArrayStructureControls layer={layer} onChange={onChange} />;
}

function SourceLayerControls({
  layer,
  sectionClassName,
  openSection,
  setOpenSection,
  scaleLocked,
  setScaleLocked,
  surface,
  onChange,
  modelFileInputRef,
  onLoadModelFile,
}: {
  layer: SourceLayer;
  sectionClassName: string;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  scaleLocked: boolean;
  setScaleLocked: SetScaleLocked;
  surface: LayerControlsSurface;
  onChange: (patch: Partial<Layer>) => void;
  modelFileInputRef: RefObject<HTMLInputElement | null>;
  onLoadModelFile?: (file: File) => void;
}) {
  return (
    <div className={sectionClassName}>
      <SourceContentSection
        layer={layer}
        surface={surface}
        openSection={openSection}
        setOpenSection={setOpenSection}
        onChange={onChange}
      />
      <SourcePlacementSection
        layer={layer}
        openSection={openSection}
        setOpenSection={setOpenSection}
        scaleLocked={scaleLocked}
        setScaleLocked={setScaleLocked}
        onChange={onChange}
      />
      <InspectorSection
        title={layer.kind === 'primitive' ? 'Structure' : layer.kind === 'model' ? 'Model' : 'Pattern'}
        summary={structureSummary(layer)}
        open={openSection === 'structure'}
        onToggle={() => toggleOpenSection(setOpenSection, 'structure', 'style')}
      >
        <SourceStructureControls
          layer={layer}
          surface={surface}
          onChange={onChange}
          modelFileInputRef={modelFileInputRef}
          onLoadModelFile={onLoadModelFile}
        />
      </InspectorSection>
      <LayerStyleForLayer layer={layer} openSection={openSection} setOpenSection={setOpenSection} onChange={onChange} />
    </div>
  );
}

type LayerControlRenderProps = {
  layer: Layer;
  sectionClassName: string;
  openSection: LayerControlSection;
  setOpenSection: SetOpenSection;
  scaleLocked: boolean;
  setScaleLocked: SetScaleLocked;
  showAiGenerationProvenance: boolean;
  onChange: (patch: Partial<Layer>) => void;
};

const BASIC_LAYER_CONTROLS: Record<BasicLayerKind, (props: LayerControlRenderProps) => ReactNode> = {
  text: ({ layer, ...props }) => <TextLayerControls {...props} layer={layer as TextLayer} />,
  image: ({ layer, ...props }) => <ImageLayerControls {...props} layer={layer as ImageLayer} />,
  fill: ({ layer, ...props }) => <FillLayerControls {...props} layer={layer as FillLayer} />,
  emoji: ({ layer, ...props }) => <EmojiLayerControls {...props} layer={layer as EmojiLayer} />,
};

function basicLayerControlRenderer(kind: Layer['kind']) {
  return BASIC_LAYER_CONTROLS[kind as BasicLayerKind] ?? null;
}

export function LayerControls({
  layer,
  onChange,
  dirty = false,
  detached = false,
  showAiGenerationProvenance = true,
  surface = 'nodes',
  onLoadModelFile,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  dirty?: boolean;
  detached?: boolean;
  showAiGenerationProvenance?: boolean;
  surface?: LayerControlsSurface;
  onLoadModelFile?: (file: File) => void;
}) {
  const [scaleLocked, setScaleLocked] = useState(true);
  const [openSection, setOpenSection] = useState<LayerControlSection>('content');
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const sectionClassName = detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached';
  const renderProps = {
    layer,
    sectionClassName,
    openSection,
    setOpenSection,
    scaleLocked,
    setScaleLocked,
    showAiGenerationProvenance,
    onChange,
  };
  const renderBasicLayerControls = basicLayerControlRenderer(layer.kind);
  const content = renderBasicLayerControls ? (
    renderBasicLayerControls(renderProps)
  ) : SOURCE_LAYER_KINDS.has(layer.kind) ? (
    <SourceLayerControls
      {...renderProps}
      layer={layer as SourceLayer}
      surface={surface}
      modelFileInputRef={modelFileInputRef}
      onLoadModelFile={onLoadModelFile}
    />
  ) : (
    <EffectInspector layer={layer} onChange={(patch) => onChange(patch as Partial<Layer>)} detached={detached} />
  );

  return <InspectorStateProvider value={{ dirty, locked: layer.locked }}>{content}</InspectorStateProvider>;
}

function sourceSummary(layer: SourceLayer) {
  if (layer.kind === 'primitive') return `${layer.primitiveShape} form`;
  if (layer.kind === 'noise') return `${layer.noiseType} texture`;
  if (layer.kind === 'lineField') return `${layer.lineFieldOrientation} lines`;
  if (layer.kind === 'model') return layer.modelName || '3D model';
  return `${layer.arrayPattern} repeat`;
}

function structureSummary(layer: SourceLayer) {
  return SOURCE_STRUCTURE_SUMMARY[layer.kind](layer as never);
}

const SOURCE_STRUCTURE_SUMMARY = {
  primitive: (layer: Extract<SourceLayer, { kind: 'primitive' }>) => `${layer.primitiveShading ?? 'smooth'} shading`,
  noise: (layer: Extract<SourceLayer, { kind: 'noise' }>) => `${Math.round(layer.noiseScale)} scale`,
  lineField: (layer: Extract<SourceLayer, { kind: 'lineField' }>) => `${Math.round(layer.lineFieldCount)} lines`,
  model: (layer: Extract<SourceLayer, { kind: 'model' }>) => `${Math.max(0, Math.round(layer.modelBytes / 1024))} KB`,
  array: (layer: Extract<SourceLayer, { kind: 'array' }>) => `${Math.round(layer.arrayCount)} items`,
};

function getArrayControlLabels(layer: SourceLayer): {
  count: string;
  rows: string;
  gap: string;
  size: string;
  radius?: string;
  jitter: string;
  note?: string;
} {
  if (layer.arrayPattern === 'radial') return ARRAY_RADIAL_LABELS;
  if (layer.arrayPattern !== 'line') return ARRAY_DEFAULT_LABELS;
  return layer.arrayShape === 'bar' ? ARRAY_BAR_LABELS : ARRAY_LINE_LABELS;
}
