import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasDocument, EffectLayer, EffectPreset, GraphArea, Layer, LayerKind } from '../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../types/config';
import { getLayerAreaMap } from '../utils/layerAreas';

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
  areas: GraphArea[];
  selected: boolean;
  dragOver: boolean;
  editing: boolean;
  nested?: boolean;
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
  areas,
  selected,
  dragOver,
  editing,
  nested = false,
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
      } ${dragOver ? 'border-t-2 border-t-accent' : ''} ${nested ? 'layer-row-nested' : ''}`}
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

type LayerDisplayItem =
  | { type: 'layer'; layer: Layer; areas: GraphArea[]; nested?: false }
  | { type: 'area'; area: GraphArea; layers: Layer[]; graphOnlyCount: number };

function buildLayerDisplayItems(displayLayers: Layer[], areasByLayerId: Map<string, GraphArea[]>): LayerDisplayItem[] {
  const items: LayerDisplayItem[] = [];
  const renderedAreaIds = new Set<string>();
  const renderedLayerIds = new Set<string>();
  const layerIds = new Set(displayLayers.map((layer) => layer.id));

  for (const layer of displayLayers) {
    if (renderedLayerIds.has(layer.id)) continue;
    const area = areasByLayerId.get(layer.id)?.[0];
    if (!area) {
      items.push({ type: 'layer', layer, areas: [] });
      renderedLayerIds.add(layer.id);
      continue;
    }

    if (renderedAreaIds.has(area.id)) continue;
    const areaLayerIds = new Set(area.nodeIds);
    const areaLayers = displayLayers.filter((item) => areaLayerIds.has(item.id));
    for (const item of areaLayers) renderedLayerIds.add(item.id);
    renderedAreaIds.add(area.id);
    items.push({
      type: 'area',
      area,
      layers: areaLayers,
      graphOnlyCount: area.nodeIds.filter((nodeId) => !layerIds.has(nodeId)).length,
    });
  }

  return items;
}

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
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<Set<string>>(() => new Set());
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
  const areasByLayerId = useMemo(() => getLayerAreaMap(doc.layers, doc.graph?.areas), [doc.layers, doc.graph?.areas]);
  const displayItems = useMemo(
    () => buildLayerDisplayItems(displayLayers, areasByLayerId),
    [areasByLayerId, displayLayers],
  );
  const activeCollapsedAreaIds = useMemo(() => {
    const areaIds = new Set((doc.graph?.areas ?? []).map((area) => area.id));
    return new Set([...collapsedAreaIds].filter((areaId) => areaIds.has(areaId)));
  }, [collapsedAreaIds, doc.graph?.areas]);

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

  const handleToggleAreaCollapsed = useCallback((areaId: string) => {
    setCollapsedAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
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
        {displayItems.map((item) =>
          item.type === 'area' ? (
            <div key={item.area.id} className="layer-area-folder">
              <button
                type="button"
                className="layer-area-folder-header"
                onClick={() => handleToggleAreaCollapsed(item.area.id)}
                aria-expanded={!activeCollapsedAreaIds.has(item.area.id)}
                aria-label={`${activeCollapsedAreaIds.has(item.area.id) ? 'Expand' : 'Collapse'} ${item.area.name}`}
                title={`${item.layers.length} layer${item.layers.length === 1 ? '' : 's'}${
                  item.graphOnlyCount > 0
                    ? `, ${item.graphOnlyCount} graph node${item.graphOnlyCount === 1 ? '' : 's'}`
                    : ''
                }`}
              >
                <span className="layer-area-caret" aria-hidden="true">
                  {activeCollapsedAreaIds.has(item.area.id) ? '+' : '-'}
                </span>
                <span className="layer-area-dot" style={{ background: item.area.color }} aria-hidden="true" />
                <span className="layer-area-name">{item.area.name}</span>
                <span className="layer-area-count">{item.layers.length}</span>
                {item.graphOnlyCount > 0 && <span className="layer-area-graph-count">+{item.graphOnlyCount}</span>}
              </button>
              {!activeCollapsedAreaIds.has(item.area.id) &&
                item.layers.map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    areas={[]}
                    nested
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
          ) : (
            <LayerRow
              key={item.layer.id}
              layer={item.layer}
              areas={item.areas}
              selected={selectedLayerId === item.layer.id}
              dragOver={dragOverId === item.layer.id}
              editing={editingId === item.layer.id}
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
          ),
        )}
      </div>
    </div>
  );
}
