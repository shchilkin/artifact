import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasDocument, EffectPreset, GraphArea, GraphScene3DNode, Layer, LayerKind } from '../../types/config';
import type { ArrayPresetId } from '../../utils/arrayPresets';
import { canInsertLayerAbove } from '../../utils/documentCommands';
import { getLayerAreaMap } from '../../utils/layerAreas';
import type { NoisePresetId } from '../../utils/noisePresets';
import { getSceneEnvironmentNode, getSceneModelLayer, isSceneModelInputLayer } from '../../utils/scene3DInputs';
import type { TextPresetId } from '../../utils/textPresets';
import { EmptyLayerPanelStart } from './EmptyLayerPanelStart';
import { LayerAddMenu } from './LayerAddMenu';
import { LayerAreaFolder } from './LayerAreaFolder';
import { LayerContextMenu, type LayerContextMenuState } from './LayerContextMenu';
import { LayerRow } from './LayerRow';
import { buildLayerDisplayItems, type LayerDisplayItem } from './layerDisplayItems';
import type { LayerInsertAction } from './layerInsertAction';
import { useLayerDragReorder } from './useLayerDragReorder';
import { useLayerSelection } from './useLayerSelection';

export interface LayerPanelProps {
  doc: CanvasDocument;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onAddTextPreset: (preset: TextPresetId) => void;
  onAddNoisePreset: (preset: NoisePresetId) => void;
  onAddArrayPreset: (preset: ArrayPresetId) => void;
  onAddScene3D: () => void;
  onStartAiImage?: () => void;
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

function graphAreasForDocument(doc: CanvasDocument) {
  return doc.graph?.areas ?? [];
}

function activeLayerPanelCollapsedAreaIds(collapsedAreaIds: Set<string>, graphAreas: GraphArea[]) {
  const areaIds = new Set(graphAreas.map((area) => area.id));
  return new Set([...collapsedAreaIds].filter((areaId) => areaIds.has(areaId)));
}

function quickAddLayerIdsForDocument(doc: CanvasDocument) {
  return new Set(doc.layers.filter((layer) => canInsertLayerAbove(doc, layer.id)).map((layer) => layer.id));
}

export function LayerPanel({
  doc,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onAddNoisePreset,
  onAddArrayPreset,
  onAddScene3D,
  onStartAiImage,
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
}: LayerPanelProps) {
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

  const displayLayers = useMemo(
    () => [...doc.layers].reverse().filter((layer) => !isSceneModelInputLayer(layer, doc.graph)),
    [doc.layers, doc.graph],
  );
  const areasByLayerId = useMemo(() => getLayerAreaMap(doc.layers, doc.graph?.areas), [doc.layers, doc.graph?.areas]);
  const displayItems = useMemo(
    () => buildLayerDisplayItems(displayLayers, areasByLayerId, doc.graph),
    [areasByLayerId, displayLayers, doc.graph],
  );
  const graphAreas = useMemo(() => graphAreasForDocument(doc), [doc]);
  const activeCollapsedAreaIds = useMemo(
    () => activeLayerPanelCollapsedAreaIds(collapsedAreaIds, graphAreas),
    [collapsedAreaIds, graphAreas],
  );
  const quickAddLayerIds = useMemo(() => quickAddLayerIdsForDocument(doc), [doc]);
  const canQuickAddLayerAbove = useCallback((layerId: string) => quickAddLayerIds.has(layerId), [quickAddLayerIds]);

  const { selectedActionLayerIds, setSelectedLayerIds, handleSelectLayer } = useLayerSelection({
    displayLayers,
    layers: doc.layers,
    selectedLayerId,
    onSelectLayer,
  });

  const { dragOverTarget, handleDragStart, handleDragOverLayer, handleDrop, handleCancelDrag } = useLayerDragReorder({
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
      <LayerPanelHeader
        modeSwitcher={modeSwitcher}
        onAddLayer={onAddLayer}
        onAddEffectPreset={onAddEffectPreset}
        onAddTextPreset={onAddTextPreset}
        onAddNoisePreset={onAddNoisePreset}
        onAddArrayPreset={onAddArrayPreset}
        onAddScene3D={onAddScene3D}
        onStartAiImage={onStartAiImage}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <LayerPanelEmptyState visible={displayLayers.length === 0} />
        <LayerSelectionActions
          selectedActionLayerIds={selectedActionLayerIds}
          graphAreas={graphAreas}
          showAreaMenu={showAreaMenu}
          areaButtonRef={areaButtonRef}
          onToggleAreaMenu={() => setShowAreaMenu((value) => !value)}
          onCreateAreaFromSelection={handleCreateAreaFromSelection}
          onAddSelectionToArea={handleAddSelectionToArea}
        />
        <Scene3DLayerRows doc={doc} selectedLayerId={selectedLayerId} onSelectLayer={onSelectLayer} />
        {displayItems.map((item) => (
          <LayerDisplayEntry
            key={item.type === 'area' ? item.area.id : item.layer.id}
            item={item}
            activeCollapsedAreaIds={activeCollapsedAreaIds}
            editingAreaId={editingAreaId}
            selectedActionLayerIds={selectedActionLayerIds}
            dragOverTarget={dragOverTarget}
            editingId={editingId}
            onToggleAreaCollapsed={handleToggleAreaCollapsed}
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
        ))}
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

function LayerPanelHeader({
  modeSwitcher,
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onAddNoisePreset,
  onAddArrayPreset,
  onAddScene3D,
  onStartAiImage,
}: {
  modeSwitcher?: React.ReactNode;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onAddTextPreset: (preset: TextPresetId) => void;
  onAddNoisePreset: (preset: NoisePresetId) => void;
  onAddArrayPreset: (preset: ArrayPresetId) => void;
  onAddScene3D: () => void;
  onStartAiImage?: () => void;
}) {
  return (
    <div className="layer-panel-header">
      {modeSwitcher ?? (
        <span className="font-mono text-[10px] tracking-[2.5px] uppercase font-semibold text-accent">LAYERS</span>
      )}
      <LayerAddMenu
        onAddLayer={onAddLayer}
        onAddEffectPreset={onAddEffectPreset}
        onAddTextPreset={onAddTextPreset}
        onAddNoisePreset={onAddNoisePreset}
        onAddArrayPreset={onAddArrayPreset}
        onAddScene3D={onAddScene3D}
        onStartAiImage={onStartAiImage}
      />
    </div>
  );
}

function LayerPanelEmptyState({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <EmptyLayerPanelStart />;
}

function LayerSelectionActions({
  selectedActionLayerIds,
  graphAreas,
  showAreaMenu,
  areaButtonRef,
  onToggleAreaMenu,
  onCreateAreaFromSelection,
  onAddSelectionToArea,
}: {
  selectedActionLayerIds: string[];
  graphAreas: GraphArea[];
  showAreaMenu: boolean;
  areaButtonRef: React.RefObject<HTMLDivElement | null>;
  onToggleAreaMenu: () => void;
  onCreateAreaFromSelection: (ids: string[]) => void;
  onAddSelectionToArea: (areaId: string, ids: string[]) => void;
}) {
  if (selectedActionLayerIds.length <= 1) return null;
  return (
    <div className="layer-selection-actions">
      <span>{selectedActionLayerIds.length} selected</span>
      <button type="button" onClick={() => onCreateAreaFromSelection(selectedActionLayerIds)}>
        Area
      </button>
      {graphAreas.length > 0 && (
        <div ref={areaButtonRef} className="relative">
          <button type="button" onClick={onToggleAreaMenu}>
            Add
          </button>
          {showAreaMenu && (
            <div className="layer-area-action-menu">
              {graphAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => onAddSelectionToArea(area.id, selectedActionLayerIds)}
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
  );
}

function LayerDisplayEntry({
  item,
  activeCollapsedAreaIds,
  editingAreaId,
  selectedActionLayerIds,
  dragOverTarget,
  editingId,
  onToggleAreaCollapsed,
  onStartAreaEditing,
  onFinishAreaRename,
  onRemoveArea,
  onToggleAreaVisible,
  onSelectLayer,
  onOpenLayerContextMenu,
  onStartEditing,
  onFinishRename,
  onDragStart,
  onDragOverLayer,
  onDropLayer,
  onDragEnd,
  onToggleVisible,
  onDuplicateLayer,
  onRemoveLayer,
  canQuickAddLayerAbove,
  onInsertLayerAbove,
  onRemoveNodesFromArea,
}: {
  item: LayerDisplayItem;
  activeCollapsedAreaIds: Set<string>;
  editingAreaId: string | null;
  selectedActionLayerIds: string[];
  dragOverTarget: { id: string; position: 'before' | 'after' } | null;
  editingId: string | null;
  onToggleAreaCollapsed: (areaId: string) => void;
  onStartAreaEditing: (id: string | null) => void;
  onFinishAreaRename: (id: string, name: string | null) => void;
  onRemoveArea: (areaId: string) => void;
  onToggleAreaVisible: (layers: Layer[], visible: boolean) => void;
  onSelectLayer: (id: string, event?: ReactMouseEvent<HTMLDivElement>) => void;
  onOpenLayerContextMenu: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartEditing: (id: string | null) => void;
  onFinishRename: (id: string, name: string | null) => void;
  onDragStart: (layer: Layer) => void;
  onDragOverLayer: (layer: Layer, event: React.DragEvent<HTMLDivElement>) => void;
  onDropLayer: (layer: Layer, event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onToggleVisible: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRemoveLayer: (id: string) => void;
  canQuickAddLayerAbove: (layerId: string) => boolean;
  onInsertLayerAbove: (targetLayerId: string, action: LayerInsertAction) => void;
  onRemoveNodesFromArea: (areaId: string, ids: string[]) => void;
}) {
  if (item.type === 'area') {
    return (
      <LayerAreaFolder
        area={item.area}
        layers={item.layers}
        graphHelpers={item.graphHelpers}
        collapsed={activeCollapsedAreaIds.has(item.area.id)}
        editingArea={editingAreaId === item.area.id}
        selectedActionLayerIds={selectedActionLayerIds}
        dragOverTarget={dragOverTarget}
        editingId={editingId}
        onToggleCollapsed={onToggleAreaCollapsed}
        onStartAreaEditing={onStartAreaEditing}
        onFinishAreaRename={onFinishAreaRename}
        onRemoveArea={onRemoveArea}
        onToggleAreaVisible={onToggleAreaVisible}
        onSelectLayer={onSelectLayer}
        onOpenLayerContextMenu={onOpenLayerContextMenu}
        onStartEditing={onStartEditing}
        onFinishRename={onFinishRename}
        onDragStart={onDragStart}
        onDragOverLayer={onDragOverLayer}
        onDropLayer={onDropLayer}
        onDragEnd={onDragEnd}
        onToggleVisible={onToggleVisible}
        onDuplicateLayer={onDuplicateLayer}
        onRemoveLayer={onRemoveLayer}
        canQuickAddLayerAbove={canQuickAddLayerAbove}
        onInsertLayerAbove={onInsertLayerAbove}
        onRemoveNodesFromArea={onRemoveNodesFromArea}
      />
    );
  }

  return (
    <LayerRow
      layer={item.layer}
      areas={item.areas}
      selected={selectedActionLayerIds.includes(item.layer.id)}
      dragOverPosition={dragOverTarget?.id === item.layer.id ? dragOverTarget.position : null}
      editing={editingId === item.layer.id}
      onSelect={onSelectLayer}
      onOpenContextMenu={onOpenLayerContextMenu}
      onStartEditing={onStartEditing}
      onFinishRename={onFinishRename}
      onDragStart={onDragStart}
      onDragOverLayer={onDragOverLayer}
      onDropLayer={onDropLayer}
      onDragEnd={onDragEnd}
      onToggleVisible={onToggleVisible}
      onDuplicateLayer={onDuplicateLayer}
      onRemoveLayer={onRemoveLayer}
      canQuickAdd={canQuickAddLayerAbove(item.layer.id)}
      onInsertLayerAbove={onInsertLayerAbove}
    />
  );
}

function Scene3DLayerRows({
  doc,
  selectedLayerId,
  onSelectLayer,
}: {
  doc: CanvasDocument;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
}) {
  const scenes = doc.graph?.scene3dNodes ?? [];
  if (scenes.length === 0) return null;
  return (
    <>
      {scenes.map((scene) => (
        <Scene3DLayerRow
          key={scene.id}
          scene={scene}
          doc={doc}
          selected={selectedLayerId === scene.id}
          onSelectLayer={onSelectLayer}
        />
      ))}
    </>
  );
}

function Scene3DLayerRow({
  scene,
  doc,
  selected,
  onSelectLayer,
}: {
  scene: GraphScene3DNode;
  doc: CanvasDocument;
  selected: boolean;
  onSelectLayer: (id: string | null) => void;
}) {
  const model = getSceneModelLayer(doc.graph, doc.layers, scene.id);
  const environment = getSceneEnvironmentNode(doc.graph, scene.id);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      data-layer-id={scene.id}
      className={`layer-row flex items-center gap-2 px-3 min-h-[36px] cursor-pointer border-b border-border select-none transition-colors ${
        selected ? 'bg-accent-dim layer-row-selected' : 'hover:bg-accent-dim/50'
      }`}
      onClick={() => onSelectLayer(scene.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectLayer(scene.id);
        }
      }}
    >
      <span className="layer-row-drag-handle text-dim text-[10px] flex-shrink-0" aria-hidden="true">
        ·
      </span>
      <span className="font-mono text-[10px] flex-shrink-0 w-5 text-center text-accent" style={{ fontWeight: 700 }}>
        ◌
      </span>
      <span className={`font-mono text-[10px] flex-1 truncate min-w-0 ${selected ? 'text-text' : 'text-dim'}`}>
        {scene.name}
      </span>
      <span className="layer-meta-badge" title="3D model and environment are edited from this scene layer">
        3D Scene
      </span>
      {model && (
        <span className="layer-area-chip" title={model.modelName} aria-label={`Model: ${model.modelName}`}>
          model
        </span>
      )}
      {(environment || scene.environmentName) && (
        <span
          className="layer-area-chip"
          title={environment?.environmentName || scene.environmentName}
          aria-label={`Environment: ${environment?.environmentName || scene.environmentName}`}
        >
          env
        </span>
      )}
    </div>
  );
}
