import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { memo } from 'react';
import type { GraphArea, ImageLayer, Layer } from '../../types/config';
import { getAiGenerationStatusLabel, getAiGenerationUiState } from '../../utils/aiGenerationStatus';
import { LayerQuickAddMenu } from './LayerQuickAddMenu';
import { getLayerIcon } from './layerDisplayItems';
import type { LayerInsertAction } from './layerInsertAction';
import type { LayerDropPosition } from './useLayerDragReorder';

export interface LayerRowProps {
  layer: Layer;
  areas: GraphArea[];
  selected: boolean;
  dragOverPosition: LayerDropPosition | null;
  editing: boolean;
  nested?: boolean;
  onSelect: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onOpenContextMenu: (id: string, event: ReactMouseEvent<HTMLElement>) => void;
  onStartEditing: (id: string) => void;
  onFinishRename: (id: string, name: string | null) => void;
  onDragStart: (id: string) => void;
  onDragOverLayer: (id: string, position: LayerDropPosition) => void;
  onDropLayer: (id: string, position: LayerDropPosition) => void;
  onDragEnd: () => void;
  onToggleVisible: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRemoveLayer: (id: string) => void;
  canQuickAdd?: boolean;
  onInsertLayerAbove?: (id: string, action: LayerInsertAction) => void;
}

function getImageAiHistoryState(layer: ImageLayer) {
  const historyCount = layer.aiGenerationHistory?.length ?? 0;
  const rawIndex = layer.aiGenerationHistoryIndex ?? historyCount - 1;
  return {
    count: historyCount,
    index: Math.min(Math.max(rawIndex, 0), historyCount - 1),
  };
}

function selectedClassName(selected: boolean) {
  return selected ? 'bg-accent-dim layer-row-selected' : 'hover:bg-accent-dim/50';
}

function dropTargetClassName(position: LayerDropPosition | null) {
  return position ? `layer-row-drop-target layer-row-drop-${position}` : '';
}

function nestedClassName(nested: boolean | undefined) {
  return nested ? 'layer-row-nested' : '';
}

function visibilityClassName(layer: Layer) {
  return layer.visible ? '' : 'layer-row-hidden';
}

function lockClassName(layer: Layer) {
  return layer.locked ? 'layer-row-locked' : '';
}

function getLayerRowStateClassNames({
  selected,
  dragOverPosition,
  nested,
  layer,
}: Pick<LayerRowProps, 'selected' | 'dragOverPosition' | 'nested' | 'layer'>) {
  return [
    selectedClassName(selected),
    dropTargetClassName(dragOverPosition),
    nestedClassName(nested),
    visibilityClassName(layer),
    lockClassName(layer),
  ]
    .filter(Boolean)
    .join(' ');
}

function getDropPosition(event: ReactDragEvent<HTMLElement>): LayerDropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}

function shouldCancelLayerRowDrag(target: EventTarget) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('.layer-row-actions, input, textarea, select') && !target.closest('.layer-row-drag-handle'),
  );
}

function startLayerDrag(event: ReactDragEvent<HTMLElement>, layer: Layer, onDragStart: (id: string) => void) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', layer.id);
  onDragStart(layer.id);
}

function handleLayerRowDragStart(event: ReactDragEvent<HTMLElement>, layer: Layer, onDragStart: (id: string) => void) {
  if (layer.locked || shouldCancelLayerRowDrag(event.target)) {
    event.preventDefault();
    return;
  }
  startLayerDrag(event, layer, onDragStart);
}

