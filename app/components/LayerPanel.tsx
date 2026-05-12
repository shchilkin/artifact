import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasDocument, EffectLayer, EffectPreset, Layer, LayerKind } from '../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../types/config';

interface Props {
  doc: CanvasDocument;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onRemoveLayer: (id: string) => void;
  onReorderLayers: (newOrder: Layer[]) => void;
  onToggleVisible: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  modeSwitcher?: React.ReactNode;
}

const KIND_ICONS: Record<LayerKind, string> = {
  text: 'T',
  image: '◻',
  emoji: '✦',
  effect: '⚡',
  fill: '■',
  primitive: '◍',
  noise: '░',
  array: '▦',
};

interface LayerRowProps {
  layer: Layer;
  selected: boolean;
  dragOver: boolean;
  editing: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onStartEditing: (id: string) => void;
  onFinishRename: (id: string, name: string | null) => void;
  onDragStart: (id: string) => void;
  onDragOverLayer: (id: string) => void;
  onDropLayer: (id: string) => void;
  onDragEnd: () => void;
  onToggleVisible: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRemoveLayer: (id: string) => void;
}

const LayerRow = memo(function LayerRow({
  layer,
  selected,
  dragOver,
  editing,
  onSelect,
  onStartEditing,
  onFinishRename,
  onDragStart,
  onDragOverLayer,
  onDropLayer,
  onDragEnd,
  onToggleVisible,
  onDuplicateLayer,
  onRemoveLayer,
}: LayerRowProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(layer.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverLayer(layer.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropLayer(layer.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(layer.id, selected)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEditing(layer.id);
      }}
      className={`flex items-center gap-2 px-3 min-h-[36px] cursor-pointer border-b border-border select-none transition-colors ${
        selected ? 'bg-accent-dim' : 'hover:bg-accent-dim/50'
      } ${dragOver ? 'border-t-2 border-t-accent' : ''}`}
    >
      <span className="text-dim text-[10px] cursor-grab active:cursor-grabbing flex-shrink-0">⠿</span>
      <span
        className={`font-mono text-[10px] flex-shrink-0 w-5 text-center ${layer.kind === 'effect' ? 'text-accent' : 'text-dim'}`}
        style={{ fontWeight: 700 }}
      >
        {layer.kind === 'effect'
          ? (EFFECT_PRESETS[(layer as EffectLayer).preset!]?.icon ?? '⚡')
          : KIND_ICONS[layer.kind]}
      </span>
      {editing ? (
        <input
          autoFocus
          defaultValue={layer.name}
          className="font-mono text-[10px] flex-1 min-w-0 bg-transparent border-none outline-none border-b border-accent text-text"
          onBlur={(e) => {
            const value = e.target.value.trim();
            onFinishRename(layer.id, value || null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = e.currentTarget.value.trim();
              onFinishRename(layer.id, value || null);
            } else if (e.key === 'Escape') {
              onFinishRename(layer.id, null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`font-mono text-[10px] flex-1 truncate min-w-0 ${selected ? 'text-text' : 'text-dim'}`}>
          {layer.name}
        </span>
      )}
      <button
        className="text-[11px] flex-shrink-0 text-dim hover:text-text bg-transparent border-none cursor-pointer p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible(layer.id);
        }}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        title={layer.visible ? 'Hide' : 'Show'}
      >
        {layer.visible ? '◉' : '○'}
      </button>
      <button
        className="text-[11px] flex-shrink-0 text-dim hover:text-accent bg-transparent border-none cursor-pointer p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicateLayer(layer.id);
        }}
        aria-label="Duplicate layer"
        title="Duplicate"
      >
        ⊕
      </button>
      <button
        className="text-[11px] flex-shrink-0 text-dim hover:text-red-400 bg-transparent border-none cursor-pointer p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onRemoveLayer(layer.id);
        }}
        aria-label="Delete layer"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
});

export function LayerPanel({
  doc,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onRemoveLayer,
  onReorderLayers,
  onToggleVisible,
  onDuplicateLayer,
  onRenameLayer,
  modeSwitcher,
}: Props) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragLayerId = useRef<string | null>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddMenu) return;
    function handleOutside(e: MouseEvent) {
      if (addButtonRef.current && !addButtonRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAddMenu]);

  const displayLayers = useMemo(() => [...doc.layers].reverse(), [doc.layers]);

  const handleDragStart = useCallback((id: string) => {
    dragLayerId.current = id;
  }, []);

  const handleDragOverLayer = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleSelectLayer = useCallback(
    (id: string, selected: boolean) => {
      onSelectLayer(selected ? null : id);
    },
    [onSelectLayer],
  );

  const handleStartEditing = useCallback((id: string) => setEditingId(id), []);

  const handleFinishRename = useCallback(
    (id: string, name: string | null) => {
      if (name) onRenameLayer(id, name);
      setEditingId(null);
    },
    [onRenameLayer],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = dragLayerId.current;
      if (!sourceId || sourceId === targetId) {
        setDragOverId(null);
        dragLayerId.current = null;
        return;
      }

      const newDisplayLayers = [...displayLayers];
      const sourceIdx = newDisplayLayers.findIndex((layer) => layer.id === sourceId);
      const targetIdx = newDisplayLayers.findIndex((layer) => layer.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return;
      const [item] = newDisplayLayers.splice(sourceIdx, 1);
      newDisplayLayers.splice(targetIdx, 0, item);
      onReorderLayers([...newDisplayLayers].reverse());
      setDragOverId(null);
      dragLayerId.current = null;
    },
    [displayLayers, onReorderLayers],
  );

  const handleAddLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      onAddLayer(kind);
      setShowAddMenu(false);
    },
    [onAddLayer],
  );

  const handleAddEffectPreset = useCallback(
    (key: EffectPreset) => {
      onAddEffectPreset(key);
      setShowAddMenu(false);
    },
    [onAddEffectPreset],
  );

  const handleToggleAddMenu = useCallback(() => {
    setShowAddMenu((prev) => !prev);
  }, []);

  const handleCancelDrag = useCallback(() => {
    setDragOverId(null);
    dragLayerId.current = null;
  }, []);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="layer-panel-header">
        {modeSwitcher ?? (
          <span className="font-mono text-[10px] tracking-[2.5px] uppercase font-semibold text-accent">LAYERS</span>
        )}
        <div ref={addButtonRef} className="relative">
          <button className="layer-add-button" onClick={handleToggleAddMenu} aria-label="Add layer">
            + ADD
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 bg-bg border border-border z-50 min-w-[130px]">
              {(
                ['text', 'image', 'emoji', 'fill', 'primitive', 'noise', 'array'] as Exclude<LayerKind, 'effect'>[]
              ).map((kind) => (
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
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {displayLayers.length === 0 && (
          <div className="px-3.5 py-4 text-[10px] text-dim text-center font-mono">No layers. Add one above.</div>
        )}
        {displayLayers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            selected={selectedLayerId === layer.id}
            dragOver={dragOverId === layer.id}
            editing={editingId === layer.id}
            onSelect={handleSelectLayer}
            onStartEditing={handleStartEditing}
            onFinishRename={handleFinishRename}
            onDragStart={handleDragStart}
            onDragOverLayer={handleDragOverLayer}
            onDropLayer={handleDrop}
            onDragEnd={handleCancelDrag}
            onToggleVisible={onToggleVisible}
            onDuplicateLayer={onDuplicateLayer}
            onRemoveLayer={onRemoveLayer}
          />
        ))}
      </div>
    </div>
  );
}
