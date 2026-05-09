import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Preset } from '../hooks/usePresets';
import { MAX_PRESETS } from '../hooks/usePresets';

interface Props {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (preset: Preset) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function PresetsPanel({ presets, onSave, onLoad, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const handleSave = () => {
    const trimmed = name.trim() || `Preset ${presets.length + 1}`;
    onSave(trimmed);
    setName('');
  };
  const nearLimit = presets.length >= MAX_PRESETS - 2;

  return (
    <>
      <motion.div className="fixed inset-0 bg-black/60 z-299" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
      <motion.div className="fixed top-0 right-0 bottom-0 w-[min(320px,100vw)] bg-sidebar border-l border-border flex flex-col z-300 overflow-hidden" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
        <div className="flex items-center justify-between px-4 min-h-11 border-b border-border shrink-0">
          <span className="text-[10px] tracking-[2.5px] text-accent font-semibold">PRESETS</span>
          <div className="flex items-center gap-2.5">
            <span className={`text-[9px] tracking-[0.5px] ${nearLimit ? 'text-accent' : 'text-dim'}`}>{presets.length} / {MAX_PRESETS}</span>
            <button className="btn btn-icon" onClick={onClose} aria-label="Close presets">✕</button>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-2.5 border-b border-border shrink-0">
          <label htmlFor="preset-name-input" className="sr-only">Preset name</label>
          <input
            id="preset-name-input"
            type="text"
            placeholder="Preset name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="flex-1 bg-sidebar-raised border border-border text-text font-mono text-[11px] px-2 h-11 rounded-sm outline-none focus:border-accent placeholder:text-dim"
          />
          <button className="btn btn-primary" onClick={handleSave}>SAVE</button>
        </div>
        {presets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-dim text-[11px] p-5 text-center">
            <div className="text-[32px] text-accent opacity-30 mb-2">✦</div>
            <p>No presets saved yet.</p>
            <p>Tweak settings and save your first preset.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
            {presets.map((preset) => (
              <div key={preset.id} className="flex gap-2.5 p-2.5 border border-border rounded bg-sidebar-raised/50 transition-colors hover:border-accent/30">
                <img src={preset.thumbnail} alt={preset.name} className="w-16 h-16 rounded object-cover shrink-0" />
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div className="text-[12px] text-text truncate">{preset.name}</div>
                  <div className="text-[10px] text-dim tracking-[0.5px]">seed: {preset.doc.global.seed}</div>
                  <div className="flex gap-1.5">
                    <button className="btn btn-small" aria-label={`Load ${preset.name}`} onClick={() => onLoad(preset)}>LOAD</button>
                    <button className="btn btn-small btn-danger" aria-label={`Delete ${preset.name}`} onClick={() => onDelete(preset.id)}>DEL</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}
