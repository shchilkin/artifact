import { useState } from 'react';
import { type GeneratorConfig, ALL_EMOJIS } from '../types/config';

interface Props {
  cfg: GeneratorConfig;
  onChange: (cfg: GeneratorConfig) => void;
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
}

function Section({ title, children }: SectionProps) {
  const [open, setOpen] = useState(true);
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

export function Sidebar({ cfg, onChange }: Props) {
  const set = <K extends keyof GeneratorConfig>(key: K, value: GeneratorConfig[K]) => {
    onChange({ ...cfg, [key]: value });
  };

  const toggleEmoji = (emoji: string) => {
    const next = cfg.emojis.includes(emoji)
      ? cfg.emojis.filter((e) => e !== emoji)
      : [...cfg.emojis, emoji];
    set('emojis', next);
  };

  return (
    <aside className="sidebar">
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

      <Section title="EMOJIS">
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
      </Section>

      <Section title="GLITCH">
        <Slider label="VHS Streaks" value={cfg.glitch} min={0} max={24} onChange={(v) => set('glitch', v)} />
        <Slider label="Chrom. Aber." value={cfg.ca} min={0} max={15} onChange={(v) => set('ca', v)} />
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
    </aside>
  );
}
