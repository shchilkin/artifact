import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_EMOJIS, type GeneratorConfig } from "../types/config";
import { EffectInfoPopup } from "./EffectInfoPopup";

interface Props {
  cfg: GeneratorConfig;
  onChange: (cfg: GeneratorConfig) => void;
  mobileActionBar?: React.ReactNode;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  effectKey?: string;
  onInfoEnter?: (key: string, rect: DOMRect) => void;
  onInfoLeave?: () => void;
}

function Slider(
  { label, value, min, max, onChange, effectKey, onInfoEnter, onInfoLeave }:
    SliderProps,
) {
  const iconRef = useRef<HTMLButtonElement>(null);

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
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        className="flex items-center justify-between w-full min-h-11 px-3.5 bg-transparent border-none cursor-pointer text-accent font-mono text-[10px] tracking-[2.5px] uppercase font-semibold hover:bg-accent-dim"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className="text-dim text-[10px]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-3.5 pt-2 pb-3.5 flex flex-col gap-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ cfg, onChange, mobileActionBar }: Props) {
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

  return (
    <aside className="sidebar" ref={sidebarRef}>
      {mobileActionBar && (
        <div className="sidebar-mobile-bar">{mobileActionBar}</div>
      )}
      <div className="sidebar-sections">
        <Section title="BACKGROUND">
          <div className="flex justify-between items-center text-dim text-[10px]">
            <span>Color</span>
            <input
              type="color"
              value={cfg.bg}
              onChange={(e) => set("bg", e.target.value)}
              className="w-9 h-7 border border-border rounded-sm p-0.5 bg-transparent cursor-pointer"
            />
          </div>
        </Section>

        <Section title="EMOJIS" defaultOpen>
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

        <Section title="LIGHT RAYS">
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

        <Section title="GLITCH">
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

        <Section title="TEXTURE">
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

        <Section title="COLOR TINT">
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

        <Section title="WARP">
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

        <Section title="COLOR FX">
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

        <Section title="RISO">
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
              <p className="pa-hint">
                Drag the badge on the canvas to reposition it.
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
