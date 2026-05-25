import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasDocument, EffectPreset, Layer, LayerKind } from '../../types/config';
import { canInsertLayerAbove } from '../../utils/documentCommands';
import { getLayerAreaMap } from '../../utils/layerAreas';
import type { TextPresetId } from '../../utils/textPresets';
import { EmptyLayerPanelStart } from './EmptyLayerPanelStart';
import { LayerAddMenu } from './LayerAddMenu';
import { LayerAreaFolder } from './LayerAreaFolder';
import { LayerContextMenu, type LayerContextMenuState } from './LayerContextMenu';
import type { LayerInsertAction } from './LayerQuickAddMenu';
import { LayerRow } from './LayerRow';
import { buildLayerDisplayItems } from './layerDisplayItems';
import { useLayerDragReorder } from './useLayerDragReorder';
import { useLayerSelection } from './useLayerSelection';

interface Props {
  doc: CanvasDocument;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onAddTextPreset: (preset: TextPresetId) => void;
  onInsertLayerAbove: (targetLayerId: string, action: LayerInsertAction) => void;
  onRemoveLayer: (id: string) => void;
  onReorderLayers: (newOrder: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => void;
  onToggleVisible: (id: string) => void;
  onSetLayersVisible: (ids: string[], visible: boolean) => void;
  onCreateAreaFromLayers: (ids: string[]) => void;
  onAddLayersToArea: (areaId: string, ids: string[]) => void;
  onRemoveLayersFromAreas: (ids: string[]) => void;
  onRemoveNodesFromArea: (areaId: string, ids: string[]) => void;
  onRemoveArea: (areaId: string) => void;
  onRenameArea: (areaId: string, name: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  modeSwitcher?: React.ReactNode;
}

export function LayerPanel({
  doc,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onInsertLayerAbove,
  onRemoveLayer,
  onReorderLayers,
  onToggleVisible,
  onSetLayersVisible,
  onCreateAreaFromLayers,
  onAddLayersToArea,
  onRemoveLayersFromAreas,
  onRemoveNodesFromArea,
  onRemoveArea,
  onRenameArea,
  onDuplicateLayer,
  onRenameLayer,
  modeSwitcher,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<Set<string>>(() => new Set());
  const [showAreaMenu, setShowAreaMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<LayerContextMenuState | null>(null);
  const areaButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAreaMenu) return;
    function handleOutside(event: MouseEvent) {
      if (areaButtonRef.current && !areaButtonRef.current.contains(event.target as Node)) {
        setShowAreaMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAreaMenu]);

  const displayLayers = useMemo(() => [...doc.layers].reverse(), [doc.layers]);
  const areasByLayerId = useMemo(() => getLayerAreaMap(doc.layers, doc.graph?.areas), [doc.layers, doc.graph?.areas]);
  const displayItems = useMemo(
    () => buildLayerDisplayItems(displayLayers, areasByLayerId, doc.graph),
    [areasByLayerId, displayLayers, doc.graph],
  );
  const activeCollapsedAreaIds = useMemo(() => {
    const areaIds = new Set((doc.graph?.areas ?? []).map((area) => area.id));
    return new Set([...collapsedAreaIds].filter((areaId) => areaIds.has(areaId)));
  }, [collapsedAreaIds, doc.graph?.areas]);
  const graphAreas = doc.graph?.areas ?? [];
  const quickAddLayerIds = useMemo(
    () => new Set(doc.layers.filter((layer) => canInsertLayerAbove(doc, layer.id)).map((layer) => layer.id)),
    [doc],
  );
  const canQuickAddLayerAbove = useCallback((layerId: string) => quickAddLayerIds.has(layerId), [quickAddLayerIds]);

  const { selectedActionLayerIds, setSelectedLayerIds, handleSelectLayer } = useLayerSelection({
    displayLayers,
    layers: doc.layers,
    selectedLayerId,
    onSelectLayer,
  });

  const { dragOverId, handleDragStart, handleDragOverLayer, handleDrop, handleCancelDrag } = useLayerDragReorder({
    displayLayers,
    areasByLayerId,
    onReorderLayers,
  });

  const closeLayerContextMenu = useCallback(() => setContextMenu(null), []);

  const handleOpenLayerContextMenu = useCallback(
    (id: string, event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const activeIds = selectedActionLayerIds.includes(id) ? selectedActionLayerIds : [id];
      setSelectedLayerIds(new Set(activeIds));
      onSelectLayer(id);
      setContextMenu({ x: event.clientX, y: event.clientY, ids: activeIds });
    },
    [onSelectLayer, selectedActionLayerIds, setSelectedLayerIds],
  );

  const handleFinishRename = useCallback(
    (id: string, name: string | null) => {
      if (name) onRenameLayer(id, name);
      setEditingId(null);
    },
    [onRenameLayer],
  );

  const handleFinishAreaRename = useCallback(
    (id: string, name: string | null) => {
      if (name) onRenameArea(id, name);
      setEditingAreaId(null);
    },
    [onRenameArea],
  );

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

  const handleToggleAreaVisible = useCallback(
    (layers: Layer[], visible: boolean) => {
      const ids = layers.filter((layer) => layer.visible !== visible).map((layer) => layer.id);
      if (ids.length === 0) return;
      onSetLayersVisible(ids, visible);
    },
    [onSetLayersVisible],
  );

  const handleCreateAreaFromSelection = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      onCreateAreaFromLayers(ids);
      setShowAreaMenu(false);
      setContextMenu(null);
    },
    [onCreateAreaFromLayers],
  );

  const handleAddSelectionToArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length === 0) return;
      onAddLayersToArea(areaId, ids);
      setShowAreaMenu(false);
      setContextMenu(null);
    },
    [onAddLayersToArea],
  );

  const handleRemoveSelectionFromAreas = useCallback(
    (ids: string[]) => {
      const removableIds = ids.filter((id) => areasByLayerId.has(id));
      if (removableIds.length === 0) return;
      onRemoveLayersFromAreas(removableIds);
      setShowAreaMenu(false);
      setContextMenu(null);
    },
    [areasByLayerId, onRemoveLayersFromAreas],
  );

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="layer-panel-header">
        {modeSwitcher ?? (
          <span className="font-mono text-[10px] tracking-[2.5px] uppercase font-semibold text-accent">LAYERS</span>
        )}
        <LayerAddMenu onAddLayer={onAddLayer} onAddEffectPreset={onAddEffectPreset} onAddTextPreset={onAddTextPreset} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {displayLayers.length === 0 && (
          <EmptyLayerPanelStart onAddLayer={onAddLayer} onAddEffectPreset={onAddEffectPreset} />
        )}
        {selectedActionLayerIds.length > 1 && (
          <div className="layer-selection-actions">
            <span>{selectedActionLayerIds.length} selected</span>
            <button type="button" onClick={() => handleCreateAreaFromSelection(selectedActionLayerIds)}>
              Area
            </button>
            {graphAreas.length > 0 && (
              <div ref={areaButtonRef} className="relative">
                <button type="button" onClick={() => setShowAreaMenu((value) => !value)}>
                  Add
                </button>
                {showAreaMenu && (
                  <div className="layer-area-action-menu">
                    {graphAreas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => handleAddSelectionToArea(area.id, selectedActionLayerIds)}
                      >
                        <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
                        {area.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {displayItems.map((item) =>
          item.type === 'area' ? (
            <LayerAreaFolder
              key={item.area.id}
              area={item.area}
              layers={item.layers}
              graphHelpers={item.graphHelpers}
              collapsed={activeCollapsedAreaIds.has(item.area.id)}
              editingArea={editingAreaId === item.area.id}
              selectedActionLayerIds={selectedActionLayerIds}
              dragOverId={dragOverId}
              editingId={editingId}
              onToggleCollapsed={handleToggleAreaCollapsed}
              onStartAreaEditing={setEditingAreaId}
              onFinishAreaRename={handleFinishAreaRename}
              onRemoveArea={onRemoveArea}
              onToggleAreaVisible={handleToggleAreaVisible}
              onSelectLayer={handleSelectLayer}
              onOpenLayerContextMenu={handleOpenLayerContextMenu}
              onStartEditing={setEditingId}
              onFinishRename={handleFinishRename}
              onDragStart={handleDragStart}
              onDragOverLayer={handleDragOverLayer}
              onDropLayer={handleDrop}
              onDragEnd={handleCancelDrag}
              onToggleVisible={onToggleVisible}
              onDuplicateLayer={onDuplicateLayer}
              onRemoveLayer={onRemoveLayer}
              canQuickAddLayerAbove={canQuickAddLayerAbove}
              onInsertLayerAbove={onInsertLayerAbove}
              onRemoveNodesFromArea={onRemoveNodesFromArea}
            />
          ) : (
            <LayerRow
              key={item.layer.id}
              layer={item.layer}
              areas={item.areas}
              selected={selectedActionLayerIds.includes(item.layer.id)}
              dragOver={dragOverId === item.layer.id}
              editing={editingId === item.layer.id}
              onSelect={handleSelectLayer}
              onOpenContextMenu={handleOpenLayerContextMenu}
              onStartEditing={setEditingId}
              onFinishRename={handleFinishRename}
              onDragStart={handleDragStart}
              onDragOverLayer={handleDragOverLayer}
              onDropLayer={handleDrop}
              onDragEnd={handleCancelDrag}
              onToggleVisible={onToggleVisible}
              onDuplicateLayer={onDuplicateLayer}
              onRemoveLayer={onRemoveLayer}
              canQuickAdd={canQuickAddLayerAbove(item.layer.id)}
              onInsertLayerAbove={onInsertLayerAbove}
            />
          ),
        )}
      </div>
      <LayerContextMenu
        contextMenu={contextMenu}
        graphAreas={graphAreas}
        hasAreaMembership={(id) => areasByLayerId.has(id)}
        onClose={closeLayerContextMenu}
        onCreateAreaFromSelection={handleCreateAreaFromSelection}
        onAddSelectionToArea={handleAddSelectionToArea}
        onRemoveSelectionFromAreas={handleRemoveSelectionFromAreas}
      />
    </div>
  );
}
