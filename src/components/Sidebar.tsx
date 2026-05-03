import { useState } from 'react';
import { type GeneratorConfig, ALL_EMOJIS } from '../types/config';

interface Props {
  cfg: GeneratorConfig;
  onChange: (cfg: GeneratorConfig) => void;
  mobileActionBar?: React.ReactNode;
  onEnvMapExport: () => void;
  isExportingEnvMap: boolean;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, onChange }: SliderProps) {
  return (
    <div className="slider-row">
      <div className="slider-label">
        <span>{label}</span>
        <span className="slider-value">{value}</span>
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
    <div className="section">
      <button className="section-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="section-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Sidebar({ cfg, onChange, mobileActionBar, onEnvMapExport, isExportingEnvMap }: Props) {
  const set = <K extends keyof GeneratorConfig>(key: K, value: GeneratorConfig[K]) => {
    onChange({ ...cfg, [key]: value });
  };

  const toggleEmoji = (emoji: string) => {
    if (cfg.emojis.includes(emoji) && cfg.emojis.length === 1) return; // guard: keep at least one
    const next = cfg.emojis.includes(emoji)
      ? cfg.emojis.filter((e) => e !== emoji)
      : [...cfg.emojis, emoji];
    set('emojis', next);
  };

  return (
    <aside className="sidebar">
      {mobileActionBar && (
        <div className="sidebar-mobile-bar">{mobileActionBar}</div>
      )}
      <div className="sidebar-sections">
      <Section title="BACKGROUND">
        <div className="slider-row">
          <div className="slider-label">
            <span>Color</span>
            <input
              type="color"
              value={cfg.bg}
              onChange={(e) => set('bg', e.target.value)}
              className="color-input"
            />
          </div>
        </div>
      </Section>

      <Section title="EMOJIS" defaultOpen>
        <div className="emoji-grid">
          {ALL_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={`emoji-btn ${cfg.emojis.includes(emoji) ? 'active' : ''}`}
              onClick={() => toggleEmoji(emoji)}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
        <Slider label="Density" value={cfg.density} min={5} max={80} onChange={(v) => set('density', v)} />
        <Slider label="Min Size" value={cfg.minSz} min={10} max={60} onChange={(v) => set('minSz', Math.min(v, cfg.maxSz))} />
        <Slider label="Max Size" value={cfg.maxSz} min={40} max={130} onChange={(v) => set('maxSz', Math.max(v, cfg.minSz))} />
        <Slider label="Blur" value={cfg.blur} min={0} max={100} onChange={(v) => set('blur', v)} />
      </Section>

      <Section title="LIGHT RAYS">
        <div className="slider-row">
          <div className="slider-label">
            <span>Ray Color</span>
            <input
              type="color"
              value={cfg.rayColor}
              onChange={(e) => set('rayColor', e.target.value)}
              className="color-input"
            />
          </div>
        </div>
        <Slider label="Intensity" value={cfg.rayInt} min={0} max={100} onChange={(v) => set('rayInt', v)} />
        <Slider label="Count" value={cfg.rays} min={4} max={32} onChange={(v) => set('rays', v)} />
        <Slider label="Bloom" value={cfg.bloom} min={0} max={100} onChange={(v) => set('bloom', v)} />
        <Slider label="Film Burn" value={cfg.filmBurn} min={0} max={100} onChange={(v) => set('filmBurn', v)} />
      </Section>

      <Section title="GLITCH">
        <Slider label="VHS Streaks" value={cfg.glitch} min={0} max={24} onChange={(v) => set('glitch', v)} />
        <Slider label="Chromatic" value={cfg.ca} min={0} max={15} onChange={(v) => set('ca', v)} />
        <Slider label="Interlace" value={cfg.interlace} min={0} max={100} onChange={(v) => set('interlace', v)} />
        <Slider label="Data Mosh" value={cfg.dataMosh} min={0} max={100} onChange={(v) => set('dataMosh', v)} />
      </Section>

      <Section title="TEXTURE">
        <Slider label="Grain" value={cfg.grain} min={0} max={70} onChange={(v) => set('grain', v)} />
        <Slider label="Scanlines" value={cfg.scanlines} min={0} max={50} onChange={(v) => set('scanlines', v)} />
      </Section>

      <Section title="COLOR TINT">
        <div className="slider-row">
          <div className="slider-label">
            <span>Tint Color</span>
            <input
              type="color"
              value={cfg.tint}
              onChange={(e) => set('tint', e.target.value)}
              className="color-input"
            />
          </div>
        </div>
        <Slider label="Opacity" value={cfg.tintOp} min={0} max={80} onChange={(v) => set('tintOp', v)} />
      </Section>

      <Section title="WARP">
        <Slider label="Noise Warp"   value={cfg.noiseWarp} min={0}   max={100} onChange={(v) => set('noiseWarp', v)} />
        <Slider label="Liquid Morph" value={cfg.morphAmt}  min={0}   max={100} onChange={(v) => set('morphAmt', v)} />
        <Slider label="Morph Freq"   value={cfg.morphFreq} min={1}   max={20}  onChange={(v) => set('morphFreq', v)} />
        <Slider label="Vortex"       value={cfg.vortex}    min={0}   max={100} onChange={(v) => set('vortex', v)} />
        <Slider label="Barrel"       value={cfg.barrel}    min={0}   max={100} onChange={(v) => set('barrel', v)} />
        <Slider label="Chunk Tear"   value={cfg.tearAmt}   min={0}   max={20}  onChange={(v) => set('tearAmt', v)} />
        <Slider label="Tear Size"    value={cfg.tearSize}  min={1}   max={20}  onChange={(v) => set('tearSize', v)} />
        <Slider label="Mirror"       value={cfg.mirror}    min={0}   max={3}   onChange={(v) => set('mirror', v)} />
      </Section>

      <Section title="COLOR FX">
        <Slider label="Hue Shift"    value={cfg.hueShift}  min={0}   max={360} onChange={(v) => set('hueShift', v)} />
        <Slider label="RGB Split"    value={cfg.rgbSplit}  min={0}   max={30}  onChange={(v) => set('rgbSplit', v)} />
        <Slider label="Vignette"     value={cfg.vignette}  min={0}   max={100} onChange={(v) => set('vignette', v)} />
        <Slider label="Pixelate"     value={cfg.pixelate}  min={0}   max={20}  onChange={(v) => set('pixelate', v)} />
        <Slider label="Posterize"    value={cfg.posterize} min={0}   max={16}  onChange={(v) => set('posterize', v)} />
      </Section>

      <Section title="RISO">
        <Slider label="Duotone"      value={cfg.duotone}   min={0}   max={100} onChange={(v) => set('duotone', v)} />
        <div className="slider-row">
          <div className="slider-label">
            <span>Shadow Color</span>
            <input type="color" value={cfg.duoA} onChange={(e) => set('duoA', e.target.value)} className="color-input" />
          </div>
        </div>
        <div className="slider-row">
          <div className="slider-label">
            <span>Light Color</span>
            <input type="color" value={cfg.duoB} onChange={(e) => set('duoB', e.target.value)} className="color-input" />
          </div>
        </div>
        <Slider label="Halftone"     value={cfg.halftone}  min={0}   max={30}  onChange={(v) => set('halftone', v)} />
        <Slider label="Misreg Shift" value={cfg.risoShift} min={0}   max={40}  onChange={(v) => set('risoShift', v)} />
        <Slider label="Misreg Angle" value={cfg.risoAngle} min={0}   max={360} onChange={(v) => set('risoAngle', v)} />
      </Section>

      <Section title="EXPORT">
        <p className="export-section-label">4096 × 2048 · PNG · equirectangular</p>
        <button
          className="btn btn-full"
          onClick={onEnvMapExport}
          disabled={isExportingEnvMap}
          aria-busy={isExportingEnvMap}
        >
          {isExportingEnvMap ? '…' : 'ENV MAP'}
        </button>
      </Section>
    </div>
    </aside>
  );
}
