import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ALL_EMOJIS,
  type AspectRatio,
  type CanvasDocument,
  type EffectLayer,
  type EffectPreset,
  type EmojiLayer,
  type FillLayer,
  FONT_NAMES,
  type ImageLayer,
  type Layer,
  type LayerKind,
  type SourceLayer,
  type TextLayer,
} from '../types/config';
import { randomLayerSection, zeroLayerSection } from '../utils/randomConfig';
import { EffectInfoPopup } from './EffectInfoPopup';
import { LayerPanel } from './LayerPanel';
import { BLEND_OPTIONS as BLEND_OPTION_VALUES, FIELD_RANGES } from './layer-controls/fieldDefs';

// Blend options shaped for ButtonGroup (sidebar keeps 'LUMA' label for brevity).
const BLEND_OPTIONS = BLEND_OPTION_VALUES.map((value) => ({
  value,
  label: value === 'luminosity' ? 'LUMA' : value.toUpperCase(),
}));

interface Props {
  doc: CanvasDocument;
  onDocChange: (doc: CanvasDocument) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onRemoveLayer: (id: string) => void;
  onReorderLayers: (layers: Layer[]) => void;
  onDuplicateLayer: (id: string) => void;
  mobileActionBar?: React.ReactNode;
  modeSwitcher?: React.ReactNode;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  effectKey?: string;
  onInfoEnter?: (key: string, rect: DOMRect) => void;
  onInfoLeave?: () => void;
}

