import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AddLibraryPanel } from '../add-library/AddLibraryPanel';
import type { AddLibraryAction } from '../add-library/addLibraryModel';
import { useAddLibraryFloatingMenu } from '../add-library/useAddLibraryFloatingMenu';
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
  const quickMenu = useAddLibraryFloatingMenu({ width: LAYER_QUICK_MENU_W, height: LAYER_QUICK_MENU_H });

  const handleInsert = useCallback(
    (action: LayerInsertAction) => {
      onInsert(action);
      quickMenu.close();
    },
    [onInsert, quickMenu.close],
  );

  const handleAddLibraryAction = useCallback(
    (action: AddLibraryAction) => {
      const insertAction = layerInsertActionFromLibraryAction(action);
      if (insertAction) handleInsert(insertAction);
    },
    [handleInsert],
  );

  return (
    <div ref={quickMenu.anchorRef} className="layer-row-quick-add">
      <button
        type="button"
        className="layer-row-action"
        onClick={(event) => {
          event.stopPropagation();
          quickMenu.toggle();
        }}
        aria-label={`Insert layer above ${layerName}`}
        title="Add above"
      >
        +
      </button>
      {quickMenu.open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={quickMenu.menuRef}
            className="add-library-surface add-library-layer-quick-menu"
            style={quickMenu.menuStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <AddLibraryPanel
              surface="layers"
              searchLabel={`Search inserts above ${layerName}`}
              placeholder="Insert above…"
              onAdd={handleAddLibraryAction}
              onClose={quickMenu.close}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
