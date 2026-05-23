import { useCallback, useEffect, useRef, useState } from 'react';
import type { EffectPreset, LayerKind } from '../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../../types/config';
import { KIND_ICONS } from './layerDisplayItems';

const LAYER_ADD_KINDS: Exclude<LayerKind, 'effect'>[] = [
  'text',
  'image',
  'emoji',
  'fill',
  'primitive',
  'noise',
  'array',
];

export function LayerAddMenu({
  onAddLayer,
  onAddEffectPreset,
}: {
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddMenu) return;
    function handleOutside(event: MouseEvent) {
      if (addButtonRef.current && !addButtonRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAddMenu]);

  const handleAddLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      onAddLayer(kind);
      setShowAddMenu(false);
    },
    [onAddLayer],
  );

  const handleAddEffectPreset = useCallback(
    (preset: EffectPreset) => {
      onAddEffectPreset(preset);
      setShowAddMenu(false);
    },
    [onAddEffectPreset],
  );

  return (
    <div ref={addButtonRef} className="relative">
      <button className="layer-add-button" onClick={() => setShowAddMenu((prev) => !prev)} aria-label="Add layer">
        + ADD
      </button>
      {showAddMenu && (
        <div className="absolute right-0 top-full mt-1 bg-bg border border-border z-50 min-w-[130px]">
          {LAYER_ADD_KINDS.map((kind) => (
            <button
              key={kind}
              className="flex items-center gap-2 w-full px-3 py-2 font-mono text-[10px] text-left text-dim hover:text-accent hover:bg-accent-dim border-none bg-transparent cursor-pointer"
              onClick={() => handleAddLayer(kind)}
            >
              <span className="text-accent w-4 text-center">{KIND_ICONS[kind]}</span>
              {kind.toUpperCase()}
            </button>
          ))}
          <div className="border-t border-border my-1" />
          {EFFECT_PRESET_MENU_ORDER.map((key) => {
            const preset = EFFECT_PRESETS[key];
            return (
              <button
                key={key}
                className="flex items-center gap-2 w-full px-3 py-2 font-mono text-[10px] text-left text-dim hover:text-accent hover:bg-accent-dim border-none bg-transparent cursor-pointer"
                onClick={() => handleAddEffectPreset(key)}
              >
                <span className="text-accent w-4 text-center">{preset.icon}</span>
                {preset.name.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
