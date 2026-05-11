import { useState } from 'react';

import {
  FONT_NAMES,
  type EmojiLayer,
  type FillLayer,
  type ImageLayer,
  type Layer,
  type SourceLayer,
  type TextLayer,
} from '../../../types/config';
import { BLEND_OPTIONS } from '../constants';
import {
  InspectorColorInput,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextArea,
  InspectorTextInput,
  ScaleLockRow,
} from './fields';
import { EffectInspector } from './EffectInspector';

export function LayerInspector({
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
          onToggle={() => setOpenSection((current) => current === 'content' ? 'placement' : 'content')}
        >
          <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} placeholder="Layer name" />
          <InspectorTextArea value={layer.content} onChange={(value) => onChange({ content: value } as Partial<TextLayer>)} />
          <InspectorSelect label="Font" value={layer.font} options={[...FONT_NAMES]} onChange={(value) => onChange({ font: value as TextLayer['font'] } as Partial<TextLayer>)} />
          <InspectorSlider label="Size" value={layer.size} min={12} max={160} onChange={(value) => onChange({ size: value } as Partial<TextLayer>)} />
          <InspectorSelect label="Align" value={layer.align} options={['left', 'center', 'right']} onChange={(value) => onChange({ align: value as TextLayer['align'] } as Partial<TextLayer>)} />
        </InspectorSection>
        <InspectorSection
          title="Placement"
          summary={`${Math.round(layer.x * 100)} / ${Math.round(layer.y * 100)}`}
          open={openSection === 'placement'}
          onToggle={() => setOpenSection((current) => current === 'placement' ? 'style' : 'placement')}
        >
          <InspectorSlider label="Horizontal" value={Math.round(layer.x * 100)} min={-200} max={200} onChange={(value) => onChange({ x: value / 100 } as Partial<TextLayer>)} />
          <InspectorSlider label="Vertical" value={Math.round(layer.y * 100)} min={-200} max={200} onChange={(value) => onChange({ y: value / 100 } as Partial<TextLayer>)} />
          <InspectorSlider label="Rotation" value={Math.round(layer.rotation)} min={-180} max={180} onChange={(value) => onChange({ rotation: value } as Partial<TextLayer>)} />
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
          onToggle={() => setOpenSection((current) => current === 'style' ? 'content' : 'style')}
        >
          <InspectorColorInput label="Color" value={layer.color} onChange={(value) => onChange({ color: value } as Partial<TextLayer>)} />
          <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
          <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
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
          onToggle={() => setOpenSection((current) => current === 'content' ? 'placement' : 'content')}
        >
          <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
          <InspectorSelect label="Fit" value={layer.fit} options={['cover', 'contain', 'tile', 'free']} onChange={(value) => onChange({ fit: value } as Partial<ImageLayer>)} />
        </InspectorSection>
        <InspectorSection
          title="Placement"
          summary={`${Math.round(layer.x * 100)} / ${Math.round(layer.y * 100)}`}
          open={openSection === 'placement'}
          onToggle={() => setOpenSection((current) => current === 'placement' ? 'style' : 'placement')}
        >
          <InspectorSlider label="Horizontal" value={Math.round(layer.x * 100)} min={-200} max={200} onChange={(value) => onChange({ x: value / 100 } as Partial<ImageLayer>)} />
          <InspectorSlider label="Vertical" value={Math.round(layer.y * 100)} min={-200} max={200} onChange={(value) => onChange({ y: value / 100 } as Partial<ImageLayer>)} />
          <ScaleLockRow
            scaleX={layer.scaleX}
            scaleY={layer.scaleY}
            locked={scaleLocked}
            onLockChange={setScaleLocked}
            onChange={(patch) => onChange(patch as Partial<ImageLayer>)}
          />
          <InspectorSlider label="Rotation" value={Math.round(layer.rotation)} min={-180} max={180} onChange={(value) => onChange({ rotation: value } as Partial<ImageLayer>)} />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((current) => current === 'style' ? 'content' : 'style')}
        >
          <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
          <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
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
          onToggle={() => setOpenSection((current) => current === 'content' ? 'style' : 'content')}
        >
          <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
          <InspectorColorInput label="Color" value={layer.color} onChange={(value) => onChange({ color: value } as Partial<FillLayer>)} />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((current) => current === 'style' ? 'content' : 'style')}
        >
          <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
          <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
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
          onToggle={() => setOpenSection((current) => current === 'content' ? 'style' : 'content')}
        >
          <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
          <InspectorSlider label="Density" value={layer.density} min={1} max={100} onChange={(value) => onChange({ density: value } as Partial<EmojiLayer>)} />
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% opacity`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((current) => current === 'style' ? 'content' : 'style')}
        >
          <InspectorSlider label="Blur" value={layer.blur} min={0} max={100} onChange={(value) => onChange({ blur: value } as Partial<EmojiLayer>)} />
          <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
        </InspectorSection>
      </div>
    );
  }
  if (layer.kind === 'primitive' || layer.kind === 'noise' || layer.kind === 'array') {
    return (
      <div className={sectionClassName}>
        <InspectorSection
          title="Content"
          summary={sourceSummary(layer)}
          open={openSection === 'content'}
          onToggle={() => setOpenSection((current) => current === 'content' ? 'placement' : 'content')}
        >
          <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
          <InspectorColorInput label="Ink" value={layer.color} onChange={(value) => onChange({ color: value } as Partial<SourceLayer>)} />
          <InspectorColorInput label="Accent" value={layer.accentColor} onChange={(value) => onChange({ accentColor: value } as Partial<SourceLayer>)} />
        </InspectorSection>
        <InspectorSection
          title="Placement"
          summary={`${Math.round(layer.x * 100)} / ${Math.round(layer.y * 100)}`}
          open={openSection === 'placement'}
          onToggle={() => setOpenSection((current) => current === 'placement' ? 'structure' : 'placement')}
        >
          <InspectorSlider label="Horizontal" value={Math.round(layer.x * 100)} min={-200} max={200} onChange={(value) => onChange({ x: value / 100 } as Partial<SourceLayer>)} />
          <InspectorSlider label="Vertical" value={Math.round(layer.y * 100)} min={-200} max={200} onChange={(value) => onChange({ y: value / 100 } as Partial<SourceLayer>)} />
          <ScaleLockRow
            scaleX={layer.scaleX}
            scaleY={layer.scaleY}
            locked={scaleLocked}
            onLockChange={setScaleLocked}
            onChange={(patch) => onChange(patch as Partial<SourceLayer>)}
          />
          <InspectorSlider label="Rotation" value={Math.round(layer.rotation)} min={-180} max={180} onChange={(value) => onChange({ rotation: value } as Partial<SourceLayer>)} />
        </InspectorSection>
        <InspectorSection
          title={layer.kind === 'primitive' ? 'Structure' : 'Pattern'}
          summary={structureSummary(layer)}
          open={openSection === 'structure'}
          onToggle={() => setOpenSection((current) => current === 'structure' ? 'style' : 'structure')}
        >
          {layer.kind === 'primitive' && (
            <>
              <InspectorSelect
                label="Shape"
                value={layer.primitiveShape}
                options={['sphere', 'cube', 'cylinder']}
                onChange={(value) => onChange({ primitiveShape: value as SourceLayer['primitiveShape'] } as Partial<SourceLayer>)}
              />
              <p className="node-inspector-note">
                Camera angle is controlled in the preview: drag rotates, wheel zooms.
              </p>
              <InspectorSlider label="Spin" value={Math.round(layer.tiltZ)} min={-180} max={180} onChange={(value) => onChange({ tiltZ: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Depth" value={Math.round(layer.primitiveDepth)} min={10} max={100} onChange={(value) => onChange({ primitiveDepth: value } as Partial<SourceLayer>)} />
              <InspectorSelect
                label="Shading"
                value={layer.primitiveShading ?? 'smooth'}
                options={['smooth', 'flat']}
                onChange={(value) => onChange({ primitiveShading: value as 'smooth' | 'flat' } as Partial<SourceLayer>)}
              />
            </>
          )}
          {layer.kind === 'noise' && (
            <>
              <InspectorSelect
                label="Noise"
                value={layer.noiseType}
                options={['value', 'clouds', 'cells']}
                onChange={(value) => onChange({ noiseType: value as SourceLayer['noiseType'] } as Partial<SourceLayer>)}
              />
              <InspectorSlider label="Scale" value={Math.round(layer.noiseScale)} min={6} max={96} onChange={(value) => onChange({ noiseScale: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Detail" value={Math.round(layer.noiseDetail)} min={1} max={8} onChange={(value) => onChange({ noiseDetail: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Contrast" value={Math.round(layer.noiseContrast)} min={0} max={100} onChange={(value) => onChange({ noiseContrast: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Balance" value={Math.round(layer.noiseBalance)} min={0} max={95} onChange={(value) => onChange({ noiseBalance: value } as Partial<SourceLayer>)} />
            </>
          )}
          {layer.kind === 'array' && (
            <>
              <InspectorSelect
                label="Pattern"
                value={layer.arrayPattern}
                options={['line', 'grid', 'radial']}
                onChange={(value) => onChange({ arrayPattern: value as SourceLayer['arrayPattern'] } as Partial<SourceLayer>)}
              />
              <InspectorSelect
                label="Shape"
                value={layer.arrayShape}
                options={['disc', 'bar', 'diamond']}
                onChange={(value) => onChange({ arrayShape: value as SourceLayer['arrayShape'] } as Partial<SourceLayer>)}
              />
              <InspectorSlider label="Count" value={Math.round(layer.arrayCount)} min={2} max={18} onChange={(value) => onChange({ arrayCount: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Rows" value={Math.round(layer.arrayRows)} min={1} max={12} onChange={(value) => onChange({ arrayRows: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Gap" value={Math.round(layer.arrayGap)} min={12} max={96} onChange={(value) => onChange({ arrayGap: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Size" value={Math.round(layer.arraySize)} min={8} max={64} onChange={(value) => onChange({ arraySize: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Radius" value={Math.round(layer.arrayRadius)} min={16} max={180} onChange={(value) => onChange({ arrayRadius: value } as Partial<SourceLayer>)} />
              <InspectorSlider label="Jitter" value={Math.round(layer.arrayJitter)} min={0} max={36} onChange={(value) => onChange({ arrayJitter: value } as Partial<SourceLayer>)} />
            </>
          )}
        </InspectorSection>
        <InspectorSection
          title="Style"
          summary={`${layer.opacity}% · ${layer.blendMode}`}
          open={openSection === 'style'}
          onToggle={() => setOpenSection((current) => current === 'style' ? 'content' : 'style')}
        >
          <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value } as Partial<SourceLayer>)} />
          <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value } as Partial<SourceLayer>)} />
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
