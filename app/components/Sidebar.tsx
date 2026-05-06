import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_EMOJIS, type GeneratorConfig } from "../types/config";
import { EffectInfoPopup } from "./EffectInfoPopup";

interface Props {
  cfg: GeneratorConfig;
  onChange: (cfg: GeneratorConfig) => void;
  bgImageUrl: string | null;
  bgImageError: string | null;
  onBgImageChange: (url: string | null) => void;
  onImageFile: (file: File) => void;
  onSectionRand: (section: string) => void;
  onSectionReset: (section: string) => void;
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

function Slider(
  { label, value, min, max, step = 1, onChange, effectKey, onInfoEnter, onInfoLeave }:
    SliderProps,
) {
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
              onMouseEnter={() =>
                iconRef.current &&
                onInfoEnter(effectKey, iconRef.current.getBoundingClientRect())}
              onMouseLeave={onInfoLeave}
              aria-label={`About ${label}`}
              tabIndex={-1}
            >
              ⓘ
            </button>
          )}
        </span>
        <span className="text-text text-[10px] min-w-7 text-right">
          {display}
        </span>
      </div>
      <input
        type="range"
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
                ? "border-accent text-accent bg-accent-dim"
                : "border-border text-dim hover:text-text hover:border-text"
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
  onRand?: () => void;
  onReset?: () => void;
}