function Slider({ label, value, min, max, step = 1, onChange, effectKey, onInfoEnter, onInfoLeave }: SliderProps) {
  const iconRef = useRef<HTMLButtonElement>(null);
  const display = step < 1 ? value.toFixed(2) : String(value);

  return (
    <div className="group flex flex-col gap-1.5">
      <div className="flex justify-between items-center text-dim text-[10px]">
        <span className="flex items-center gap-1 min-w-0">
          <span>{label}</span>
          {effectKey && onInfoEnter && (
            <button
              ref={iconRef}
              className="slider-info-btn"
              onMouseEnter={() => iconRef.current && onInfoEnter(effectKey, iconRef.current.getBoundingClientRect())}
              onMouseLeave={onInfoLeave}
              onFocus={() => iconRef.current && onInfoEnter(effectKey, iconRef.current.getBoundingClientRect())}
              onBlur={onInfoLeave}
              aria-label={`About ${label}`}
            >
              ⓘ
            </button>
          )}
        </span>
        <span className="text-text text-[10px] min-w-7 text-right">{display}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface ButtonGroupProps {
  label: string;
  options: Array<{ value: string; label: string; style?: React.CSSProperties }>;
  value: string;
  onChange: (v: string) => void;
}

function ButtonGroup({ label, options, value, onChange }: ButtonGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-dim text-[10px]">{label}</span>
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            className={`px-2 py-1 font-mono text-[10px] border cursor-pointer rounded-none transition-colors ${
              value === opt.value
                ? 'border-accent text-accent bg-accent-dim'
                : 'border-border text-dim hover:text-text hover:border-text'
            }`}
            style={opt.style}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
  onRand?: () => void;
  onReset?: () => void;
}

function Section({ title, children, defaultOpen = false, hidden = false, onRand, onReset }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (hidden) return null;
  return (
    <div className="border-b border-border">
      <div className="flex items-stretch w-full">
        <button
          className="flex-1 flex items-center justify-between min-h-11 px-3.5 bg-transparent border-none cursor-pointer text-accent font-mono text-[10px] tracking-[2.5px] uppercase font-semibold hover:bg-accent-dim"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>{title}</span>
          <span className="text-dim text-[10px]">{open ? '▾' : '▸'}</span>
        </button>
        {onReset && (
          <button
            className="px-3 min-h-11 text-dim text-[13px] hover:text-text hover:bg-accent-dim font-mono border-none border-l border-border bg-transparent cursor-pointer leading-none"
            onClick={onReset}
            title="Reset section to zero"
            aria-label={`Reset ${title} to zero`}
          >
            ○
          </button>
        )}
        {onRand && (
          <button
            className="px-3 min-h-11 text-dim text-[13px] hover:text-accent hover:bg-accent-dim font-mono border-none border-l border-border bg-transparent cursor-pointer leading-none"
            onClick={onRand}
            title="Randomize this section"
            aria-label={`Randomize ${title} section`}
          >
            ⟳
          </button>
        )}
      </div>
      {open && <div className="px-3.5 pt-2 pb-3.5 flex flex-col gap-2.5">{children}</div>}
    </div>
  );
}

function updateLayer<T extends Layer>(doc: CanvasDocument, id: string, patch: Partial<T>): CanvasDocument {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
  };
}

function updateGlobal(doc: CanvasDocument, patch: Partial<CanvasDocument['global']>): CanvasDocument {
  return { ...doc, global: { ...doc.global, ...patch } };
}

export function Sidebar({
  doc,
  onDocChange,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onRemoveLayer,
  onReorderLayers,
  onDuplicateLayer,
  mobileActionBar,
  modeSwitcher,
}: Props) {
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const [infoState, setInfoState] = useState<{ key: string; rect: DOMRect; sidebarRight: number } | null>(null);
  const [scaleLocked, setScaleLocked] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sidebarRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInfoEnter = (key: string, rect: DOMRect) => {
    clearTimeout(closeTimerRef.current);
    const sidebarRight = sidebarRef.current?.getBoundingClientRect().right ?? rect.right;
    setInfoState({ key, rect, sidebarRight });
  };

  const handleInfoLeave = () => {
    closeTimerRef.current = setTimeout(() => setInfoState(null), 150);
  };

  const ip = { onInfoEnter: handleInfoEnter, onInfoLeave: handleInfoLeave };

  const setGlobal = <K extends keyof CanvasDocument['global']>(key: K, value: CanvasDocument['global'][K]) => {
    onDocChange(updateGlobal(doc, { [key]: value }));
  };

  const applySelectedPatch = <T extends Layer>(patch: Partial<T>) => {
    if (!selectedLayer) return;
    onDocChange(updateLayer(doc, selectedLayer.id, patch));
  };

  const handleImageFile = (file: File) => {
    if (!selectedLayer || selectedLayer.kind !== 'image') return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src === 'string') applySelectedPatch<ImageLayer>({ src });
    };
    reader.readAsDataURL(file);
  };

  const randomizeSelectedSection = (section: string) => {
    if (!selectedLayer) return;
    const patch = randomLayerSection(selectedLayer as never, section) as Partial<Layer>;
    onDocChange(updateLayer(doc, selectedLayer.id, patch));
  };

  const resetSelectedSection = (section: string) => {
    if (!selectedLayer) return;
    const patch = zeroLayerSection(section) as Partial<Layer>;
    onDocChange(updateLayer(doc, selectedLayer.id, patch));
  };

  const toggleEmoji = (layer: EmojiLayer, emoji: string) => {
    if (layer.emojis.includes(emoji) && layer.emojis.length === 1) return;
    const emojis = layer.emojis.includes(emoji)
      ? layer.emojis.filter((item) => item !== emoji)
      : [...layer.emojis, emoji];
    applySelectedPatch<EmojiLayer>({ emojis });
  };

  const selectedEffectPreset = selectedLayer?.kind === 'effect' ? selectedLayer.preset : undefined;
  const showAllEffectSections = !selectedEffectPreset;
  const showEffectGroup = (presets: EffectPreset[]) =>
    showAllEffectSections || (selectedEffectPreset ? presets.includes(selectedEffectPreset) : false);
  const showEffectControl = (presets: EffectPreset[]) =>
    showAllEffectSections || (selectedEffectPreset ? presets.includes(selectedEffectPreset) : false);

  return (
    <aside className="sidebar" ref={sidebarRef}>
      {mobileActionBar && <div className="sidebar-mobile-bar">{mobileActionBar}</div>}
      {/* Canvas settings strip */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
        <span className="text-dim text-[9px] tracking-widest font-mono mr-1">CANVAS</span>
        {(['1:1', '4:5', '9:16', '16:9'] as AspectRatio[]).map((ratio) => (
          <button
            key={ratio}
            className={`text-[9px] font-mono px-1.5 py-0.5 border rounded-sm tracking-wide transition-colors ${
              (doc.global.aspect ?? '1:1') === ratio
                ? 'border-accent text-accent bg-accent-dim'
                : 'border-border text-dim hover:text-text'
            }`}
            onClick={() => setGlobal('aspect', ratio)}
          >
            {ratio}
          </button>
        ))}
      </div>
      {/* Top pane: layer list fills all available space */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <LayerPanel
          doc={doc}
          selectedLayerId={selectedLayerId}
          onSelectLayer={onSelectLayer}
          onAddLayer={onAddLayer}
          onAddEffectPreset={onAddEffectPreset}
          onRemoveLayer={onRemoveLayer}
          onReorderLayers={onReorderLayers}
          onToggleVisible={(id) =>
            onDocChange({
              ...doc,
              layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
            })
          }
          onDuplicateLayer={onDuplicateLayer}
          onRenameLayer={(id, name) =>
            onDocChange({ ...doc, layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, name } : layer)) })
          }
          modeSwitcher={modeSwitcher}
        />
      </div>

      {/* Bottom pane: selected layer controls, scrollable */}
      {selectedLayer && (
        <div className="sidebar-sections border-t border-border flex-shrink-0 max-h-[60%]">
          <Section title={`${selectedLayer.kind.toUpperCase()} LAYER`} defaultOpen>
            <input
              type="text"
              value={selectedLayer.name}
              onChange={(e) => applySelectedPatch({ name: e.target.value } as Partial<Layer>)}
              className="w-full bg-transparent border border-border text-text font-mono text-[11px] px-2 h-10 rounded-none outline-none focus:border-accent"
              aria-label="Layer name"
            />
            <div className="flex justify-between items-center text-dim text-[10px]">
              <span>Visible</span>
              <label className="toggle-switch" aria-label="Toggle layer visibility">
                <input
                  type="checkbox"
                  checked={selectedLayer.visible}
                  onChange={(e) => applySelectedPatch({ visible: e.target.checked } as Partial<Layer>)}
                />
                <span className="toggle-switch__track" />
              </label>
            </div>
            {selectedLayer.kind === 'effect' && (
              <div className="flex justify-between items-center text-dim text-[10px]">
                <span>Mask To Alpha</span>
                <label className="toggle-switch" aria-label="Toggle effect alpha masking">
                  <input
                    type="checkbox"
                    checked={selectedLayer.maskAlpha}
                    onChange={(e) => applySelectedPatch<EffectLayer>({ maskAlpha: e.target.checked })}
                  />
                  <span className="toggle-switch__track" />
                </label>
              </div>
            )}
          </Section>

          {selectedLayer.kind === 'emoji' && (
            <Section
              title="EMOJIS"
              defaultOpen
              onRand={() => randomizeSelectedSection('EMOJIS')}
              onReset={() => resetSelectedSection('EMOJIS')}
            >
              <div className="grid grid-cols-5 gap-1.5">
                {ALL_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`emoji-btn ${selectedLayer.emojis.includes(emoji) ? 'active' : ''}`}
                    onClick={() => toggleEmoji(selectedLayer, emoji)}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <Slider
                label="Density"
                value={selectedLayer.density}
                min={FIELD_RANGES.density.min}
                max={FIELD_RANGES.density.max}
                onChange={(v) => applySelectedPatch<EmojiLayer>({ density: v })}
                effectKey="density"
                {...ip}
              />
              <Slider
                label="Min Size"
                value={selectedLayer.minSz}
                min={FIELD_RANGES.minSz.min}
                max={FIELD_RANGES.minSz.max}
                onChange={(v) => applySelectedPatch<EmojiLayer>({ minSz: Math.min(v, selectedLayer.maxSz) })}
              />
              <Slider
                label="Max Size"
                value={selectedLayer.maxSz}
                min={FIELD_RANGES.maxSz.min}
                max={FIELD_RANGES.maxSz.max}
                onChange={(v) => applySelectedPatch<EmojiLayer>({ maxSz: Math.max(v, selectedLayer.minSz) })}
              />
              <Slider
                label="Blur"
                value={selectedLayer.blur}
                min={FIELD_RANGES.blur.min}
                max={FIELD_RANGES.blur.max}
                onChange={(v) => applySelectedPatch<EmojiLayer>({ blur: v })}
                effectKey="blur"
                {...ip}
              />
              <Slider
                label="Opacity"
                value={selectedLayer.opacity}
                min={FIELD_RANGES.opacity.min}
                max={FIELD_RANGES.opacity.max}
                onChange={(v) => applySelectedPatch<EmojiLayer>({ opacity: v })}
              />
              <ButtonGroup
                label="Blend"
                options={BLEND_OPTIONS}
                value={selectedLayer.blendMode}
                onChange={(v) => applySelectedPatch<EmojiLayer>({ blendMode: v })}
              />
            </Section>
          )}

          {selectedLayer.kind === 'text' && (
            <Section
              title="TEXT"
              defaultOpen
              onRand={() => randomizeSelectedSection('TEXT')}
              onReset={() => resetSelectedSection('TEXT')}
            >
              <textarea
                className="w-full bg-transparent border border-border text-text font-mono text-[11px] px-2 py-1.5 resize-none focus:outline-none focus:border-accent placeholder:text-dim"
                rows={3}
                placeholder="Album title, artist name…"
                value={selectedLayer.content}
                onChange={(e) => applySelectedPatch<TextLayer>({ content: e.target.value })}
              />
              <ButtonGroup
                label="Font"
                options={FONT_NAMES.map((font) => ({ value: font, label: font }))}
                value={selectedLayer.font}
                onChange={(v) => applySelectedPatch<TextLayer>({ font: v as TextLayer['font'] })}
              />
              <Slider
                label="Size"
                value={selectedLayer.size}
                min={FIELD_RANGES.size.min}
                max={FIELD_RANGES.size.max}
                onChange={(v) => applySelectedPatch<TextLayer>({ size: v })}
              />
              <div className="flex justify-between items-center text-dim text-[10px]">
                <span>Color</span>
                <input
                  type="color"
                  value={selectedLayer.color}
                  onChange={(e) => applySelectedPatch<TextLayer>({ color: e.target.value })}
                  className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                />
              </div>
              <Slider
                label="Opacity"
                value={selectedLayer.opacity}
                min={FIELD_RANGES.opacity.min}
                max={FIELD_RANGES.opacity.max}
                onChange={(v) => applySelectedPatch<TextLayer>({ opacity: v })}
              />
              <Slider
                label="Rotation"
                value={selectedLayer.rotation}
                min={FIELD_RANGES.rotation.min}
                max={FIELD_RANGES.rotation.max}
                onChange={(v) => applySelectedPatch<TextLayer>({ rotation: v })}
              />
              <Slider
                label="X Position"
                value={Math.round(selectedLayer.x * 100)}
                min={FIELD_RANGES.x.min}
                max={FIELD_RANGES.x.max}
                onChange={(v) => applySelectedPatch<TextLayer>({ x: v / 100 })}
              />
              <Slider
                label="Y Position"
                value={Math.round(selectedLayer.y * 100)}
                min={FIELD_RANGES.y.min}
                max={FIELD_RANGES.y.max}
                onChange={(v) => applySelectedPatch<TextLayer>({ y: v / 100 })}
              />
              <ButtonGroup
                label="Align"
                options={[
                  { value: 'left', label: '⬅ L' },
                  { value: 'center', label: '⬛ C' },
                  { value: 'right', label: 'R ➡' },
                ]}
                value={selectedLayer.align}
                onChange={(v) => applySelectedPatch<TextLayer>({ align: v as TextLayer['align'] })}
              />
              <ButtonGroup
                label="Blend"
                options={BLEND_OPTIONS}
                value={selectedLayer.blendMode}
                onChange={(v) => applySelectedPatch<TextLayer>({ blendMode: v })}
              />
            </Section>
          )}

          {selectedLayer.kind === 'image' && (
            <Section title="IMAGE" defaultOpen>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                  e.target.value = '';
                }}
              />
              {selectedLayer.src ? (
                <div className="flex flex-col gap-2">
                  <img
                    src={selectedLayer.src}
                    alt="Layer preview"
                    className="w-full aspect-square object-cover border border-border"
                  />
                  <div className="flex gap-2">
                    <button className="btn text-[10px] flex-1" onClick={() => fileInputRef.current?.click()}>
                      REPLACE
                    </button>
                    <button
                      className="btn text-[10px] flex-1"
                      onClick={() => applySelectedPatch<ImageLayer>({ src: '' })}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn w-full text-[10px]" onClick={() => fileInputRef.current?.click()}>
                  + IMAGE
                </button>
              )}
              <ButtonGroup
                label="Fit"
                options={[
                  { value: 'cover', label: 'COVER' },
                  { value: 'contain', label: 'CONTAIN' },
                  { value: 'tile', label: 'TILE' },
                  { value: 'free', label: 'FREE' },
                ]}
                value={selectedLayer.fit}
                onChange={(v) => applySelectedPatch<ImageLayer>({ fit: v as ImageLayer['fit'] })}
              />
              <Slider
                label="Opacity"
                value={selectedLayer.opacity}
                min={FIELD_RANGES.opacity.min}
                max={FIELD_RANGES.opacity.max}
                onChange={(v) => applySelectedPatch<ImageLayer>({ opacity: v })}
              />
              <ButtonGroup
                label="Blend"
                options={BLEND_OPTIONS}
                value={selectedLayer.blendMode}
                onChange={(v) => applySelectedPatch<ImageLayer>({ blendMode: v })}
              />
              <Slider
                label="X Position"
                value={Math.round(selectedLayer.x * 100)}
                min={FIELD_RANGES.x.min}
                max={FIELD_RANGES.x.max}
                onChange={(v) => applySelectedPatch<ImageLayer>({ x: v / 100 })}
              />
              <Slider
                label="Y Position"
                value={Math.round(selectedLayer.y * 100)}
                min={FIELD_RANGES.y.min}
                max={FIELD_RANGES.y.max}
                onChange={(v) => applySelectedPatch<ImageLayer>({ y: v / 100 })}
              />
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  {scaleLocked ? (
                    <Slider
                      label="Scale"
                      value={Math.round(selectedLayer.scaleX * 100)}
                      min={FIELD_RANGES.scaleX.min}
                      max={FIELD_RANGES.scaleX.max}
                      onChange={(v) => applySelectedPatch<ImageLayer>({ scaleX: v / 100, scaleY: v / 100 })}
                    />
                  ) : (
                    <>
                      <Slider
                        label="Scale X"
                        value={Math.round(selectedLayer.scaleX * 100)}
                        min={FIELD_RANGES.scaleX.min}
                        max={FIELD_RANGES.scaleX.max}
                        onChange={(v) => applySelectedPatch<ImageLayer>({ scaleX: v / 100 })}
                      />
                      <Slider
                        label="Scale Y"
                        value={Math.round(selectedLayer.scaleY * 100)}
                        min={FIELD_RANGES.scaleY.min}
                        max={FIELD_RANGES.scaleY.max}
                        onChange={(v) => applySelectedPatch<ImageLayer>({ scaleY: v / 100 })}
                      />
                    </>
                  )}
                </div>
                <button
                  className={`flex-shrink-0 w-11 h-11 flex items-center justify-center border text-[11px] bg-transparent cursor-pointer transition-colors ${
                    scaleLocked
                      ? 'border-accent text-accent'
                      : 'border-border text-dim hover:border-accent hover:text-accent'
                  }`}
                  onClick={() => setScaleLocked((v) => !v)}
                  title={scaleLocked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
                  aria-label={scaleLocked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
                  aria-pressed={scaleLocked}
                >
                  {scaleLocked ? '⛓' : '⛓‍💥'}
                </button>
              </div>
              <Slider
                label="Rotation"
                value={selectedLayer.rotation}
                min={FIELD_RANGES.rotation.min}
                max={FIELD_RANGES.rotation.max}
                onChange={(v) => applySelectedPatch<ImageLayer>({ rotation: v })}
              />
            </Section>
          )}

          {(selectedLayer.kind === 'primitive' || selectedLayer.kind === 'noise' || selectedLayer.kind === 'array') && (
            <>
              <Section title="SOURCE" defaultOpen>
                <div className="flex justify-between items-center text-dim text-[10px]">
                  <span>Ink</span>
                  <input
                    type="color"
                    value={selectedLayer.color}
                    onChange={(e) => applySelectedPatch<SourceLayer>({ color: e.target.value })}
                    className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex justify-between items-center text-dim text-[10px]">
                  <span>Accent</span>
                  <input
                    type="color"
                    value={selectedLayer.accentColor}
                    onChange={(e) => applySelectedPatch<SourceLayer>({ accentColor: e.target.value })}
                    className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                  />
                </div>
                <Slider
                  label="Opacity"
                  value={selectedLayer.opacity}
                  min={FIELD_RANGES.opacity.min}
                  max={FIELD_RANGES.opacity.max}
                  onChange={(v) => applySelectedPatch<SourceLayer>({ opacity: v })}
                />
                <ButtonGroup
                  label="Blend"
                  options={BLEND_OPTIONS}
                  value={selectedLayer.blendMode}
                  onChange={(v) => applySelectedPatch<SourceLayer>({ blendMode: v })}
                />
              </Section>

              {selectedLayer.kind !== 'primitive' && (
                <Section title="PLACEMENT" defaultOpen>
                  <Slider
                    label="X Position"
                    value={Math.round(selectedLayer.x * 100)}
                    min={FIELD_RANGES.x.min}
                    max={FIELD_RANGES.x.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ x: v / 100 })}
                  />
                  <Slider
                    label="Y Position"
                    value={Math.round(selectedLayer.y * 100)}
                    min={FIELD_RANGES.y.min}
                    max={FIELD_RANGES.y.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ y: v / 100 })}
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      {scaleLocked ? (
                        <Slider
                          label="Scale"
                          value={Math.round(selectedLayer.scaleX * 100)}
                          min={FIELD_RANGES.scaleX.min}
                          max={FIELD_RANGES.scaleX.max}
                          onChange={(v) => applySelectedPatch<SourceLayer>({ scaleX: v / 100, scaleY: v / 100 })}
                        />
                      ) : (
                        <>
                          <Slider
                            label="Scale X"
                            value={Math.round(selectedLayer.scaleX * 100)}
                            min={FIELD_RANGES.scaleX.min}
                            max={FIELD_RANGES.scaleX.max}
                            onChange={(v) => applySelectedPatch<SourceLayer>({ scaleX: v / 100 })}
                          />
                          <Slider
                            label="Scale Y"
                            value={Math.round(selectedLayer.scaleY * 100)}
                            min={FIELD_RANGES.scaleY.min}
                            max={FIELD_RANGES.scaleY.max}
                            onChange={(v) => applySelectedPatch<SourceLayer>({ scaleY: v / 100 })}
                          />
                        </>
                      )}
                    </div>
                    <button
                      className={`flex-shrink-0 w-11 h-11 flex items-center justify-center border text-[11px] bg-transparent cursor-pointer transition-colors ${
                        scaleLocked
                          ? 'border-accent text-accent'
                          : 'border-border text-dim hover:border-accent hover:text-accent'
                      }`}
                      onClick={() => setScaleLocked((v) => !v)}
                      title={scaleLocked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
                      aria-label={scaleLocked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
                      aria-pressed={scaleLocked}
                    >
                      {scaleLocked ? '⛓' : '⛓‍💥'}
                    </button>
                  </div>
                  <Slider
                    label="Rotation"
                    value={selectedLayer.rotation}
                    min={FIELD_RANGES.rotation.min}
                    max={FIELD_RANGES.rotation.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ rotation: v })}
                  />
                </Section>
              )}

              {selectedLayer.kind === 'primitive' && (
                <Section title="PRIMITIVE" defaultOpen>
                  <ButtonGroup
                    label="Shape"
                    options={[
                      { value: 'sphere', label: 'SPHERE' },
                      { value: 'cube', label: 'CUBE' },
                      { value: 'cylinder', label: 'CYLINDER' },
                    ]}
                    value={selectedLayer.primitiveShape}
                    onChange={(v) =>
                      applySelectedPatch<SourceLayer>({ primitiveShape: v as SourceLayer['primitiveShape'] })
                    }
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-dim">
                    Camera angle lives in the 3D preview. Drag rotates, wheel zooms.
                  </p>
                  <Slider
                    label="Spin"
                    value={selectedLayer.tiltZ}
                    min={FIELD_RANGES.tiltZ.min}
                    max={FIELD_RANGES.tiltZ.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ tiltZ: v })}
                  />
                  <Slider
                    label="Depth"
                    value={selectedLayer.primitiveDepth}
                    min={FIELD_RANGES.primitiveDepth.min}
                    max={FIELD_RANGES.primitiveDepth.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ primitiveDepth: v })}
                  />
                </Section>
              )}

              {selectedLayer.kind === 'noise' && (
                <Section title="NOISE" defaultOpen>
                  <ButtonGroup
                    label="Pattern"
                    options={[
                      { value: 'value', label: 'VALUE' },
                      { value: 'clouds', label: 'CLOUDS' },
                      { value: 'cells', label: 'CELLS' },
                    ]}
                    value={selectedLayer.noiseType}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ noiseType: v as SourceLayer['noiseType'] })}
                  />
                  <Slider
                    label="Scale"
                    value={selectedLayer.noiseScale}
                    min={FIELD_RANGES.noiseScale.min}
                    max={FIELD_RANGES.noiseScale.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ noiseScale: v })}
                  />
                  <Slider
                    label="Detail"
                    value={selectedLayer.noiseDetail}
                    min={FIELD_RANGES.noiseDetail.min}
                    max={FIELD_RANGES.noiseDetail.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ noiseDetail: v })}
                  />
                  <Slider
                    label="Contrast"
                    value={selectedLayer.noiseContrast}
                    min={FIELD_RANGES.noiseContrast.min}
                    max={FIELD_RANGES.noiseContrast.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ noiseContrast: v })}
                  />
                  <Slider
                    label="Balance"
                    value={selectedLayer.noiseBalance}
                    min={FIELD_RANGES.noiseBalance.min}
                    max={FIELD_RANGES.noiseBalance.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ noiseBalance: v })}
                  />
                </Section>
              )}

              {selectedLayer.kind === 'array' && (
                <Section title="ARRAY" defaultOpen>
                  <ButtonGroup
                    label="Pattern"
                    options={[
                      { value: 'line', label: 'LINE' },
                      { value: 'grid', label: 'GRID' },
                      { value: 'radial', label: 'RADIAL' },
                    ]}
                    value={selectedLayer.arrayPattern}
                    onChange={(v) =>
                      applySelectedPatch<SourceLayer>({ arrayPattern: v as SourceLayer['arrayPattern'] })
                    }
                  />
                  <ButtonGroup
                    label="Motif"
                    options={[
                      { value: 'disc', label: 'DISC' },
                      { value: 'bar', label: 'BAR' },
                      { value: 'diamond', label: 'DIAMOND' },
                    ]}
                    value={selectedLayer.arrayShape}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arrayShape: v as SourceLayer['arrayShape'] })}
                  />
                  <Slider
                    label="Count"
                    value={selectedLayer.arrayCount}
                    min={FIELD_RANGES.arrayCount.min}
                    max={FIELD_RANGES.arrayCount.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arrayCount: v })}
                  />
                  <Slider
                    label="Rows"
                    value={selectedLayer.arrayRows}
                    min={FIELD_RANGES.arrayRows.min}
                    max={FIELD_RANGES.arrayRows.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arrayRows: v })}
                  />
                  <Slider
                    label="Gap"
                    value={selectedLayer.arrayGap}
                    min={FIELD_RANGES.arrayGap.min}
                    max={FIELD_RANGES.arrayGap.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arrayGap: v })}
                  />
                  <Slider
                    label="Size"
                    value={selectedLayer.arraySize}
                    min={FIELD_RANGES.arraySize.min}
                    max={FIELD_RANGES.arraySize.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arraySize: v })}
                  />
                  <Slider
                    label="Radius"
                    value={selectedLayer.arrayRadius}
                    min={FIELD_RANGES.arrayRadius.min}
                    max={FIELD_RANGES.arrayRadius.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arrayRadius: v })}
                  />
                  <Slider
                    label="Jitter"
                    value={selectedLayer.arrayJitter}
                    min={FIELD_RANGES.arrayJitter.min}
                    max={FIELD_RANGES.arrayJitter.max}
                    onChange={(v) => applySelectedPatch<SourceLayer>({ arrayJitter: v })}
                  />
                </Section>
              )}
            </>
          )}

          {selectedLayer.kind === 'effect' && (
            <>
              <Section
                title="LIGHT RAYS"
                hidden={!showEffectGroup(['rays', 'bloom', 'filmBurn', 'neonGlow', 'fog', 'speedLines'])}
                onRand={() => randomizeSelectedSection('RAYS')}
                onReset={() => resetSelectedSection('RAYS')}
              >
                {showEffectControl(['rays']) && (
                  <>
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Ray Color</span>
                      <input
                        type="color"
                        value={selectedLayer.rayColor}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ rayColor: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                    <Slider
                      label="Intensity"
                      value={selectedLayer.rayInt}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ rayInt: v })}
                      effectKey="rayInt"
                      {...ip}
                    />
                    <Slider
                      label="Count"
                      value={selectedLayer.rays}
                      min={0}
                      max={32}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ rays: v })}
                      effectKey="rays"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['bloom']) && (
                  <Slider
                    label="Bloom"
                    value={selectedLayer.bloom}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ bloom: v })}
                    effectKey="bloom"
                    {...ip}
                  />
                )}
                {showEffectControl(['filmBurn']) && (
                  <Slider
                    label="Film Burn"
                    value={selectedLayer.filmBurn}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ filmBurn: v })}
                    effectKey="filmBurn"
                    {...ip}
                  />
                )}
                {showEffectControl(['neonGlow']) && (
                  <>
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Neon Color</span>
                      <input
                        type="color"
                        value={selectedLayer.neonColor}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ neonColor: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                    <Slider
                      label="Neon Glow"
                      value={selectedLayer.neonGlow}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ neonGlow: v })}
                      effectKey="neonGlow"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['fog']) && (
                  <>
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Fog Color</span>
                      <input
                        type="color"
                        value={selectedLayer.fogColor}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ fogColor: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                    <Slider
                      label="Fog"
                      value={selectedLayer.fog}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ fog: v })}
                      effectKey="fog"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['speedLines']) && (
                  <Slider
                    label="Speed Lines"
                    value={selectedLayer.speedLines}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ speedLines: v })}
                    effectKey="speedLines"
                    {...ip}
                  />
                )}
              </Section>
              <Section
                title="GLITCH"
                hidden={!showEffectGroup(['glitch', 'rgbSplit', 'ca', 'interlace', 'dataMosh', 'vhsTracking'])}
                onRand={() => randomizeSelectedSection('GLITCH')}
                onReset={() => resetSelectedSection('GLITCH')}
              >
                {showEffectControl(['glitch']) && (
                  <Slider
                    label="VHS Streaks"
                    value={selectedLayer.glitch}
                    min={0}
                    max={24}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ glitch: v })}
                    effectKey="glitch"
                    {...ip}
                  />
                )}
                {showEffectControl(['rgbSplit']) && (
                  <Slider
                    label="Chromatic"
                    value={selectedLayer.rgbSplit}
                    min={0}
                    max={15}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ rgbSplit: v })}
                    effectKey="rgbSplit"
                    {...ip}
                  />
                )}
                {showEffectControl(['ca']) && (
                  <Slider
                    label="Chrom. Ab."
                    value={selectedLayer.ca}
                    min={0}
                    max={30}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ ca: v })}
                    effectKey="ca"
                    {...ip}
                  />
                )}
                {showEffectControl(['interlace']) && (
                  <Slider
                    label="Interlace"
                    value={selectedLayer.interlace}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ interlace: v })}
                    effectKey="interlace"
                    {...ip}
                  />
                )}
                {showEffectControl(['dataMosh']) && (
                  <Slider
                    label="Data Mosh"
                    value={selectedLayer.dataMosh}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ dataMosh: v })}
                    effectKey="dataMosh"
                    {...ip}
                  />
                )}
                {showEffectControl(['vhsTracking']) && (
                  <Slider
                    label="VHS Tracking"
                    value={selectedLayer.vhsTracking}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ vhsTracking: v })}
                    effectKey="vhsTracking"
                    {...ip}
                  />
                )}
              </Section>
              <Section
                title="TEXTURE"
                hidden={!showEffectGroup(['grain', 'scanlines', 'blur', 'matte', 'dither', 'emboss', 'linocut'])}
                onRand={() => randomizeSelectedSection('TEXTURE')}
                onReset={() => resetSelectedSection('TEXTURE')}
              >
                {showEffectControl(['grain']) && (
                  <Slider
                    label="Grain"
                    value={selectedLayer.grain}
                    min={0}
                    max={70}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ grain: v })}
                    effectKey="grain"
                    {...ip}
                  />
                )}
                {showEffectControl(['scanlines']) && (
                  <Slider
                    label="Scanlines"
                    value={selectedLayer.scanlines}
                    min={0}
                    max={50}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ scanlines: v })}
                    effectKey="scanlines"
                    {...ip}
                  />
                )}
                {showEffectControl(['blur']) && (
                  <Slider
                    label="Blur"
                    value={selectedLayer.blurAmt}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ blurAmt: v })}
                    effectKey="blurAmt"
                    {...ip}
                  />
                )}
                {showEffectControl(['matte']) && (
                  <Slider
                    label="Matte"
                    value={selectedLayer.matte}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ matte: v })}
                    effectKey="matte"
                    {...ip}
                  />
                )}
                {showEffectControl(['dither']) && (
                  <Slider
                    label="Dither"
                    value={selectedLayer.dither}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ dither: v })}
                    effectKey="dither"
                    {...ip}
                  />
                )}
                {showEffectControl(['emboss']) && (
                  <Slider
                    label="Emboss"
                    value={selectedLayer.emboss}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ emboss: v })}
                    effectKey="emboss"
                    {...ip}
                  />
                )}
                {showEffectControl(['linocut']) && (
                  <Slider
                    label="Linocut"
                    value={selectedLayer.linocut}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ linocut: v })}
                    effectKey="linocut"
                    {...ip}
                  />
                )}
              </Section>
              <Section
                title="COLOR TINT"
                hidden={!!(selectedLayer.preset && selectedLayer.preset !== 'tint')}
                onRand={() => randomizeSelectedSection('TINT')}
                onReset={() => resetSelectedSection('TINT')}
              >
                <div className="flex justify-between items-center text-dim text-[10px]">
                  <span>Tint Color</span>
                  <input
                    type="color"
                    value={selectedLayer.tint}
                    onChange={(e) => applySelectedPatch<EffectLayer>({ tint: e.target.value })}
                    className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                  />
                </div>
                <Slider
                  label="Opacity"
                  value={selectedLayer.tintOp}
                  min={0}
                  max={80}
                  onChange={(v) => applySelectedPatch<EffectLayer>({ tintOp: v })}
                  effectKey="tintOp"
                  {...ip}
                />
              </Section>
              <Section
                title="WARP"
                hidden={
                  !showEffectGroup([
                    'noiseWarp',
                    'morph',
                    'vortex',
                    'barrel',
                    'tear',
                    'mirror',
                    'wave',
                    'zoomBlur',
                    'ripple',
                    'kaleidoscope',
                    'squeeze',
                  ])
                }
                onRand={() => randomizeSelectedSection('WARP')}
                onReset={() => resetSelectedSection('WARP')}
              >
                {showEffectControl(['noiseWarp']) && (
                  <Slider
                    label="Noise Warp"
                    value={selectedLayer.noiseWarp}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ noiseWarp: v })}
                    effectKey="noiseWarp"
                    {...ip}
                  />
                )}
                {showEffectControl(['morph']) && (
                  <>
                    <Slider
                      label="Liquid Morph"
                      value={selectedLayer.morphAmt}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ morphAmt: v })}
                      effectKey="morphAmt"
                      {...ip}
                    />
                    <Slider
                      label="Morph Freq"
                      value={selectedLayer.morphFreq}
                      min={1}
                      max={20}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ morphFreq: v })}
                      effectKey="morphFreq"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['vortex']) && (
                  <Slider
                    label="Vortex"
                    value={selectedLayer.vortex}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ vortex: v })}
                    effectKey="vortex"
                    {...ip}
                  />
                )}
                {showEffectControl(['barrel']) && (
                  <Slider
                    label="Barrel"
                    value={selectedLayer.barrel}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ barrel: v })}
                    effectKey="barrel"
                    {...ip}
                  />
                )}
                {showEffectControl(['tear']) && (
                  <>
                    <Slider
                      label="Chunk Tear"
                      value={selectedLayer.tearAmt}
                      min={0}
                      max={20}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ tearAmt: v })}
                      effectKey="tearAmt"
                      {...ip}
                    />
                    <Slider
                      label="Tear Size"
                      value={selectedLayer.tearSize}
                      min={1}
                      max={20}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ tearSize: v })}
                      effectKey="tearSize"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['mirror']) && (
                  <Slider
                    label="Mirror"
                    value={selectedLayer.mirror}
                    min={0}
                    max={3}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ mirror: v })}
                    effectKey="mirror"
                    {...ip}
                  />
                )}
                {showEffectControl(['wave']) && (
                  <>
                    <Slider
                      label="Wave"
                      value={selectedLayer.waveAmt}
                      min={0}
                      max={60}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ waveAmt: v })}
                      effectKey="waveAmt"
                      {...ip}
                    />
                    <Slider
                      label="Wave Freq"
                      value={selectedLayer.waveFreq}
                      min={1}
                      max={12}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ waveFreq: v })}
                      effectKey="waveFreq"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['zoomBlur']) && (
                  <Slider
                    label="Zoom Blur"
                    value={selectedLayer.zoomBlur}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ zoomBlur: v })}
                    effectKey="zoomBlur"
                    {...ip}
                  />
                )}
                {showEffectControl(['ripple']) && (
                  <>
                    <Slider
                      label="Ripple"
                      value={selectedLayer.rippleAmt}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ rippleAmt: v })}
                      effectKey="rippleAmt"
                      {...ip}
                    />
                    <Slider
                      label="Ripple Freq"
                      value={selectedLayer.rippleFreq}
                      min={1}
                      max={12}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ rippleFreq: v })}
                      effectKey="rippleFreq"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['kaleidoscope']) && (
                  <Slider
                    label="Kaleidoscope"
                    value={selectedLayer.kaleidoscope}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ kaleidoscope: v })}
                    effectKey="kaleidoscope"
                    {...ip}
                  />
                )}
                {showEffectControl(['squeeze']) && (
                  <>
                    <Slider
                      label="Squeeze X"
                      value={selectedLayer.squeezeX}
                      min={-80}
                      max={80}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ squeezeX: v })}
                      effectKey="squeezeX"
                      {...ip}
                    />
                    <Slider
                      label="Squeeze Y"
                      value={selectedLayer.squeezeY}
                      min={-80}
                      max={80}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ squeezeY: v })}
                      effectKey="squeezeY"
                      {...ip}
                    />
                  </>
                )}
              </Section>
              <Section
                title="COLOR"
                hidden={
                  !showEffectGroup([
                    'hueShift',
                    'rgbSplit',
                    'vignette',
                    'pixelate',
                    'posterize',
                    'threshold',
                    'edgeDetect',
                    'gradientOverlay',
                    'sepia',
                    'infrared',
                    'solarize',
                    'bleachBypass',
                    'cyanotype',
                    'splitTone',
                  ])
                }
                onRand={() => randomizeSelectedSection('COLORFX')}
                onReset={() => resetSelectedSection('COLORFX')}
              >
                {showEffectControl(['hueShift']) && (
                  <Slider
                    label="Hue Shift"
                    value={selectedLayer.hueShift}
                    min={0}
                    max={360}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ hueShift: v })}
                    effectKey="hueShift"
                    {...ip}
                  />
                )}
                {showEffectControl(['rgbSplit']) && (
                  <Slider
                    label="RGB Split"
                    value={selectedLayer.rgbSplit}
                    min={0}
                    max={30}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ rgbSplit: v })}
                    effectKey="rgbSplit"
                    {...ip}
                  />
                )}
                {showEffectControl(['vignette']) && (
                  <Slider
                    label="Vignette"
                    value={selectedLayer.vignette}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ vignette: v })}
                    effectKey="vignette"
                    {...ip}
                  />
                )}
                {showEffectControl(['pixelate']) && (
                  <Slider
                    label="Pixelate"
                    value={selectedLayer.pixelate}
                    min={0}
                    max={20}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ pixelate: v })}
                    effectKey="pixelate"
                    {...ip}
                  />
                )}
                {showEffectControl(['posterize']) && (
                  <Slider
                    label="Posterize"
                    value={selectedLayer.posterize}
                    min={0}
                    max={16}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ posterize: v })}
                    effectKey="posterize"
                    {...ip}
                  />
                )}
                {showEffectControl(['threshold']) && (
                  <Slider
                    label="Threshold"
                    value={selectedLayer.threshold}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ threshold: v })}
                    effectKey="threshold"
                    {...ip}
                  />
                )}
                {showEffectControl(['edgeDetect']) && (
                  <Slider
                    label="Edge Detect"
                    value={selectedLayer.edgeDetect}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ edgeDetect: v })}
                    effectKey="edgeDetect"
                    {...ip}
                  />
                )}
                {showEffectControl(['sepia']) && (
                  <Slider
                    label="Sepia"
                    value={selectedLayer.sepia}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ sepia: v })}
                    effectKey="sepia"
                    {...ip}
                  />
                )}
                {showEffectControl(['infrared']) && (
                  <Slider
                    label="Infrared"
                    value={selectedLayer.infrared}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ infrared: v })}
                    effectKey="infrared"
                    {...ip}
                  />
                )}
                {showEffectControl(['solarize']) && (
                  <Slider
                    label="Solarize"
                    value={selectedLayer.solarize}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ solarize: v })}
                    effectKey="solarize"
                    {...ip}
                  />
                )}
                {showEffectControl(['bleachBypass']) && (
                  <Slider
                    label="Bleach Bypass"
                    value={selectedLayer.bleachBypass}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ bleachBypass: v })}
                    effectKey="bleachBypass"
                    {...ip}
                  />
                )}
                {showEffectControl(['cyanotype']) && (
                  <Slider
                    label="Cyanotype"
                    value={selectedLayer.cyanotype}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ cyanotype: v })}
                    effectKey="cyanotype"
                    {...ip}
                  />
                )}
                {showEffectControl(['splitTone']) && (
                  <>
                    <Slider
                      label="Split Tone"
                      value={selectedLayer.splitToneAmt}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ splitToneAmt: v })}
                      effectKey="splitToneAmt"
                      {...ip}
                    />
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Shadow Color</span>
                      <input
                        type="color"
                        value={selectedLayer.splitShadow}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ splitShadow: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Highlight Color</span>
                      <input
                        type="color"
                        value={selectedLayer.splitHighlight}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ splitHighlight: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                  </>
                )}
                {showEffectControl(['gradientOverlay']) && (
                  <>
                    <Slider
                      label="Gradient Mix"
                      value={selectedLayer.gradMix}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ gradMix: v })}
                      effectKey="gradMix"
                      {...ip}
                    />
                    <Slider
                      label="Gradient Angle"
                      value={selectedLayer.gradAngle}
                      min={0}
                      max={360}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ gradAngle: v })}
                      effectKey="gradAngle"
                      {...ip}
                    />
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Color A</span>
                      <input
                        type="color"
                        value={selectedLayer.gradA}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ gradA: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Color B</span>
                      <input
                        type="color"
                        value={selectedLayer.gradB}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ gradB: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                  </>
                )}
              </Section>
              <Section
                title="RISO"
                hidden={!showEffectGroup(['duotone', 'halftone', 'risoShift', 'overprint'])}
                onRand={() => randomizeSelectedSection('RISO')}
                onReset={() => resetSelectedSection('RISO')}
              >
                {showEffectControl(['duotone']) && (
                  <>
                    <Slider
                      label="Duotone"
                      value={selectedLayer.duotone}
                      min={0}
                      max={100}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ duotone: v })}
                      effectKey="duotone"
                      {...ip}
                    />
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Shadow Color</span>
                      <input
                        type="color"
                        value={selectedLayer.duoA}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ duoA: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                    <div className="flex justify-between items-center text-dim text-[10px]">
                      <span>Light Color</span>
                      <input
                        type="color"
                        value={selectedLayer.duoB}
                        onChange={(e) => applySelectedPatch<EffectLayer>({ duoB: e.target.value })}
                        className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                      />
                    </div>
                  </>
                )}
                {showEffectControl(['halftone']) && (
                  <Slider
                    label="Halftone"
                    value={selectedLayer.halftone}
                    min={0}
                    max={30}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ halftone: v })}
                    effectKey="halftone"
                    {...ip}
                  />
                )}
                {showEffectControl(['risoShift']) && (
                  <>
                    <Slider
                      label="Misreg Shift"
                      value={selectedLayer.risoShift}
                      min={0}
                      max={40}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ risoShift: v })}
                      effectKey="risoShift"
                      {...ip}
                    />
                    <Slider
                      label="Misreg Angle"
                      value={selectedLayer.risoAngle}
                      min={0}
                      max={360}
                      onChange={(v) => applySelectedPatch<EffectLayer>({ risoAngle: v })}
                      effectKey="risoAngle"
                      {...ip}
                    />
                  </>
                )}
                {showEffectControl(['overprint']) && (
                  <Slider
                    label="Overprint"
                    value={selectedLayer.overprint}
                    min={0}
                    max={100}
                    onChange={(v) => applySelectedPatch<EffectLayer>({ overprint: v })}
                    effectKey="overprint"
                    {...ip}
                  />
                )}
              </Section>
            </>
          )}

          {selectedLayer?.kind === 'fill' && (
            <Section title="FILL" defaultOpen>
              <div className="flex justify-between items-center text-dim text-[10px]">
                <span>Color</span>
                <input
                  type="color"
                  value={(selectedLayer as FillLayer).color}
                  onChange={(e) => applySelectedPatch<FillLayer>({ color: e.target.value })}
                  className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
                />
              </div>
              <Slider
                label="Opacity"
                value={(selectedLayer as FillLayer).opacity}
                min={FIELD_RANGES.opacity.min}
                max={FIELD_RANGES.opacity.max}
                onChange={(v) => applySelectedPatch<FillLayer>({ opacity: v })}
              />
              <ButtonGroup
                label="Blend"
                options={BLEND_OPTIONS}
                value={(selectedLayer as FillLayer).blendMode}
                onChange={(v) => applySelectedPatch<FillLayer>({ blendMode: v })}
              />
            </Section>
          )}
        </div>
      )}

      {infoState &&
        createPortal(
          <EffectInfoPopup
            effectKey={infoState.key}
            anchorRect={infoState.rect}
            sidebarRight={infoState.sidebarRight}
            onMouseEnter={() => clearTimeout(closeTimerRef.current)}
            onMouseLeave={handleInfoLeave}
          />,
          document.body,
        )}
    </aside>
  );
}
