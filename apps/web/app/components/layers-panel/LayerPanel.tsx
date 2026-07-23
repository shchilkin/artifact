import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type {
  AspectRatio,
  CanvasDocument,
  EffectPreset,
  GraphArea,
  GraphScene3DNode,
  Layer,
  LayerKind,
} from '../../types/config';
import type { ArrayPresetId } from '../../utils/arrayPresets';
import { getLayerAreaMap } from '../../utils/layerAreas';
import type { NoisePresetId } from '../../utils/noisePresets';
import { getSceneEnvironmentNode, getSceneModelLayer, isSceneModelInputLayer } from '../../utils/scene3DInputs';
import type { TextPresetId } from '../../utils/textPresets';
import { EditorCommandGroup } from '../editor-workflow/EditorCommandGroup';
import {
  EditorRowFrame,
  EditorRowLeading,
  EditorRowMetadata,
  EditorRowPrimary,
} from '../editor-workflow/EditorRowFrame';
import { ActionButton } from '../ui/ActionButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { EmptyLayerPanelStart } from './EmptyLayerPanelStart';
import { LayerAddMenu } from './LayerAddMenu';
import { LayerAreaFolder } from './LayerAreaFolder';
import { LayerContextMenu, type LayerContextMenuState } from './LayerContextMenu';
import { LayerRow, LayerSelectionControl } from './LayerRow';
import { buildLayerDisplayItems, type LayerDisplayItem } from './layerDisplayItems';
import { useLayerDragReorder } from './useLayerDragReorder';
import { type LayerSelectionModifiers, useLayerSelection } from './useLayerSelection';

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
  onAspectChange: (aspect: AspectRatio) => void;
  modeSwitcher?: React.ReactNode;
}

const ASPECT_OPTIONS: Array<{ ratio: AspectRatio; label: string; size: string }> = [
  { ratio: '1:1', label: 'Square', size: '1000 x 1000' },
  { ratio: '4:5', label: 'Portrait', size: '1080 x 1350' },
  { ratio: '9:16', label: 'Story', size: '1080 x 1920' },
  { ratio: '16:9', label: 'Wide', size: '1920 x 1080' },
];

function graphAreasForDocument(doc: CanvasDocument) {
  return doc.graph?.areas ?? [];
}

function activeLayerPanelCollapsedAreaIds(collapsedAreaIds: Set<string>, graphAreas: GraphArea[]) {
  const areaIds = new Set(graphAreas.map((area) => area.id));
  return new Set([...collapsedAreaIds].filter((areaId) => areaIds.has(areaId)));
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
  onAspectChange,
  modeSwitcher,
}: LayerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<LayerContextMenuState | null>(null);

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
    (id: string, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      const activeIds = selectedActionLayerIds.includes(id) ? selectedActionLayerIds : [id];
      const returnFocusTarget =
        event.currentTarget.closest('.layer-row')?.querySelector<HTMLElement>('.layer-row-selection-control') ??
        event.currentTarget;
      setSelectedLayerIds(new Set(activeIds));
      onSelectLayer(id);
      setContextMenu({ x: event.clientX, y: event.clientY, ids: activeIds, returnFocusTarget });
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
      setContextMenu(null);
    },
    [onCreateAreaFromLayers],
  );

  const handleAddSelectionToArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length === 0) return;
      onAddLayersToArea(areaId, ids);
      setContextMenu(null);
    },
    [onAddLayersToArea],
  );

  const handleRemoveSelectionFromAreas = useCallback(
    (ids: string[]) => {
      const removableIds = ids.filter((id) => areasByLayerId.has(id));
      if (removableIds.length === 0) return;
      onRemoveLayersFromAreas(removableIds);
      setContextMenu(null);
    },
    [areasByLayerId, onRemoveLayersFromAreas],
  );

  const handleClearLayerSelection = useCallback(() => {
    setSelectedLayerIds(new Set());
    onSelectLayer(null);
  }, [onSelectLayer, setSelectedLayerIds]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <LayerPanelHeader
        aspect={doc.global.aspect ?? '1:1'}
        modeSwitcher={modeSwitcher}
        onAspectChange={onAspectChange}
        onAddLayer={onAddLayer}
        onAddEffectPreset={onAddEffectPreset}
        onAddTextPreset={onAddTextPreset}
        onAddNoisePreset={onAddNoisePreset}
        onAddArrayPreset={onAddArrayPreset}
        onAddScene3D={onAddScene3D}
        onStartAiImage={onStartAiImage}
      />

      <div
        className="layer-panel-list flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        role="list"
        aria-label="Layer stack"
      >
        <LayerPanelEmptyState visible={displayLayers.length === 0} />
        <LayerSelectionActions
          selectedActionLayerIds={selectedActionLayerIds}
          graphAreas={graphAreas}
          hasAreaMembership={selectedActionLayerIds.some((id) => areasByLayerId.has(id))}
          onCreateAreaFromSelection={handleCreateAreaFromSelection}
          onAddSelectionToArea={handleAddSelectionToArea}
          onRemoveSelectionFromAreas={handleRemoveSelectionFromAreas}
          onClearSelection={handleClearLayerSelection}
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
            onRemoveNodesFromArea={onRemoveNodesFromArea}
          />
        ))}
      </div>
      <LayerContextMenu
        contextMenu={contextMenu}
        graphAreas={graphAreas}
        hasAreaMembership={(id) => areasByLayerId.has(id)}
        layers={doc.layers}
        onClose={closeLayerContextMenu}
        onDuplicateLayers={(ids) => ids.forEach(onDuplicateLayer)}
        onRemoveLayers={(ids) => ids.forEach(onRemoveLayer)}
        onCreateAreaFromSelection={handleCreateAreaFromSelection}
        onAddSelectionToArea={handleAddSelectionToArea}
        onRemoveSelectionFromAreas={handleRemoveSelectionFromAreas}
        onRenameLayer={setEditingId}
        onSetLayersVisible={onSetLayersVisible}
      />
    </div>
  );
}

