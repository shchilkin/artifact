import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo } from 'react';
import type { GraphArea, ImageLayer, Layer } from '../../types/config';
import { getAiGenerationStatusLabel, getAiGenerationUiState } from '../../utils/aiGenerationStatus';
import { type LayerInsertAction, LayerQuickAddMenu } from './LayerQuickAddMenu';
import { getLayerIcon } from './layerDisplayItems';
import type { LayerDropPosition } from './useLayerDragReorder';

export interface LayerRowProps {
  layer: Layer;
  areas: GraphArea[];
  selected: boolean;
  dragOverPosition: LayerDropPosition | null;
  editing: boolean;
  nested?: boolean;
  onSelect: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onOpenContextMenu: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
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
  onToggleVisible,
  onDuplicateLayer,
  onRemoveLayer,
  canQuickAdd = false,
  onInsertLayerAbove,
}: LayerRowProps) {
  const aiState = layer.kind === 'image' ? getAiGenerationUiState(layer.aiGeneration) : 'idle';
  const aiStatusLabel = layer.kind === 'image' ? getAiGenerationStatusLabel((layer as ImageLayer).aiGeneration) : null;
  const aiHistoryCount = layer.kind === 'image' ? ((layer as ImageLayer).aiGenerationHistory?.length ?? 0) : 0;
  const aiHistoryIndex =
    layer.kind === 'image'
      ? Math.min(Math.max((layer as ImageLayer).aiGenerationHistoryIndex ?? aiHistoryCount - 1, 0), aiHistoryCount - 1)
      : 0;
  const stateClassNames = [
    selected ? 'bg-accent-dim layer-row-selected' : 'hover:bg-accent-dim/50',
    dragOverPosition ? `layer-row-drop-target layer-row-drop-${dragOverPosition}` : '',
    nested ? 'layer-row-nested' : '',
    layer.visible ? '' : 'layer-row-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      draggable
      aria-selected={selected}
      data-layer-visible={layer.visible ? 'true' : 'false'}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest('.layer-row-actions, input, textarea, select') &&
          !target.closest('.layer-row-drag-handle')
        ) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', layer.id);
        onDragStart(layer.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const position = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
        onDragOverLayer(layer.id, position);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const position = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
        onDropLayer(layer.id, position);
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => onSelect(layer.id, event)}
      onContextMenu={(event) => onOpenContextMenu(layer.id, event)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEditing(layer.id);
      }}
      className={`layer-row flex items-center gap-2 px-3 min-h-[36px] cursor-pointer border-b border-border select-none transition-colors ${stateClassNames}`}
    >
      <button
        type="button"
        className="layer-row-drag-handle text-dim text-[10px] cursor-grab active:cursor-grabbing flex-shrink-0"
        draggable
        aria-label={`Drag layer ${layer.name}`}
        title="Drag to reorder"
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', layer.id);
          onDragStart(layer.id);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        ⠿
      </button>
      <span
        className={`font-mono text-[10px] flex-shrink-0 w-5 text-center ${layer.kind === 'effect' ? 'text-accent' : 'text-dim'}`}
        style={{ fontWeight: 700 }}
      >
        {getLayerIcon(layer)}
      </span>
      {editing ? (
        <input
          autoFocus
          defaultValue={layer.name}
          aria-label={`Rename layer ${layer.name}`}
          className="font-mono text-[10px] flex-1 min-w-0 bg-transparent border-none outline-none border-b border-accent text-text"
          onBlur={(event) => {
            const value = event.target.value.trim();
            onFinishRename(layer.id, value || null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const value = event.currentTarget.value.trim();
              onFinishRename(layer.id, value || null);
            } else if (event.key === 'Escape') {
              onFinishRename(layer.id, null);
            }
          }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span className={`font-mono text-[10px] flex-1 truncate min-w-0 ${selected ? 'text-text' : 'text-dim'}`}>
          {layer.name}
        </span>
      )}
      {aiState !== 'idle' && aiState !== 'done' && aiStatusLabel && (
        <span className={`layer-ai-status layer-ai-status-${aiState}`} title={aiStatusLabel}>
          {aiState === 'loading' && <span className="layer-ai-status-spinner" aria-hidden="true" />}
          {aiStatusLabel}
        </span>
      )}
      {aiHistoryCount > 1 && (
        <span className="layer-ai-history-count" title={`${aiHistoryCount} generated images`}>
          {aiHistoryIndex + 1}/{aiHistoryCount}
        </span>
      )}
      {areas.length > 0 && !nested && (
        <span
          className="layer-area-chip"
          title={areas.map((area) => area.name).join(', ')}
          aria-label={`Graph area: ${areas.map((area) => area.name).join(', ')}`}
        >
          <span className="layer-area-dot" style={{ background: areas[0].color }} aria-hidden="true" />
          <span className="layer-area-name">{areas[0].name}</span>
          {areas.length > 1 && <span className="layer-area-more">+{areas.length - 1}</span>}
        </span>
      )}
      <div className="layer-row-actions" aria-label={`${layer.name} layer actions`}>
        {canQuickAdd && onInsertLayerAbove && (
          <LayerQuickAddMenu layerName={layer.name} onInsert={(action) => onInsertLayerAbove(layer.id, action)} />
        )}
        <button
          type="button"
          className="layer-row-action"
          aria-pressed={layer.visible}
          onClick={(event) => {
            event.stopPropagation();
            onStartEditing(layer.id);
          }}
          aria-label={`Rename layer ${layer.name}`}
          title="Rename"
        >
          R
        </button>
        <button
          type="button"
          className="layer-row-action"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisible(layer.id);
          }}
          aria-label={layer.visible ? `Hide layer ${layer.name}` : `Show layer ${layer.name}`}
          title={layer.visible ? 'Hide' : 'Show'}
        >
          {layer.visible ? '◉' : '○'}
        </button>
        <button
          type="button"
          className="layer-row-action"
          onClick={(event) => {
            event.stopPropagation();
            onDuplicateLayer(layer.id);
          }}
          aria-label={`Duplicate layer ${layer.name}`}
          title="Duplicate"
        >
          ⊕
        </button>
        <button
          type="button"
          className="layer-row-action layer-row-action-danger"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveLayer(layer.id);
          }}
          aria-label={`Delete layer ${layer.name}`}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
});