function LayerDragHandle({ layer, onDragStart }: Pick<LayerRowProps, 'layer' | 'onDragStart'>) {
  return (
    <button
      type="button"
      className="layer-row-drag-handle text-dim text-[10px] cursor-grab active:cursor-grabbing flex-shrink-0"
      draggable={!layer.locked}
      disabled={layer.locked}
      aria-label={`Drag layer ${layer.name}`}
      title={layer.locked ? 'Unlock to reorder' : 'Drag to reorder'}
      onDragStart={(event) => {
        event.stopPropagation();
        if (layer.locked) {
          event.preventDefault();
          return;
        }
        startLayerDrag(event, layer, onDragStart);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      ⠿
    </button>
  );
}

function LayerNameEditor({
  layer,
  editing,
  selected,
  onFinishRename,
}: Pick<LayerRowProps, 'layer' | 'editing' | 'selected' | 'onFinishRename'>) {
  const finishRename = (value: string | null) => onFinishRename(layer.id, value);
  if (!editing) {
    return <span className={`layer-row-name ${selected ? 'text-text' : 'text-dim'}`}>{layer.name}</span>;
  }
  return (
    <input
      autoFocus
      defaultValue={layer.name}
      aria-label={`Rename layer ${layer.name}`}
      className="layer-row-name layer-row-name-input bg-transparent border-none outline-none border-b border-accent text-text"
      onBlur={(event) => finishRename(event.target.value.trim() || null)}
      onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') finishRename(event.currentTarget.value.trim() || null);
        if (event.key === 'Escape') finishRename(null);
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function layerKindLabel(layer: Layer) {
  if (layer.kind === 'emoji') return 'emoji';
  if (layer.kind === 'primitive') return '3d';
  return layer.kind;
}

function LayerKindBadge({ layer }: Pick<LayerRowProps, 'layer'>) {
  return (
    <span
      className={`layer-row-kind-badge layer-row-kind-badge-${layer.kind}`}
      title={`${layerKindLabel(layer)} layer`}
    >
      <span className="layer-row-kind-icon" aria-hidden="true">
        {getLayerIcon(layer)}
      </span>
      <span className="layer-row-kind-label">{layerKindLabel(layer)}</span>
    </span>
  );
}

function LayerStatusMeta({ layer }: Pick<LayerRowProps, 'layer'>) {
  const items = [layer.visible ? 'visible' : 'hidden'];
  if (layer.locked) items.push('locked');
  return (
    <span className="layer-row-meta-status">
      {items.map((item) => (
        <span key={item} className={`layer-row-meta-state layer-row-meta-state-${item}`}>
          {item}
        </span>
      ))}
    </span>
  );
}

function LayerAiStatusBadge({ layer }: { layer: ImageLayer }) {
  const aiState = getAiGenerationUiState(layer.aiGeneration);
  const aiStatusLabel = getAiGenerationStatusLabel(layer.aiGeneration);
  if (shouldHideAiStatusBadge(aiState, aiStatusLabel)) return null;
  return (
    <span className={`layer-ai-status layer-ai-status-${aiState}`} title={aiStatusLabel}>
      <LayerAiStatusSpinner state={aiState} />
      {aiStatusLabel}
    </span>
  );
}

function shouldHideAiStatusBadge(aiState: ReturnType<typeof getAiGenerationUiState>, label: string | null) {
  if (aiState === 'idle') return true;
  if (aiState === 'done') return true;
  return !label;
}

function LayerAiStatusSpinner({ state }: { state: ReturnType<typeof getAiGenerationUiState> }) {
  if (state !== 'loading') return null;
  return <span className="layer-ai-status-spinner" aria-hidden="true" />;
}

function LayerAiHistoryBadge({ layer }: { layer: ImageLayer }) {
  const history = getImageAiHistoryState(layer);
  if (history.count <= 1) return null;
  return (
    <span className="layer-ai-history-count" title={`${history.count} generated images`}>
      {history.index + 1}/{history.count}
    </span>
  );
}

function LayerAiBadges({ layer }: Pick<LayerRowProps, 'layer'>) {
  if (layer.kind !== 'image') return null;
  return (
    <>
      <LayerAiStatusBadge layer={layer} />
      <LayerAiHistoryBadge layer={layer} />
    </>
  );
}

function LayerAreaChip({ areas, nested }: Pick<LayerRowProps, 'areas' | 'nested'>) {
  if (areas.length === 0 || nested) return null;
  const areaNames = areas.map((area) => area.name).join(', ');
  return (
    <span className="layer-area-chip" title={areaNames} aria-label={`Graph area: ${areaNames}`}>
      <span className="layer-area-dot" style={{ background: areas[0].color }} aria-hidden="true" />
      <span className="layer-area-name">{areas[0].name}</span>
      {areas.length > 1 && <span className="layer-area-more">+{areas.length - 1}</span>}
    </span>
  );
}

function LayerQuickAddAction({
  layer,
  canQuickAdd,
  onInsertLayerAbove,
}: Pick<LayerRowProps, 'layer' | 'canQuickAdd' | 'onInsertLayerAbove'>) {
  if (!canQuickAdd || !onInsertLayerAbove) return null;
  return <LayerQuickAddMenu layerName={layer.name} onInsert={(action) => onInsertLayerAbove(layer.id, action)} />;
}

function LayerMoreButton({ layer, onOpenContextMenu }: Pick<LayerRowProps, 'layer' | 'onOpenContextMenu'>) {
  return (
    <button
      type="button"
      className="layer-row-action"
      onClick={(event) => {
        event.stopPropagation();
        onOpenContextMenu(layer.id, event);
      }}
      aria-label={`Open actions for layer ${layer.name}`}
      title="Layer actions"
    >
      •••
    </button>
  );
}

function LayerLockedBadge({ layer }: Pick<LayerRowProps, 'layer'>) {
  if (!layer.locked) return null;
  return (
    <span className="layer-lock-badge" title="Locked layer">
      lock
    </span>
  );
}

function LayerRowActions({
  layer,
  canQuickAdd = false,
  onInsertLayerAbove,
  onOpenContextMenu,
}: Pick<LayerRowProps, 'layer' | 'canQuickAdd' | 'onInsertLayerAbove' | 'onOpenContextMenu'>) {
  return (
    <div className="layer-row-actions" aria-label={`${layer.name} layer actions`}>
      <LayerQuickAddAction layer={layer} canQuickAdd={canQuickAdd} onInsertLayerAbove={onInsertLayerAbove} />
      <LayerMoreButton layer={layer} onOpenContextMenu={onOpenContextMenu} />
    </div>
  );
}

export const LayerRow = memo(function LayerRow({
  layer,
  areas,
  selected,
  dragOverPosition,
  editing,
  nested = false,
  onSelect,
  onOpenContextMenu,
  onStartEditing,
  onFinishRename,
  onDragStart,
  onDragOverLayer,
  onDropLayer,
  onDragEnd,
  canQuickAdd = false,
  onInsertLayerAbove,
}: LayerRowProps) {
  const stateClassNames = getLayerRowStateClassNames({
    selected,
    dragOverPosition,
    nested,
    layer,
  });

  return (
    <div
      draggable={!layer.locked}
      aria-selected={selected}
      data-layer-id={layer.id}
      data-layer-visible={layer.visible ? 'true' : 'false'}
      data-layer-locked={layer.locked ? 'true' : 'false'}
      onDragStart={(event) => handleLayerRowDragStart(event, layer, onDragStart)}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverLayer(layer.id, getDropPosition(event));
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropLayer(layer.id, getDropPosition(event));
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => onSelect(layer.id, event)}
      onContextMenu={(event) => onOpenContextMenu(layer.id, event)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEditing(layer.id);
      }}
      tabIndex={0}
      className={`layer-row px-3 min-h-[64px] cursor-pointer border-b border-border select-none transition-colors ${stateClassNames}`}
    >
      <LayerDragHandle layer={layer} onDragStart={onDragStart} />
      <LayerKindBadge layer={layer} />
      <div className="layer-row-main">
        <LayerNameEditor layer={layer} editing={editing} selected={selected} onFinishRename={onFinishRename} />
        <div className="layer-row-meta">
          <LayerStatusMeta layer={layer} />
          <LayerAiBadges layer={layer} />
          <LayerLockedBadge layer={layer} />
          <LayerAreaChip areas={areas} nested={nested} />
        </div>
      </div>
      <LayerRowActions
        layer={layer}
        canQuickAdd={canQuickAdd}
        onInsertLayerAbove={onInsertLayerAbove}
        onOpenContextMenu={onOpenContextMenu}
      />
    </div>
  );
});
