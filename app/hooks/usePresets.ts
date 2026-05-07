import { useCallback, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { generateThumbnail } from '../utils/generateThumbnail';

export interface Preset {
  id: string;
  name: string;
  doc: CanvasDocument;
  thumbnail: string;
}

const STORAGE_KEY = 'emoji-art-presets-v2';
export const MAX_PRESETS = 20;

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

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>(loadFromStorage);

  const savePreset = useCallback(async (
    name: string,
    doc: CanvasDocument,
    imageCache: Map<string, HTMLImageElement>,
  ) => {
    let thumbnail: string;
    try {
      thumbnail = await generateThumbnail(doc, imageCache);
    } catch (err) {
      console.error('[presets] thumbnail generation failed, using placeholder', err);
      thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }

    const preset: Preset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      doc,
      thumbnail,
    };

    setPresets((prev) => {
      let next = [...prev, preset];
      if (next.length > MAX_PRESETS) next = next.slice(next.length - MAX_PRESETS);
      saveToStorage(next);
      return next;
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((preset) => preset.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const loadPreset = useCallback((preset: Preset) => ({ doc: preset.doc }), []);

  return { presets, savePreset, deletePreset, loadPreset };
}
