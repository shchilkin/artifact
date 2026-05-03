import { useState, useCallback } from 'react';
import type { GeneratorConfig } from '../types/config';
import { render } from '../utils/renderer';

export interface Preset {
  id: string;
  name: string;
  seed: number;
  cfg: GeneratorConfig;
  thumbnail: string;
}

const STORAGE_KEY = 'emoji-art-presets';
const MAX_PRESETS = 20;

function loadFromStorage(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function generateThumbnail(cfg: GeneratorConfig, seed: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d')!;
  render(ctx, 120, 120, cfg, seed);
  return canvas.toDataURL('image/png', 0.8);
}

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>(loadFromStorage);

  const savePreset = useCallback((name: string, seed: number, cfg: GeneratorConfig) => {
    const thumbnail = generateThumbnail(cfg, seed);
    const preset: Preset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      seed,
      cfg,
      thumbnail,
    };

    setPresets((prev) => {
      let next = [...prev, preset];
      if (next.length > MAX_PRESETS) {
        next = next.slice(next.length - MAX_PRESETS);
      }
      saveToStorage(next);
      return next;
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const loadPreset = useCallback((preset: Preset) => {
    return { seed: preset.seed, cfg: preset.cfg };
  }, []);

  return { presets, savePreset, deletePreset, loadPreset };
}
