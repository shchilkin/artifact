import { useCallback, useEffect, useRef, useState } from 'react';
import type { EffectPreset, LayerKind } from '../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../../types/config';
import { KIND_ICONS } from './layerDisplayItems';

const LAYER_QUICK_ADD_KINDS: Exclude<LayerKind, 'effect'>[] = [
  'text',
  'image',
  'emoji',
  'fill',
  'primitive',
  'noise',
  'array',
];

export type LayerInsertAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'effect'; preset: EffectPreset };

export function LayerQuickAddMenu({
  layerName,
  onInsert,
}: {
  layerName: string;
  onInsert: (action: LayerInsertAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleInsert = useCallback(
    (action: LayerInsertAction) => {
      onInsert(action);
      setOpen(false);
    },
    [onInsert],
  );

  return (
    <div ref={rootRef} className="layer-row-quick-add">
      <button
        type="button"
        className="layer-row-action"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label={`Insert layer above ${layerName}`}
        title="Add above"
      >
        +
      </button>
      {open && (
        <div className="layer-row-quick-add-menu" onClick={(event) => event.stopPropagation()}>
          {LAYER_QUICK_ADD_KINDS.map((kind) => (
            <button key={kind} type="button" onClick={() => handleInsert({ kind: 'layer', layerKind: kind })}>
              <span>{KIND_ICONS[kind]}</span>
              {kind.toUpperCase()}
            </button>
          ))}
          <div className="layer-row-quick-add-divider" />
          {EFFECT_PRESET_MENU_ORDER.map((presetKey) => {
            const preset = EFFECT_PRESETS[presetKey];
            return (
              <button key={presetKey} type="button" onClick={() => handleInsert({ kind: 'effect', preset: presetKey })}>
                <span>{preset.icon}</span>
                {preset.name.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
