/**
 * LayerControls — canonical inspector-style layer control renderer.
 *
 * Both the node canvas inspector and (optionally) the classic sidebar use
 * this component. Field ranges and option lists are imported from fieldDefs
 * so that control behavior never drifts between surfaces.
 */
import { useState } from 'react';

import {
  type EmojiLayer,
  type FillLayer,
  FONT_NAMES,
  type ImageLayer,
  type Layer,
  type SourceLayer,
  type TextLayer,
} from '../../types/config';
import { EffectInspector } from '../node-canvas/inspector/EffectInspector';
import {
  InspectorColorInput,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextArea,
  InspectorTextInput,
  ScaleLockRow,
} from '../node-canvas/inspector/fields';
import { layerHasPlacementControls } from './controlModel';
import {
  ARRAY_PATTERN_OPTIONS,
  ARRAY_SHAPE_OPTIONS,
  BLEND_OPTIONS,
  FIELD_RANGES,
  IMAGE_FIT_OPTIONS,
  NOISE_TYPE_OPTIONS,
  PRIMITIVE_SHADING_OPTIONS,
  PRIMITIVE_SHAPE_OPTIONS,
  TEXT_ALIGN_OPTIONS,
} from './fieldDefs';

const R = FIELD_RANGES;

export function LayerControls({
  layer,
  onChange,
  detached = false,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  detached?: boolean;
}) {
  const [scaleLocked, setScaleLocked] = useState(true);
  const [openSection, setOpenSection] = useState<'content' | 'placement' | 'style' | 'structure'>('content');
  const sectionClassName = detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached';

  if (layer.kind === 'text') {
    return (
      <div className={sectionClassName}>
        <InspectorSection
          title="Content"
          summary={`${layer.font} · ${layer.size}px`}
          open={openSection === 'content'}
          onToggle={() => setOpenSection((s) => (s === 'content' ? 'placement' : 'content'))}
        >
          <InspectorTextInput value={layer.name} onChange={(v) => onChange({ name: v })} placeholder="Layer name" />
          <InspectorTextArea value={layer.content} onChange={(v) => onChange({ content: v } as Partial<TextLayer>)} />
          <InspectorSelect
            label="Font"
            value={layer.font}
            options={[...FONT_NAMES]}
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
        <InspectorSection
          title="Placement"
          summary={`${Math.round(layer.x * 100)} / ${Math.round(layer.y * 100)}`}
          open={openSection === 'placement'}
          onToggle={() => setOpenSection((s) => (s === 'placement' ? 'style' : 'placement'))}
        >
          <InspectorSlider
            label="Horizontal"
            value={Math.round(layer.x * 100)}
            {...R.x}
            onChange={(v) => onChange({ x: v / 100 } as Partial<TextLayer>)}
          />
          <InspectorSlider
            label="Vertical"
            value={Math.round(layer.y * 100)}
            {...R.y}
            onChange={(v) => onChange({ y: v / 100 } as Partial<TextLayer>)}
          />
          <InspectorSlider
            label="Rotation"
            value={Math.round(layer.rotation)}
            {...R.rotation}
            onChange={(v) => onChange({ rotation: v } as Partial<TextLayer>)}
          />
          <ScaleLockRow
            scaleX={layer.scaleX}
            scaleY={layer.scaleY}
            locked={scaleLocked}
            onLockChange={setScaleLocked}
            onChange={(patch) => onChange(patch as Partial<TextLayer>)}
          />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((s) => (s === 'style' ? 'content' : 'style'))}
        >
          <InspectorColorInput
            label="Color"
            value={layer.color}
            onChange={(v) => onChange({ color: v } as Partial<TextLayer>)}
          />
          <InspectorSlider
            label="Opacity"
            value={layer.opacity}
            {...R.opacity}
            onChange={(v) => onChange({ opacity: v })}
          />
          <InspectorSelect
            label="Blend"
            value={layer.blendMode}
            options={[...BLEND_OPTIONS]}
            onChange={(v) => onChange({ blendMode: v })}
          />
        </InspectorSection>
      </div>
    );
  }

  if (layer.kind === 'image') {
    return (
      <div className={sectionClassName}>
        <InspectorSection
          title="Content"
          summary={`${layer.fit} fit`}
          open={openSection === 'content'}
          onToggle={() => setOpenSection((s) => (s === 'content' ? 'placement' : 'content'))}
        >
          <InspectorTextInput value={layer.name} onChange={(v) => onChange({ name: v })} />
          <InspectorSelect
            label="Fit"
            value={layer.fit}
            options={[...IMAGE_FIT_OPTIONS]}
            onChange={(v) => onChange({ fit: v } as Partial<ImageLayer>)}
          />
        </InspectorSection>
        <InspectorSection
          title="Placement"
          summary={`${Math.round(layer.x * 100)} / ${Math.round(layer.y * 100)}`}
          open={openSection === 'placement'}
          onToggle={() => setOpenSection((s) => (s === 'placement' ? 'style' : 'placement'))}
        >
          <InspectorSlider
            label="Horizontal"
            value={Math.round(layer.x * 100)}
            {...R.x}
            onChange={(v) => onChange({ x: v / 100 } as Partial<ImageLayer>)}
          />
          <InspectorSlider
            label="Vertical"
            value={Math.round(layer.y * 100)}
            {...R.y}
            onChange={(v) => onChange({ y: v / 100 } as Partial<ImageLayer>)}
          />
          <ScaleLockRow
            scaleX={layer.scaleX}
            scaleY={layer.scaleY}
            locked={scaleLocked}
            onLockChange={setScaleLocked}
            onChange={(patch) => onChange(patch as Partial<ImageLayer>)}
          />
          <InspectorSlider
            label="Rotation"
            value={Math.round(layer.rotation)}
            {...R.rotation}
            onChange={(v) => onChange({ rotation: v } as Partial<ImageLayer>)}
          />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((s) => (s === 'style' ? 'content' : 'style'))}
        >
          <InspectorSlider
            label="Opacity"
            value={layer.opacity}
            {...R.opacity}
            onChange={(v) => onChange({ opacity: v })}
          />
          <InspectorSelect
            label="Blend"
            value={layer.blendMode}
            options={[...BLEND_OPTIONS]}
            onChange={(v) => onChange({ blendMode: v })}
          />
        </InspectorSection>
      </div>
    );
  }

  if (layer.kind === 'fill') {
    return (
      <div className={sectionClassName}>
        <InspectorSection
          title="Content"
          summary="Solid fill"
          open={openSection === 'content'}
          onToggle={() => setOpenSection((s) => (s === 'content' ? 'style' : 'content'))}
        >
          <InspectorTextInput value={layer.name} onChange={(v) => onChange({ name: v })} />
          <InspectorColorInput
            label="Color"
            value={layer.color}
            onChange={(v) => onChange({ color: v } as Partial<FillLayer>)}
          />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((s) => (s === 'style' ? 'content' : 'style'))}
        >
          <InspectorSlider
            label="Opacity"
            value={layer.opacity}
            {...R.opacity}
            onChange={(v) => onChange({ opacity: v })}
          />
          <InspectorSelect
            label="Blend"
            value={layer.blendMode}
            options={[...BLEND_OPTIONS]}
            onChange={(v) => onChange({ blendMode: v })}
          />
        </InspectorSection>
      </div>
    );
  }

  if (layer.kind === 'emoji') {
    return (
      <div className={sectionClassName}>
        <InspectorSection
          title="Content"
          summary={`${layer.density} density`}
          open={openSection === 'content'}
          onToggle={() => setOpenSection((s) => (s === 'content' ? 'style' : 'content'))}
        >
          <InspectorTextInput value={layer.name} onChange={(v) => onChange({ name: v })} />
          <InspectorSlider
            label="Density"
            value={layer.density}
            {...R.density}
            onChange={(v) => onChange({ density: v } as Partial<EmojiLayer>)}
          />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% opacity`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((s) => (s === 'style' ? 'content' : 'style'))}
        >
          <InspectorSlider
            label="Blur"
            value={layer.blur}
            {...R.blur}
            onChange={(v) => onChange({ blur: v } as Partial<EmojiLayer>)}
          />
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

  if (layer.kind === 'primitive' || layer.kind === 'noise' || layer.kind === 'array') {
    const hasPlacementSection = layerHasPlacementControls(layer);

    return (
      <div className={sectionClassName}>
        <InspectorSection
          title="Content"
          summary={sourceSummary(layer)}
          open={openSection === 'content'}
          onToggle={() =>
            setOpenSection((s) => (s === 'content' ? (hasPlacementSection ? 'placement' : 'structure') : 'content'))
          }
        >
          <InspectorTextInput value={layer.name} onChange={(v) => onChange({ name: v })} />
          <InspectorColorInput
            label="Ink"
            value={layer.color}
            onChange={(v) => onChange({ color: v } as Partial<SourceLayer>)}
          />
          <InspectorColorInput
            label="Accent"
            value={layer.accentColor}
            onChange={(v) => onChange({ accentColor: v } as Partial<SourceLayer>)}
          />
        </InspectorSection>
        {hasPlacementSection && (
          <InspectorSection
            title="Placement"
            summary={`${Math.round(layer.x * 100)} / ${Math.round(layer.y * 100)}`}
            open={openSection === 'placement'}
            onToggle={() => setOpenSection((s) => (s === 'placement' ? 'structure' : 'placement'))}
          >
            <InspectorSlider
              label="Horizontal"
              value={Math.round(layer.x * 100)}
              {...R.x}
              onChange={(v) => onChange({ x: v / 100 } as Partial<SourceLayer>)}
            />
            <InspectorSlider
              label="Vertical"
              value={Math.round(layer.y * 100)}
              {...R.y}
              onChange={(v) => onChange({ y: v / 100 } as Partial<SourceLayer>)}
            />
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
          </InspectorSection>
        )}
        <InspectorSection
          title={layer.kind === 'primitive' ? 'Structure' : 'Pattern'}
          summary={structureSummary(layer)}
          open={openSection === 'structure'}
          onToggle={() => setOpenSection((s) => (s === 'structure' ? 'style' : 'structure'))}
        >
          {layer.kind === 'primitive' && (
            <>
              <InspectorSelect
                label="Shape"
                value={layer.primitiveShape}
                options={[...PRIMITIVE_SHAPE_OPTIONS]}
                onChange={(v) =>
                  onChange({ primitiveShape: v as SourceLayer['primitiveShape'] } as Partial<SourceLayer>)
                }
              />
              <p className="node-inspector-note">
                Camera angle is controlled in the preview: drag rotates, wheel zooms.
              </p>
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
                onChange={(v) => onChange({ primitiveShading: v as 'smooth' | 'flat' } as Partial<SourceLayer>)}
              />
            </>
          )}
          {layer.kind === 'noise' && (
            <>
              <InspectorSelect
                label="Noise"
                value={layer.noiseType}
                options={[...NOISE_TYPE_OPTIONS]}
                onChange={(v) => onChange({ noiseType: v as SourceLayer['noiseType'] } as Partial<SourceLayer>)}
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
            </>
          )}
          {layer.kind === 'array' && (
            <>
              <InspectorSelect
                label="Pattern"
                value={layer.arrayPattern}
                options={[...ARRAY_PATTERN_OPTIONS]}
                onChange={(v) => onChange({ arrayPattern: v as SourceLayer['arrayPattern'] } as Partial<SourceLayer>)}
              />
              <InspectorSelect
                label="Shape"
                value={layer.arrayShape}
                options={[...ARRAY_SHAPE_OPTIONS]}
                onChange={(v) => onChange({ arrayShape: v as SourceLayer['arrayShape'] } as Partial<SourceLayer>)}
              />
              <InspectorSlider
                label="Count"
                value={Math.round(layer.arrayCount)}
                {...R.arrayCount}
                overrideMax={64}
                onChange={(v) => onChange({ arrayCount: v } as Partial<SourceLayer>)}
              />
              <InspectorSlider
                label="Rows"
                value={Math.round(layer.arrayRows)}
                {...R.arrayRows}
                overrideMax={48}
                onChange={(v) => onChange({ arrayRows: v } as Partial<SourceLayer>)}
              />
              <InspectorSlider
                label="Gap"
                value={Math.round(layer.arrayGap)}
                {...R.arrayGap}
                overrideMax={240}
                onChange={(v) => onChange({ arrayGap: v } as Partial<SourceLayer>)}
              />
              <InspectorSlider
                label="Size"
                value={Math.round(layer.arraySize)}
                {...R.arraySize}
                onChange={(v) => onChange({ arraySize: v } as Partial<SourceLayer>)}
              />
              <InspectorSlider
                label="Radius"
                value={Math.round(layer.arrayRadius)}
                {...R.arrayRadius}
                overrideMax={420}
                onChange={(v) => onChange({ arrayRadius: v } as Partial<SourceLayer>)}
              />
              <InspectorSlider
                label="Jitter"
                value={Math.round(layer.arrayJitter)}
                {...R.arrayJitter}
                overrideMax={180}
                onChange={(v) => onChange({ arrayJitter: v } as Partial<SourceLayer>)}
              />
            </>
          )}
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((s) => (s === 'style' ? 'content' : 'style'))}
        >
          <InspectorSlider
            label="Opacity"
            value={layer.opacity}
            {...R.opacity}
            onChange={(v) => onChange({ opacity: v } as Partial<SourceLayer>)}
          />
          <InspectorSelect
            label="Blend"
            value={layer.blendMode}
            options={[...BLEND_OPTIONS]}
            onChange={(v) => onChange({ blendMode: v } as Partial<SourceLayer>)}
          />
        </InspectorSection>
      </div>
    );
  }

  return <EffectInspector layer={layer} onChange={(patch) => onChange(patch as Partial<Layer>)} detached={detached} />;
}

function sourceSummary(layer: SourceLayer) {
  if (layer.kind === 'primitive') return `${layer.primitiveShape} form`;
  if (layer.kind === 'noise') return `${layer.noiseType} texture`;
  return `${layer.arrayPattern} repeat`;
}

function structureSummary(layer: SourceLayer) {
  if (layer.kind === 'primitive') return `${layer.primitiveShading ?? 'smooth'} shading`;
  if (layer.kind === 'noise') return `${Math.round(layer.noiseScale)} scale`;
  return `${Math.round(layer.arrayCount)} items`;
}
