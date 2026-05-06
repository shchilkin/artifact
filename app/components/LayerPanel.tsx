import { useRef, useState } from 'react';
import type { CanvasDocument, EffectLayer, EffectPreset, Layer, LayerKind } from '../types/config';
import { EFFECT_PRESETS } from '../types/config';

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
}

const KIND_ICONS: Record<LayerKind, string> = {
  text: 'T',
  image: '◻',
  emoji: '✦',
  effect: 'FX',
  fill: '■',
};

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
}: Props) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragLayerId = useRef<string | null>(null);

  const displayLayers = [...doc.layers].reverse();

  const handleDragStart = (id: string) => {
    dragLayerId.current = id;
  };

  const handleDrop = (targetId: string) => {
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
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-3.5 min-h-11 border-b border-border flex-shrink-0">
        <span className="font-mono text-[10px] tracking-[2.5px] uppercase font-semibold text-accent">LAYERS</span>
        <div className="relative">
          <button
            className="px-2 py-1 font-mono text-[10px] border border-border text-dim hover:text-accent hover:border-accent cursor-pointer bg-transparent"
            onClick={() => setShowAddMenu((prev) => !prev)}
            aria-label="Add layer"
          >
            + ADD
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 bg-bg border border-border z-50 min-w-[130px]">
              {(['text', 'image', 'emoji', 'fill'] as Exclude<LayerKind, 'effect'>[]).map((kind) => (
                <button
                  key={kind}
                  className="flex items-center gap-2 w-full px-3 py-2 font-mono text-[10px] text-left text-dim hover:text-accent hover:bg-accent-dim border-none bg-transparent cursor-pointer"
                  onClick={() => { onAddLayer(kind); setShowAddMenu(false); }}
                >
                  <span className="text-accent w-4 text-center">{KIND_ICONS[kind]}</span>
                  {kind.toUpperCase()}
                </button>
              ))}
              <div className="border-t border-border my-1" />
              {(Object.entries(EFFECT_PRESETS) as [EffectPreset, typeof EFFECT_PRESETS[EffectPreset]][]).map(([key, preset]) => (
                <button
                  key={key}
                  className="flex items-center gap-2 w-full px-3 py-2 font-mono text-[10px] text-left text-dim hover:text-accent hover:bg-accent-dim border-none bg-transparent cursor-pointer"
                  onClick={() => { onAddEffectPreset(key); setShowAddMenu(false); }}
                >
                  <span className="text-accent w-4 text-center">{preset.icon}</span>
                  {preset.name.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {displayLayers.length === 0 && (
          <div className="px-3.5 py-4 text-[10px] text-dim text-center font-mono">No layers. Add one above.</div>
        )}
        {displayLayers.map((layer) => (
          <div
            key={layer.id}
            draggable
            onDragStart={() => handleDragStart(layer.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId(layer.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(layer.id);
            }}
            onDragEnd={() => setDragOverId(null)}
            onClick={() => onSelectLayer(selectedLayerId === layer.id ? null : layer.id)}
            onDoubleClick={() => {
              const nextName = window.prompt('Rename layer', layer.name);
              if (nextName && nextName.trim()) onRenameLayer(layer.id, nextName.trim());
            }}
            className={`flex items-center gap-2 px-3 min-h-[36px] cursor-pointer border-b border-border select-none transition-colors ${
              selectedLayerId === layer.id ? 'bg-accent-dim' : 'hover:bg-accent-dim/50'
            } ${dragOverId === layer.id ? 'border-t-2 border-t-accent' : ''}`}
          >
            <span className="text-dim text-[10px] cursor-grab active:cursor-grabbing flex-shrink-0">⠿</span>
            <span className={`font-mono text-[11px] font-bold flex-shrink-0 w-5 text-center ${layer.kind === 'effect' ? 'text-accent' : 'text-dim'}`}>
              {layer.kind === 'effect'
                ? EFFECT_PRESETS[(layer as EffectLayer).preset!]?.icon ?? 'FX'
                : KIND_ICONS[layer.kind]}
            </span>
            <span className={`font-mono text-[10px] flex-1 truncate ${selectedLayerId === layer.id ? 'text-text' : 'text-dim'}`}>
              {layer.name}
            </span>
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
        ))}
      </div>
    </div>
  );
}
