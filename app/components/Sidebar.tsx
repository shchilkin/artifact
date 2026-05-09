import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import {
  ALL_EMOJIS,
  FONT_NAMES,
  type AspectRatio,
  type CanvasDocument,
  type EffectLayer,
  type EffectPreset,
  type EmojiLayer,
  type FillLayer,
  type ImageLayer,
  type Layer,
  type LayerKind,
  type TextLayer,
} from '../types/config';
import { randomLayerSection, zeroLayerSection } from '../utils/randomConfig';
import { EffectInfoPopup } from './EffectInfoPopup';
import { LayerPanel } from './LayerPanel';

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
              value === opt.value ? 'border-accent text-accent bg-accent-dim' : 'border-border text-dim hover:text-text hover:border-text'
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

const BLEND_OPTIONS = [
  { value: 'normal', label: 'NORMAL' },
  { value: 'multiply', label: 'MULTIPLY' },
  { value: 'screen', label: 'SCREEN' },
  { value: 'overlay', label: 'OVERLAY' },
  { value: 'luminosity', label: 'LUMA' },
];

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
    const emojis = layer.emojis.includes(emoji) ? layer.emojis.filter((item) => item !== emoji) : [...layer.emojis, emoji];
    applySelectedPatch<EmojiLayer>({ emojis });
  };

  const selectedEffectPreset = selectedLayer?.kind === 'effect' ? selectedLayer.preset : undefined;
  const showAllEffectSections = !selectedEffectPreset;
  const showEffectGroup = (presets: EffectPreset[]) => showAllEffectSections || (selectedEffectPreset ? presets.includes(selectedEffectPreset) : false);
  const showEffectControl = (presets: EffectPreset[]) => showAllEffectSections || (selectedEffectPreset ? presets.includes(selectedEffectPreset) : false);

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
          onToggleVisible={(id) => onDocChange({ ...doc, layers: doc.layers.map((layer) => layer.id === id ? { ...layer, visible: !layer.visible } : layer) })}
          onDuplicateLayer={onDuplicateLayer}
          onRenameLayer={(id, name) => onDocChange({ ...doc, layers: doc.layers.map((layer) => layer.id === id ? { ...layer, name } : layer) })}
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
              <Section title="EMOJIS" defaultOpen onRand={() => randomizeSelectedSection('EMOJIS')} onReset={() => resetSelectedSection('EMOJIS')}>
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
                <Slider label="Density" value={selectedLayer.density} min={0} max={80} onChange={(v) => applySelectedPatch<EmojiLayer>({ density: v })} effectKey="density" {...ip} />
                <Slider label="Min Size" value={selectedLayer.minSz} min={10} max={60} onChange={(v) => applySelectedPatch<EmojiLayer>({ minSz: Math.min(v, selectedLayer.maxSz) })} />
                <Slider label="Max Size" value={selectedLayer.maxSz} min={40} max={130} onChange={(v) => applySelectedPatch<EmojiLayer>({ maxSz: Math.max(v, selectedLayer.minSz) })} />
                <Slider label="Blur" value={selectedLayer.blur} min={0} max={100} onChange={(v) => applySelectedPatch<EmojiLayer>({ blur: v })} effectKey="blur" {...ip} />
                <Slider label="Opacity" value={selectedLayer.opacity} min={0} max={100} onChange={(v) => applySelectedPatch<EmojiLayer>({ opacity: v })} />
                <ButtonGroup label="Blend" options={BLEND_OPTIONS} value={selectedLayer.blendMode} onChange={(v) => applySelectedPatch<EmojiLayer>({ blendMode: v })} />
              </Section>
            )}

            {selectedLayer.kind === 'text' && (
              <Section title="TEXT" defaultOpen onRand={() => randomizeSelectedSection('TEXT')} onReset={() => resetSelectedSection('TEXT')}>
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
                <Slider label="Size" value={selectedLayer.size} min={8} max={120} onChange={(v) => applySelectedPatch<TextLayer>({ size: v })} />
                <div className="flex justify-between items-center text-dim text-[10px]">
                  <span>Color</span>
                  <input type="color" value={selectedLayer.color} onChange={(e) => applySelectedPatch<TextLayer>({ color: e.target.value })} className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer" />
                </div>
                <Slider label="Opacity" value={selectedLayer.opacity} min={0} max={100} onChange={(v) => applySelectedPatch<TextLayer>({ opacity: v })} />
                <Slider label="Rotation" value={selectedLayer.rotation} min={-180} max={180} onChange={(v) => applySelectedPatch<TextLayer>({ rotation: v })} />
                <Slider label="X Position" value={Math.round(selectedLayer.x * 100)} min={0} max={100} onChange={(v) => applySelectedPatch<TextLayer>({ x: v / 100 })} />
                <Slider label="Y Position" value={Math.round(selectedLayer.y * 100)} min={0} max={100} onChange={(v) => applySelectedPatch<TextLayer>({ y: v / 100 })} />
                <ButtonGroup
                  label="Align"
                  options={[{ value: 'left', label: '⬅ L' }, { value: 'center', label: '⬛ C' }, { value: 'right', label: 'R ➡' }]}
                  value={selectedLayer.align}
                  onChange={(v) => applySelectedPatch<TextLayer>({ align: v as TextLayer['align'] })}
                />
                <ButtonGroup label="Blend" options={BLEND_OPTIONS} value={selectedLayer.blendMode} onChange={(v) => applySelectedPatch<TextLayer>({ blendMode: v })} />
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
                    <img src={selectedLayer.src} alt="Layer preview" className="w-full aspect-square object-cover border border-border" />
                    <div className="flex gap-2">
                      <button className="btn text-[10px] flex-1" onClick={() => fileInputRef.current?.click()}>REPLACE</button>
                      <button className="btn text-[10px] flex-1" onClick={() => applySelectedPatch<ImageLayer>({ src: '' })}>REMOVE</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn w-full text-[10px]" onClick={() => fileInputRef.current?.click()}>+ IMAGE</button>
                )}
                <ButtonGroup
                  label="Fit"
                  options={[{ value: 'cover', label: 'COVER' }, { value: 'contain', label: 'CONTAIN' }, { value: 'tile', label: 'TILE' }, { value: 'free', label: 'FREE' }]}
                  value={selectedLayer.fit}
                  onChange={(v) => applySelectedPatch<ImageLayer>({ fit: v as ImageLayer['fit'] })}
                />
                <Slider label="Opacity" value={selectedLayer.opacity} min={0} max={100} onChange={(v) => applySelectedPatch<ImageLayer>({ opacity: v })} />
                <ButtonGroup label="Blend" options={BLEND_OPTIONS} value={selectedLayer.blendMode} onChange={(v) => applySelectedPatch<ImageLayer>({ blendMode: v })} />
                <Slider label="X Position" value={Math.round(selectedLayer.x * 100)} min={-50} max={150} onChange={(v) => applySelectedPatch<ImageLayer>({ x: v / 100 })} />
                <Slider label="Y Position" value={Math.round(selectedLayer.y * 100)} min={-50} max={150} onChange={(v) => applySelectedPatch<ImageLayer>({ y: v / 100 })} />
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    {scaleLocked ? (
                      <Slider
                        label="Scale"
                        value={Math.round(selectedLayer.scaleX * 100)}
                        min={5}
                        max={500}
                        onChange={(v) => applySelectedPatch<ImageLayer>({ scaleX: v / 100, scaleY: v / 100 })}
                      />
                    ) : (
                      <>
                        <Slider label="Scale X" value={Math.round(selectedLayer.scaleX * 100)} min={5} max={500} onChange={(v) => applySelectedPatch<ImageLayer>({ scaleX: v / 100 })} />
                        <Slider label="Scale Y" value={Math.round(selectedLayer.scaleY * 100)} min={5} max={500} onChange={(v) => applySelectedPatch<ImageLayer>({ scaleY: v / 100 })} />
                      </>
                    )}
                  </div>
                  <button
                    className={`flex-shrink-0 w-11 h-11 flex items-center justify-center border text-[11px] bg-transparent cursor-pointer transition-colors ${
                      scaleLocked ? 'border-accent text-accent' : 'border-border text-dim hover:border-accent hover:text-accent'
                    }`}
                    onClick={() => setScaleLocked((v) => !v)}
                    title={scaleLocked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
                    aria-label={scaleLocked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
                    aria-pressed={scaleLocked}
                  >
                    {scaleLocked ? '⛓' : '⛓‍💥'}
                  </button>
                </div>
                <Slider label="Rotation" value={selectedLayer.rotation} min={-180} max={180} onChange={(v) => applySelectedPatch<ImageLayer>({ rotation: v })} />
              </Section>
            )}

            {selectedLayer.kind === 'effect' && (
              <>
                <Section title="LIGHT RAYS" hidden={!showEffectGroup(['rays', 'bloom', 'filmBurn'])} onRand={() => randomizeSelectedSection('RAYS')} onReset={() => resetSelectedSection('RAYS')}>
                  {showEffectControl(['rays']) && (
                    <>
                      <div className="flex justify-between items-center text-dim text-[10px]"><span>Ray Color</span><input type="color" value={selectedLayer.rayColor} onChange={(e) => applySelectedPatch<EffectLayer>({ rayColor: e.target.value })} className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer" /></div>
                      <Slider label="Intensity" value={selectedLayer.rayInt} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ rayInt: v })} effectKey="rayInt" {...ip} />
                      <Slider label="Count" value={selectedLayer.rays} min={0} max={32} onChange={(v) => applySelectedPatch<EffectLayer>({ rays: v })} effectKey="rays" {...ip} />
                    </>
                  )}
                  {showEffectControl(['bloom']) && <Slider label="Bloom" value={selectedLayer.bloom} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ bloom: v })} effectKey="bloom" {...ip} />}
                  {showEffectControl(['filmBurn']) && <Slider label="Film Burn" value={selectedLayer.filmBurn} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ filmBurn: v })} effectKey="filmBurn" {...ip} />}
                </Section>
                <Section title="GLITCH" hidden={!showEffectGroup(['glitch', 'ca', 'interlace', 'dataMosh'])} onRand={() => randomizeSelectedSection('GLITCH')} onReset={() => resetSelectedSection('GLITCH')}>
                  {showEffectControl(['glitch']) && <Slider label="VHS Streaks" value={selectedLayer.glitch} min={0} max={24} onChange={(v) => applySelectedPatch<EffectLayer>({ glitch: v })} effectKey="glitch" {...ip} />}
                  {showEffectControl(['ca']) && <Slider label="Chromatic" value={selectedLayer.ca} min={0} max={15} onChange={(v) => applySelectedPatch<EffectLayer>({ ca: v })} effectKey="ca" {...ip} />}
                  {showEffectControl(['interlace']) && <Slider label="Interlace" value={selectedLayer.interlace} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ interlace: v })} effectKey="interlace" {...ip} />}
                  {showEffectControl(['dataMosh']) && <Slider label="Data Mosh" value={selectedLayer.dataMosh} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ dataMosh: v })} effectKey="dataMosh" {...ip} />}
                </Section>
                <Section title="TEXTURE" hidden={!showEffectGroup(['grain', 'scanlines'])} onRand={() => randomizeSelectedSection('TEXTURE')} onReset={() => resetSelectedSection('TEXTURE')}>
                  {showEffectControl(['grain']) && <Slider label="Grain" value={selectedLayer.grain} min={0} max={70} onChange={(v) => applySelectedPatch<EffectLayer>({ grain: v })} effectKey="grain" {...ip} />}
                  {showEffectControl(['scanlines']) && <Slider label="Scanlines" value={selectedLayer.scanlines} min={0} max={50} onChange={(v) => applySelectedPatch<EffectLayer>({ scanlines: v })} effectKey="scanlines" {...ip} />}
                </Section>
                <Section title="COLOR TINT" hidden={!!(selectedLayer.preset && selectedLayer.preset !== 'tint')} onRand={() => randomizeSelectedSection('TINT')} onReset={() => resetSelectedSection('TINT')}>
                  <div className="flex justify-between items-center text-dim text-[10px]"><span>Tint Color</span><input type="color" value={selectedLayer.tint} onChange={(e) => applySelectedPatch<EffectLayer>({ tint: e.target.value })} className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer" /></div>
                  <Slider label="Opacity" value={selectedLayer.tintOp} min={0} max={80} onChange={(v) => applySelectedPatch<EffectLayer>({ tintOp: v })} effectKey="tintOp" {...ip} />
                </Section>
                <Section title="WARP" hidden={!showEffectGroup(['noiseWarp', 'morph', 'vortex', 'barrel', 'tear', 'mirror', 'warp'])} onRand={() => randomizeSelectedSection('WARP')} onReset={() => resetSelectedSection('WARP')}>
                  {showEffectControl(['noiseWarp']) && <Slider label="Noise Warp" value={selectedLayer.noiseWarp} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ noiseWarp: v })} effectKey="noiseWarp" {...ip} />}
                  {showEffectControl(['morph', 'warp']) && (
                    <>
                      <Slider label="Liquid Morph" value={selectedLayer.morphAmt} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ morphAmt: v })} effectKey="morphAmt" {...ip} />
                      <Slider label="Morph Freq" value={selectedLayer.morphFreq} min={1} max={20} onChange={(v) => applySelectedPatch<EffectLayer>({ morphFreq: v })} effectKey="morphFreq" {...ip} />
                    </>
                  )}
                  {showEffectControl(['vortex', 'warp']) && <Slider label="Vortex" value={selectedLayer.vortex} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ vortex: v })} effectKey="vortex" {...ip} />}
                  {showEffectControl(['barrel', 'warp']) && <Slider label="Barrel" value={selectedLayer.barrel} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ barrel: v })} effectKey="barrel" {...ip} />}
                  {showEffectControl(['tear', 'warp']) && (
                    <>
                      <Slider label="Chunk Tear" value={selectedLayer.tearAmt} min={0} max={20} onChange={(v) => applySelectedPatch<EffectLayer>({ tearAmt: v })} effectKey="tearAmt" {...ip} />
                      <Slider label="Tear Size" value={selectedLayer.tearSize} min={1} max={20} onChange={(v) => applySelectedPatch<EffectLayer>({ tearSize: v })} effectKey="tearSize" {...ip} />
                    </>
                  )}
                  {showEffectControl(['mirror', 'warp']) && <Slider label="Mirror" value={selectedLayer.mirror} min={0} max={3} onChange={(v) => applySelectedPatch<EffectLayer>({ mirror: v })} effectKey="mirror" {...ip} />}
                </Section>
                <Section title="COLOR FX" hidden={!showEffectGroup(['hueShift', 'rgbSplit', 'vignette', 'pixelate', 'posterize', 'color'])} onRand={() => randomizeSelectedSection('COLORFX')} onReset={() => resetSelectedSection('COLORFX')}>
                  {showEffectControl(['hueShift', 'color']) && <Slider label="Hue Shift" value={selectedLayer.hueShift} min={0} max={360} onChange={(v) => applySelectedPatch<EffectLayer>({ hueShift: v })} effectKey="hueShift" {...ip} />}
                  {showEffectControl(['rgbSplit']) && <Slider label="RGB Split" value={selectedLayer.rgbSplit} min={0} max={30} onChange={(v) => applySelectedPatch<EffectLayer>({ rgbSplit: v })} effectKey="rgbSplit" {...ip} />}
                  {showEffectControl(['vignette']) && <Slider label="Vignette" value={selectedLayer.vignette} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ vignette: v })} effectKey="vignette" {...ip} />}
                  {showEffectControl(['pixelate']) && <Slider label="Pixelate" value={selectedLayer.pixelate} min={0} max={20} onChange={(v) => applySelectedPatch<EffectLayer>({ pixelate: v })} effectKey="pixelate" {...ip} />}
                  {showEffectControl(['posterize', 'color']) && <Slider label="Posterize" value={selectedLayer.posterize} min={0} max={16} onChange={(v) => applySelectedPatch<EffectLayer>({ posterize: v })} effectKey="posterize" {...ip} />}
                </Section>
                <Section title="RISO" hidden={!showEffectGroup(['duotone', 'halftone', 'risoShift', 'riso'])} onRand={() => randomizeSelectedSection('RISO')} onReset={() => resetSelectedSection('RISO')}>
                  {showEffectControl(['duotone', 'riso']) && (
                    <>
                      <Slider label="Duotone" value={selectedLayer.duotone} min={0} max={100} onChange={(v) => applySelectedPatch<EffectLayer>({ duotone: v })} effectKey="duotone" {...ip} />
                      <div className="flex justify-between items-center text-dim text-[10px]"><span>Shadow Color</span><input type="color" value={selectedLayer.duoA} onChange={(e) => applySelectedPatch<EffectLayer>({ duoA: e.target.value })} className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer" /></div>
                      <div className="flex justify-between items-center text-dim text-[10px]"><span>Light Color</span><input type="color" value={selectedLayer.duoB} onChange={(e) => applySelectedPatch<EffectLayer>({ duoB: e.target.value })} className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer" /></div>
                    </>
                  )}
                  {showEffectControl(['halftone', 'riso']) && <Slider label="Halftone" value={selectedLayer.halftone} min={0} max={30} onChange={(v) => applySelectedPatch<EffectLayer>({ halftone: v })} effectKey="halftone" {...ip} />}
                  {showEffectControl(['risoShift', 'riso']) && (
                    <>
                      <Slider label="Misreg Shift" value={selectedLayer.risoShift} min={0} max={40} onChange={(v) => applySelectedPatch<EffectLayer>({ risoShift: v })} effectKey="risoShift" {...ip} />
                      <Slider label="Misreg Angle" value={selectedLayer.risoAngle} min={0} max={360} onChange={(v) => applySelectedPatch<EffectLayer>({ risoAngle: v })} effectKey="risoAngle" {...ip} />
                    </>
                  )}
                </Section>
              </>
            )}

            {selectedLayer?.kind === 'fill' && (
              <Section title="FILL" defaultOpen>
                <div className="flex justify-between items-center text-dim text-[10px]">
                  <span>Color</span>
                  <input type="color" value={(selectedLayer as FillLayer).color} onChange={(e) => applySelectedPatch<FillLayer>({ color: e.target.value })} className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer" />
                </div>
                <Slider label="Opacity" value={(selectedLayer as FillLayer).opacity} min={0} max={100} onChange={(v) => applySelectedPatch<FillLayer>({ opacity: v })} />
                <ButtonGroup label="Blend" options={BLEND_OPTIONS} value={(selectedLayer as FillLayer).blendMode} onChange={(v) => applySelectedPatch<FillLayer>({ blendMode: v })} />
              </Section>
            )}
          </div>
        )}

      {infoState && createPortal(
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
