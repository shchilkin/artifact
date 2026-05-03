import { useState } from 'react';
import type { Preset } from '../hooks/usePresets';
import type { GeneratorConfig } from '../types/config';

interface Props {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (preset: Preset) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  currentCfg: GeneratorConfig;
  currentSeed: number;
}

export function PresetsPanel({ presets, onSave, onLoad, onDelete, onClose }: Props) {
  const [name, setName] = useState('');

  const handleSave = () => {
    const trimmed = name.trim() || `Preset ${presets.length + 1}`;
    onSave(trimmed);
    setName('');
  };

  return (
    <>
      <div className="presets-backdrop" onClick={onClose} />
      <div className="presets-panel">
        <div className="presets-header">
          <span className="section-title">PRESETS</span>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close presets">✕</button>
        </div>

        <div className="presets-save">
          <input
            type="text"
            placeholder="Preset name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="preset-name-input"
          />
          <button className="btn btn-primary" onClick={handleSave}>SAVE</button>
        </div>

        {presets.length === 0 ? (
          <div className="presets-empty">
            <div className="presets-empty-icon">✦</div>
            <p>No presets saved yet.</p>
            <p>Tweak settings and save your first preset.</p>
          </div>
        ) : (
          <div className="presets-grid">
            {presets.map((preset) => (
              <div key={preset.id} className="preset-card">
                <img src={preset.thumbnail} alt={preset.name} className="preset-thumb" />
                <div className="preset-info">
                  <div className="preset-name">{preset.name}</div>
                  <div className="preset-seed">seed: {preset.seed}</div>
                  <div className="preset-actions">
                    <button className="btn btn-small" onClick={() => onLoad(preset)}>LOAD</button>
                    <button className="btn btn-small btn-danger" onClick={() => onDelete(preset.id)}>DEL</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