function Section({ title, children, defaultOpen = false, onRand, onReset }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <div className="flex items-stretch w-full">
        <button
          className="flex-1 flex items-center justify-between min-h-11 px-3.5 bg-transparent border-none cursor-pointer text-accent font-mono text-[10px] tracking-[2.5px] uppercase font-semibold hover:bg-accent-dim"
          onClick={() => setOpen(!open)}
        >
          <span>{title}</span>
          <span className="text-dim text-[10px]">{open ? "▾" : "▸"}</span>
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
      {open && (
        <div className="px-3.5 pt-2 pb-3.5 flex flex-col gap-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ cfg, onChange, bgImageUrl, bgImageError, onBgImageChange, onImageFile, onSectionRand, onSectionReset, mobileActionBar }: Props) {
  const set = <K extends keyof GeneratorConfig>(
    key: K,
    value: GeneratorConfig[K],
  ) => {
    onChange({ ...cfg, [key]: value });
  };

  const toggleEmoji = (emoji: string) => {
    if (cfg.emojis.includes(emoji) && cfg.emojis.length === 1) return;
    const next = cfg.emojis.includes(emoji)
      ? cfg.emojis.filter((e) => e !== emoji)
      : [...cfg.emojis, emoji];
    set("emojis", next);
  };

  // ─── Effect info popup ────────────────────────────
  const [infoState, setInfoState] = useState<
    { key: string; rect: DOMRect; sidebarRight: number } | null
  >(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sidebarRef = useRef<HTMLElement>(null);

  const handleInfoEnter = (key: string, rect: DOMRect) => {
    clearTimeout(closeTimerRef.current);
    const sidebarRight = sidebarRef.current?.getBoundingClientRect().right ??
      rect.right;
    setInfoState({ key, rect, sidebarRight });
  };

  const handleInfoLeave = () => {
    closeTimerRef.current = setTimeout(() => setInfoState(null), 150);
  };

  // Spread onto every Slider that has an effectKey
  const ip = { onInfoEnter: handleInfoEnter, onInfoLeave: handleInfoLeave };

  // ─── Image upload ─────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onImageFile(file);
  };

  return (
    <aside className="sidebar" ref={sidebarRef}>
      {mobileActionBar && (
        <div className="sidebar-mobile-bar">{mobileActionBar}</div>
      )}
      <div className="sidebar-sections">
        <Section title="BACKGROUND" onRand={() => onSectionRand('BG')}>
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Color</span>
            <input
              type="color"
              value={cfg.bg}
              onChange={(e) => set("bg", e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>

          {/* Image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleFileInputChange}
            aria-label="Upload background image"
          />

          {bgImageError && (
            <p className="text-[9px] font-mono text-red-400">{bgImageError}</p>
          )}

          {bgImageUrl ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <img
                  src={bgImageUrl}
                  alt="Background image preview"
                  className="w-10 h-10 object-cover border border-border flex-shrink-0"
                />
                <button
                  className="btn text-[10px] flex-1"
                  onClick={() => onBgImageChange(null)}
                >
                  ✕ REMOVE
                </button>
              </div>
              <p className="text-[9px] text-dim italic">Not saved to presets or links.</p>
              <ButtonGroup
                label="Fit"
                options={[
                  { value: 'cover', label: 'COVER' },
                  { value: 'contain', label: 'CONTAIN' },
                  { value: 'tile', label: 'TILE' },
                ]}
                value={cfg.bgImageFit}
                onChange={(v) => set('bgImageFit', v)}
              />
              <Slider
                label="Opacity"
                value={cfg.bgImageOpacity}
                min={0}
                max={100}
                onChange={(v) => set('bgImageOpacity', v)}
              />
              <ButtonGroup
                label="Blend"
                options={[
                  { value: 'normal', label: 'NORMAL' },
                  { value: 'multiply', label: 'MULTIPLY' },
                  { value: 'screen', label: 'SCREEN' },
                  { value: 'overlay', label: 'OVERLAY' },
                  { value: 'luminosity', label: 'LUMA' },
                ]}
                value={cfg.bgImageBlend}
                onChange={(v) => set('bgImageBlend', v)}
              />
            </div>
          ) : (
            <div
              className="flex flex-col gap-1.5"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <button
                className="btn w-full text-[10px]"
                onClick={() => fileInputRef.current?.click()}
              >
                + IMAGE
              </button>
              <p className="text-[9px] text-dim text-center">or drop / paste</p>
            </div>
          )}
        </Section>

        <Section title="EMOJIS" defaultOpen onRand={() => onSectionRand('EMOJIS')} onReset={() => onSectionReset('EMOJIS')}>
          <div className="grid grid-cols-5 gap-1.5">
            {ALL_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className={`emoji-btn ${
                  cfg.emojis.includes(emoji) ? "active" : ""
                }`}
                onClick={() => toggleEmoji(emoji)}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
          <Slider
            label="Density"
            value={cfg.density}
            min={5}
            max={80}
            onChange={(v) => set("density", v)}
            effectKey="density"
            {...ip}
          />
          <Slider
            label="Min Size"
            value={cfg.minSz}
            min={10}
            max={60}
            onChange={(v) => set("minSz", Math.min(v, cfg.maxSz))}
          />
          <Slider
            label="Max Size"
            value={cfg.maxSz}
            min={40}
            max={130}
            onChange={(v) => set("maxSz", Math.max(v, cfg.minSz))}
          />
          <Slider
            label="Blur"
            value={cfg.blur}
            min={0}
            max={100}
            onChange={(v) => set("blur", v)}
            effectKey="blur"
            {...ip}
          />
        </Section>

        <Section title="TEXT" onRand={() => onSectionRand('TEXT')} onReset={() => onSectionReset('TEXT')}>
          <textarea
            className="w-full bg-transparent border border-border text-text font-mono text-[11px] px-2 py-1.5 resize-none focus:outline-none focus:border-accent placeholder:text-dim"
            rows={2}
            placeholder="Album title, artist name…"
            value={cfg.text}
            onChange={(e) => set('text', e.target.value)}
            aria-label="Text layer content"
          />

          <ButtonGroup
            label="Font"
            options={[
              { value: 'MONO', label: 'MONO', style: { fontFamily: '"Courier New", monospace' } },
              { value: 'DISPLAY', label: 'DISPLAY', style: { fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900 } },
              { value: 'VT323', label: 'VT323', style: { fontFamily: '"VT323", monospace' } },
              { value: 'SPECIAL', label: 'SPECIAL', style: { fontFamily: '"Special Elite", monospace' } },
            ]}
            value={cfg.textFont}
            onChange={(v) => set('textFont', v)}
          />

          <Slider
            label="Size"
            value={cfg.textSize}
            min={8}
            max={120}
            onChange={(v) => set('textSize', v)}
          />
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Color</span>
            <input
              type="color"
              value={cfg.textColor}
              onChange={(e) => set('textColor', e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>
          <Slider
            label="Opacity"
            value={cfg.textOpacity}
            min={0}
            max={100}
            onChange={(v) => set('textOpacity', v)}
          />
          <Slider
            label="Rotation"
            value={cfg.textRotation}
            min={-180}
            max={180}
            onChange={(v) => set('textRotation', v)}
          />
          <Slider
            label="X Position"
            value={Math.round(cfg.textX * 100)}
            min={0}
            max={100}
            onChange={(v) => set('textX', v / 100)}
          />
          <Slider
            label="Y Position"
            value={Math.round(cfg.textY * 100)}
            min={0}
            max={100}
            onChange={(v) => set('textY', v / 100)}
          />
          <ButtonGroup
            label="Align"
            options={[
              { value: 'left', label: '⬅ L' },
              { value: 'center', label: '⬛ C' },
              { value: 'right', label: 'R ➡' },
            ]}
            value={cfg.textAlign}
            onChange={(v) => set('textAlign', v)}
          />
          <ButtonGroup
            label="Blend"
            options={[
              { value: 'normal', label: 'NORMAL' },
              { value: 'screen', label: 'SCREEN' },
              { value: 'overlay', label: 'OVERLAY' },
              { value: 'multiply', label: 'MULTIPLY' },
            ]}
            value={cfg.textBlend}
            onChange={(v) => set('textBlend', v)}
          />
        </Section>

        <Section title="LIGHT RAYS" onRand={() => onSectionRand('RAYS')} onReset={() => onSectionReset('RAYS')}>
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Ray Color</span>
            <input
              type="color"
              value={cfg.rayColor}
              onChange={(e) => set("rayColor", e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>
          <Slider
            label="Intensity"
            value={cfg.rayInt}
            min={0}
            max={100}
            onChange={(v) => set("rayInt", v)}
            effectKey="rayInt"
            {...ip}
          />
          <Slider
            label="Count"
            value={cfg.rays}
            min={4}
            max={32}
            onChange={(v) => set("rays", v)}
            effectKey="rays"
            {...ip}
          />
          <Slider
            label="Bloom"
            value={cfg.bloom}
            min={0}
            max={100}
            onChange={(v) => set("bloom", v)}
            effectKey="bloom"
            {...ip}
          />
          <Slider
            label="Film Burn"
            value={cfg.filmBurn}
            min={0}
            max={100}
            onChange={(v) => set("filmBurn", v)}
            effectKey="filmBurn"
            {...ip}
          />
        </Section>

        <Section title="GLITCH" onRand={() => onSectionRand('GLITCH')} onReset={() => onSectionReset('GLITCH')}>
          <Slider
            label="VHS Streaks"
            value={cfg.glitch}
            min={0}
            max={24}
            onChange={(v) => set("glitch", v)}
            effectKey="glitch"
            {...ip}
          />
          <Slider
            label="Chromatic"
            value={cfg.ca}
            min={0}
            max={15}
            onChange={(v) => set("ca", v)}
            effectKey="ca"
            {...ip}
          />
          <Slider
            label="Interlace"
            value={cfg.interlace}
            min={0}
            max={100}
            onChange={(v) => set("interlace", v)}
            effectKey="interlace"
            {...ip}
          />
          <Slider
            label="Data Mosh"
            value={cfg.dataMosh}
            min={0}
            max={100}
            onChange={(v) => set("dataMosh", v)}
            effectKey="dataMosh"
            {...ip}
          />
        </Section>

        <Section title="TEXTURE" onRand={() => onSectionRand('TEXTURE')} onReset={() => onSectionReset('TEXTURE')}>
          <Slider
            label="Grain"
            value={cfg.grain}
            min={0}
            max={70}
            onChange={(v) => set("grain", v)}
            effectKey="grain"
            {...ip}
          />
          <Slider
            label="Scanlines"
            value={cfg.scanlines}
            min={0}
            max={50}
            onChange={(v) => set("scanlines", v)}
            effectKey="scanlines"
            {...ip}
          />
        </Section>

        <Section title="COLOR TINT" onRand={() => onSectionRand('TINT')} onReset={() => onSectionReset('TINT')}>
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Tint Color</span>
            <input
              type="color"
              value={cfg.tint}
              onChange={(e) => set("tint", e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>
          <Slider
            label="Opacity"
            value={cfg.tintOp}
            min={0}
            max={80}
            onChange={(v) => set("tintOp", v)}
            effectKey="tintOp"
            {...ip}
          />
        </Section>

        <Section title="WARP" onRand={() => onSectionRand('WARP')} onReset={() => onSectionReset('WARP')}>
          <Slider
            label="Noise Warp"
            value={cfg.noiseWarp}
            min={0}
            max={100}
            onChange={(v) => set("noiseWarp", v)}
            effectKey="noiseWarp"
            {...ip}
          />
          <Slider
            label="Liquid Morph"
            value={cfg.morphAmt}
            min={0}
            max={100}
            onChange={(v) => set("morphAmt", v)}
            effectKey="morphAmt"
            {...ip}
          />
          <Slider
            label="Morph Freq"
            value={cfg.morphFreq}
            min={1}
            max={20}
            onChange={(v) => set("morphFreq", v)}
            effectKey="morphFreq"
            {...ip}
          />
          <Slider
            label="Vortex"
            value={cfg.vortex}
            min={0}
            max={100}
            onChange={(v) => set("vortex", v)}
            effectKey="vortex"
            {...ip}
          />
          <Slider
            label="Barrel"
            value={cfg.barrel}
            min={0}
            max={100}
            onChange={(v) => set("barrel", v)}
            effectKey="barrel"
            {...ip}
          />
          <Slider
            label="Chunk Tear"
            value={cfg.tearAmt}
            min={0}
            max={20}
            onChange={(v) => set("tearAmt", v)}
            effectKey="tearAmt"
            {...ip}
          />
          <Slider
            label="Tear Size"
            value={cfg.tearSize}
            min={1}
            max={20}
            onChange={(v) => set("tearSize", v)}
            effectKey="tearSize"
            {...ip}
          />
          <Slider
            label="Mirror"
            value={cfg.mirror}
            min={0}
            max={3}
            onChange={(v) => set("mirror", v)}
            effectKey="mirror"
            {...ip}
          />
        </Section>

        <Section title="COLOR FX" onRand={() => onSectionRand('COLORFX')} onReset={() => onSectionReset('COLORFX')}>
          <Slider
            label="Hue Shift"
            value={cfg.hueShift}
            min={0}
            max={360}
            onChange={(v) => set("hueShift", v)}
            effectKey="hueShift"
            {...ip}
          />
          <Slider
            label="RGB Split"
            value={cfg.rgbSplit}
            min={0}
            max={30}
            onChange={(v) => set("rgbSplit", v)}
            effectKey="rgbSplit"
            {...ip}
          />
          <Slider
            label="Vignette"
            value={cfg.vignette}
            min={0}
            max={100}
            onChange={(v) => set("vignette", v)}
            effectKey="vignette"
            {...ip}
          />
          <Slider
            label="Pixelate"
            value={cfg.pixelate}
            min={0}
            max={20}
            onChange={(v) => set("pixelate", v)}
            effectKey="pixelate"
            {...ip}
          />
          <Slider
            label="Posterize"
            value={cfg.posterize}
            min={0}
            max={16}
            onChange={(v) => set("posterize", v)}
            effectKey="posterize"
            {...ip}
          />
        </Section>

        <Section title="RISO" onRand={() => onSectionRand('RISO')} onReset={() => onSectionReset('RISO')}>
          <Slider
            label="Duotone"
            value={cfg.duotone}
            min={0}
            max={100}
            onChange={(v) => set("duotone", v)}
            effectKey="duotone"
            {...ip}
          />
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Shadow Color</span>
            <input
              type="color"
              value={cfg.duoA}
              onChange={(e) => set("duoA", e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Light Color</span>
            <input
              type="color"
              value={cfg.duoB}
              onChange={(e) => set("duoB", e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>
          <Slider
            label="Halftone"
            value={cfg.halftone}
            min={0}
            max={30}
            onChange={(v) => set("halftone", v)}
            effectKey="halftone"
            {...ip}
          />
          <Slider
            label="Misreg Shift"
            value={cfg.risoShift}
            min={0}
            max={40}
            onChange={(v) => set("risoShift", v)}
            effectKey="risoShift"
            {...ip}
          />
          <Slider
            label="Misreg Angle"
            value={cfg.risoAngle}
            min={0}
            max={360}
            onChange={(v) => set("risoAngle", v)}
            effectKey="risoAngle"
            {...ip}
          />
        </Section>

        <Section title="LABEL">
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Parental Advisory</span>
            <label
              className="toggle-switch"
              aria-label="Toggle Parental Advisory badge"
            >
              <input
                type="checkbox"
                checked={cfg.parentalAdvisory}
                onChange={(e) => set("parentalAdvisory", e.target.checked)}
              />
              <span className="toggle-switch__track" />
            </label>
          </div>
          {cfg.parentalAdvisory && (
            <>
              <div className="flex justify-between items-center text-dim text-[10px]">
                <span>White border</span>
                <label
                  className="toggle-switch"
                  aria-label="Toggle white border on badge"
                >
                  <input
                    type="checkbox"
                    checked={cfg.advisoryBorder}
                    onChange={(e) => set("advisoryBorder", e.target.checked)}
                  />
                  <span className="toggle-switch__track" />
                </label>
              </div>
              <Slider
                label="X Position"
                value={Math.round(cfg.advisoryX * 100)}
                min={0}
                max={70}
                onChange={(v) => set('advisoryX', v / 100)}
              />
              <Slider
                label="Y Position"
                value={Math.round(cfg.advisoryY * 100)}
                min={0}
                max={90}
                onChange={(v) => set('advisoryY', v / 100)}
              />
              <p className="pa-hint">
                Or drag the badge on the canvas to reposition it.
              </p>
            </>
          )}
        </Section>
      </div>

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
