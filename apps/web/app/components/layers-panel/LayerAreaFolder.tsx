import type { GraphArea, Layer } from '../../types/config';
import { GraphHelperRow } from './GraphHelperRow';
import type { LayerInsertAction } from './LayerQuickAddMenu';
import type { LayerRowProps } from './LayerRow';
import { LayerRow } from './LayerRow';
import type { GraphHelperRowData } from './layerDisplayItems';

interface LayerAreaFolderProps {
  area: GraphArea;
  layers: Layer[];
  graphHelpers: GraphHelperRowData[];
  collapsed: boolean;
  editingArea: boolean;
  selectedActionLayerIds: string[];
  dragOverId: string | null;
  editingId: string | null;
  onToggleCollapsed: (areaId: string) => void;
  onStartAreaEditing: (areaId: string) => void;
  onFinishAreaRename: (areaId: string, name: string | null) => void;
  onRemoveArea: (areaId: string) => void;
  onToggleAreaVisible: (layers: Layer[], visible: boolean) => void;
  onSelectLayer: LayerRowProps['onSelect'];
  onOpenLayerContextMenu: LayerRowProps['onOpenContextMenu'];
  onStartEditing: LayerRowProps['onStartEditing'];
  onFinishRename: LayerRowProps['onFinishRename'];
  onDragStart: LayerRowProps['onDragStart'];
  onDragOverLayer: LayerRowProps['onDragOverLayer'];
  onDropLayer: LayerRowProps['onDropLayer'];
  onDragEnd: LayerRowProps['onDragEnd'];
  onToggleVisible: LayerRowProps['onToggleVisible'];
  onDuplicateLayer: LayerRowProps['onDuplicateLayer'];
  onRemoveLayer: LayerRowProps['onRemoveLayer'];
  canQuickAddLayerAbove: (layerId: string) => boolean;
  onInsertLayerAbove: (id: string, action: LayerInsertAction) => void;
  onRemoveNodesFromArea: (areaId: string, ids: string[]) => void;
}

export function LayerAreaFolder({
  area,
  layers,
  graphHelpers,
  collapsed,
  editingArea,
  selectedActionLayerIds,
  dragOverId,
  editingId,
  onToggleCollapsed,
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
}: LayerAreaFolderProps) {
  const hasVisibleLayer = layers.some((layer) => layer.visible);

  return (
    <div className="layer-area-folder">
      <div
        className="layer-area-folder-header"
        title={`${layers.length} layer${layers.length === 1 ? '' : 's'}${
          graphHelpers.length > 0 ? `, ${graphHelpers.length} graph node${graphHelpers.length === 1 ? '' : 's'}` : ''
        }`}
      >
        <button
          type="button"
          className="layer-area-folder-toggle"
          onClick={() => onToggleCollapsed(area.id)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${area.name}`}
        >
          <span className="layer-area-caret" aria-hidden="true">
            {collapsed ? '+' : '-'}
          </span>
        </button>
        <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
        <span className="layer-area-folder-label">Folder</span>
        {editingArea ? (
          <input
            autoFocus
            defaultValue={area.name}
            className="layer-area-name-input"
            aria-label={`Rename ${area.name}`}
            onBlur={(event) => {
              const value = event.target.value.trim();
              onFinishAreaRename(area.id, value || null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const value = event.currentTarget.value.trim();
                onFinishAreaRename(area.id, value || null);
              } else if (event.key === 'Escape') {
                onFinishAreaRename(area.id, null);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="layer-area-name-button"
            onDoubleClick={(event) => {
              event.stopPropagation();
              onStartAreaEditing(area.id);
            }}
            title="Double-click to rename"
          >
            <span className="layer-area-name">{area.name}</span>
          </button>
        )}
        <span className="layer-area-count layer-area-summary">
          {layers.length} layer{layers.length === 1 ? '' : 's'}
        </span>
        {graphHelpers.length > 0 && (
          <span className="layer-area-graph-count">
            +{graphHelpers.length} node{graphHelpers.length === 1 ? '' : 's'}
          </span>
        )}
        <button
          type="button"
          className="layer-area-rename"
          onClick={(event) => {
            event.stopPropagation();
            onStartAreaEditing(area.id);
          }}
          aria-label={`Rename ${area.name}`}
          title="Rename area"
        >
          ✎
        </button>
        <button
          type="button"
          className="layer-area-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveArea(area.id);
          }}
          aria-label={`Ungroup ${area.name}`}
          title="Ungroup area"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className="layer-area-visibility"
        onClick={(event) => {
          event.stopPropagation();
          onToggleAreaVisible(layers, !hasVisibleLayer);
        }}
        disabled={layers.length === 0}
        aria-label={hasVisibleLayer ? `Hide ${area.name}` : `Show ${area.name}`}
        title={hasVisibleLayer ? 'Hide area layers' : 'Show area layers'}
      >
        {hasVisibleLayer ? '◉' : '○'}
      </button>
      <p className="layer-area-folder-note">Organizes nodes only. Render order stays unchanged.</p>
      {!collapsed &&
        layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            areas={[]}
            nested
            selected={selectedActionLayerIds.includes(layer.id)}
            dragOver={dragOverId === layer.id}
            editing={editingId === layer.id}
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
            canQuickAdd={canQuickAddLayerAbove(layer.id)}
            onInsertLayerAbove={onInsertLayerAbove}
          />
        ))}
      {!collapsed &&
        graphHelpers.map((helper) => (
          <GraphHelperRow key={helper.id} helper={helper} areaId={area.id} onRemoveFromArea={onRemoveNodesFromArea} />
        ))}
    </div>
  );
}