function LayerAspectMenu({ aspect, onChange }: { aspect: AspectRatio; onChange: (aspect: AspectRatio) => void }) {
  const current = ASPECT_OPTIONS.find((option) => option.ratio === aspect) ?? ASPECT_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="layer-aspect-button"
          aria-label={`Change canvas aspect ratio. Current ${current.ratio} ${current.label}`}
          title={`Canvas aspect: ${current.ratio} ${current.label}`}
        >
          Aspect
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="layer-aspect-menu">
        {ASPECT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.ratio}
            className="layer-aspect-menu-item"
            onSelect={() => onChange(option.ratio)}
          >
            <span className="layer-aspect-menu-item__ratio">{option.ratio}</span>
            <span className="layer-aspect-menu-item__label">{option.label}</span>
            <span className="layer-aspect-menu-item__size">{option.size}</span>
            {aspect === option.ratio && (
              <span className="layer-aspect-menu-item__active" aria-hidden="true">
                *
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LayerPanelHeader({
  aspect,
  modeSwitcher,
  onAspectChange,
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onAddNoisePreset,
  onAddArrayPreset,
  onAddScene3D,
  onStartAiImage,
}: {
  aspect: AspectRatio;
  modeSwitcher?: React.ReactNode;
  onAspectChange: (aspect: AspectRatio) => void;
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
      {modeSwitcher ?? <span className="layer-panel-title">LAYERS</span>}
      <div className="layer-panel-actions">
        <LayerAspectMenu aspect={aspect} onChange={onAspectChange} />
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
  hasAreaMembership,
  onCreateAreaFromSelection,
  onAddSelectionToArea,
  onRemoveSelectionFromAreas,
  onClearSelection,
}: {
  selectedActionLayerIds: string[];
  graphAreas: GraphArea[];
  hasAreaMembership: boolean;
  onCreateAreaFromSelection: (ids: string[]) => void;
  onAddSelectionToArea: (areaId: string, ids: string[]) => void;
  onRemoveSelectionFromAreas: (ids: string[]) => void;
  onClearSelection: () => void;
}) {
  if (selectedActionLayerIds.length <= 1) return null;
  return (
    <EditorCommandGroup className="layer-selection-actions" label="Selected layer actions">
      <span>{selectedActionLayerIds.length} selected</span>
      <ActionButton variant="quiet" onClick={() => onCreateAreaFromSelection(selectedActionLayerIds)}>
        Area
      </ActionButton>
      {graphAreas.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ActionButton variant="quiet">Add</ActionButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="layer-area-dropdown-menu">
            {graphAreas.map((area) => (
              <DropdownMenuItem key={area.id} onSelect={() => onAddSelectionToArea(area.id, selectedActionLayerIds)}>
                <span className="layer-area-action-menu__item">
                  <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
                  {area.name}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {hasAreaMembership ? (
        <ActionButton variant="quiet" onClick={() => onRemoveSelectionFromAreas(selectedActionLayerIds)}>
          Remove from area
        </ActionButton>
      ) : null}
      <ActionButton variant="quiet" onClick={onClearSelection}>
        Clear selection
      </ActionButton>
    </EditorCommandGroup>
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
  onSelectLayer: (id: string, event: LayerSelectionModifiers) => void;
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
    <EditorRowFrame
      role="listitem"
      selected={selected}
      data-layer-id={scene.id}
      className={`layer-row layer-row-kind-primitive flex items-center gap-2 px-3 min-h-[48px] cursor-pointer border-b border-border select-none transition-colors ${
        selected ? 'bg-accent-dim layer-row-selected' : 'hover:bg-accent-dim/50'
      }`}
      onClick={() => onSelectLayer(scene.id)}
    >
      <EditorRowLeading>
        <LayerSelectionControl
          label={`Select ${scene.name} scene layer`}
          selected={selected}
          onSelect={() => onSelectLayer(scene.id)}
        />
        <span className="layer-row-drag-handle text-dim text-[10px] flex-shrink-0" aria-hidden="true">
          ·
        </span>
        <span className="font-mono text-[10px] flex-shrink-0 w-5 text-center text-accent" style={{ fontWeight: 700 }}>
          ◌
        </span>
      </EditorRowLeading>
      <EditorRowPrimary>
        <span className={`font-mono text-[10px] flex-1 truncate min-w-0 ${selected ? 'text-text' : 'text-dim'}`}>
          {scene.name}
        </span>
      </EditorRowPrimary>
      <EditorRowMetadata>
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
      </EditorRowMetadata>
    </EditorRowFrame>
  );
}
