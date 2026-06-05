import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddLibraryPanel } from '../add-library/AddLibraryPanel';
import type { AddLibraryAction } from '../add-library/addLibraryModel';
import { clampPopupPosition } from '../node-canvas/helpers';
import type { LayerInsertAction } from './layerInsertAction';

const LAYER_QUICK_MENU_W = 520;
const LAYER_QUICK_MENU_H = 520;

const LAYER_INSERT_ACTION_BUILDERS = {
  layer: (action: Extract<AddLibraryAction, { kind: 'layer' }>) => ({ kind: 'layer', layerKind: action.layerKind }),
  textPreset: (action: Extract<AddLibraryAction, { kind: 'textPreset' }>) => ({
    kind: 'textPreset',
    preset: action.preset,
  }),
  aiImage: () => ({ kind: 'aiImage' }),
  noisePreset: (action: Extract<AddLibraryAction, { kind: 'noisePreset' }>) => ({
    kind: 'noisePreset',
    preset: action.preset,
  }),
  arrayPreset: (action: Extract<AddLibraryAction, { kind: 'arrayPreset' }>) => ({
    kind: 'arrayPreset',
    preset: action.preset,
  }),
  effect: (action: Extract<AddLibraryAction, { kind: 'effect' }>) => ({ kind: 'effect', preset: action.preset }),
} satisfies Record<string, (action: never) => LayerInsertAction>;

function layerInsertActionFromLibraryAction(action: AddLibraryAction): LayerInsertAction | null {
  const build = LAYER_INSERT_ACTION_BUILDERS[action.kind as keyof typeof LAYER_INSERT_ACTION_BUILDERS];
  return build ? build(action as never) : null;
}

export function LayerQuickAddMenu({
  layerName,
  onInsert,
}: {
  layerName: string;
  onInsert: (action: LayerInsertAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const toggleMenu = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    const position = rect
      ? clampPopupPosition(rect.left, rect.bottom + 4, LAYER_QUICK_MENU_W, LAYER_QUICK_MENU_H)
      : { left: 8, top: 8 };
    setMenuPosition(position);
    setOpen((value) => !value);
  }, []);

  const handleInsert = useCallback(
    (action: LayerInsertAction) => {
      onInsert(action);
      setOpen(false);
    },
    [onInsert],
  );

  const handleAddLibraryAction = useCallback(
    (action: AddLibraryAction) => {
      const insertAction = layerInsertActionFromLibraryAction(action);
      if (insertAction) handleInsert(insertAction);
    },
    [handleInsert],
  );

  return (
    <div ref={rootRef} className="layer-row-quick-add">
      <button
        type="button"
        className="layer-row-action"
        onClick={(event) => {
          event.stopPropagation();
          toggleMenu();
        }}
        aria-label={`Insert layer above ${layerName}`}
        title="Add above"
      >
        +
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="add-library-surface add-library-layer-quick-menu"
            style={{ left: menuPosition.left, top: menuPosition.top } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <AddLibraryPanel
              surface="layers"
              searchLabel={`Search inserts above ${layerName}`}
              placeholder="Insert above…"
              onAdd={handleAddLibraryAction}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
