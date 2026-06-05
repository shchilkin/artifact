import type { CSSProperties } from 'react';
import type { GraphArea, Layer } from '../../types/config';
import { GraphHelperRow } from './GraphHelperRow';
import type { LayerRowProps } from './LayerRow';
import { LayerRow } from './LayerRow';
import type { GraphHelperRowData } from './layerDisplayItems';
import type { LayerInsertAction } from './layerInsertAction';
import type { LayerDropPosition } from './useLayerDragReorder';

interface LayerAreaFolderProps {
  area: GraphArea;
  layers: Layer[];
  graphHelpers: GraphHelperRowData[];
  collapsed: boolean;
  editingArea: boolean;
  selectedActionLayerIds: string[];
  dragOverTarget: { id: string; position: LayerDropPosition } | null;
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

function pluralSuffix(count: number) {
  return count === 1 ? '' : 's';
}

function areaFolderTitle(layerCount: number, helperCount: number) {
  const layerSummary = `${layerCount} layer${pluralSuffix(layerCount)}`;
  const helperSummary = helperCount > 0 ? `, ${helperCount} graph node${pluralSuffix(helperCount)}` : '';
  return `${layerSummary}${helperSummary}`;
}

function finishAreaRename(
  areaId: string,
  value: string,
  onFinishAreaRename: LayerAreaFolderProps['onFinishAreaRename'],
) {
  onFinishAreaRename(areaId, value.trim() || null);
}

function LayerAreaName({
  area,
  editingArea,
  onStartAreaEditing,
  onFinishAreaRename,
}: Pick<LayerAreaFolderProps, 'area' | 'editingArea' | 'onStartAreaEditing' | 'onFinishAreaRename'>) {
  if (editingArea) {
    return (
      <input
        autoFocus
        defaultValue={area.name}
        className="layer-area-name-input"
        aria-label={`Rename ${area.name}`}
        onBlur={(event) => finishAreaRename(area.id, event.target.value, onFinishAreaRename)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finishAreaRename(area.id, event.currentTarget.value, onFinishAreaRename);
          if (event.key === 'Escape') onFinishAreaRename(area.id, null);
        }}
      />
    );
  }
  return (
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
  );
}

function LayerAreaFolderHeader({
  area,
  layers,
  graphHelpers,
  collapsed,
  editingArea,
  onToggleCollapsed,
  onStartAreaEditing,
  onFinishAreaRename,
  onRemoveArea,
}: Pick<
  LayerAreaFolderProps,
  | 'area'
  | 'layers'
  | 'graphHelpers'
  | 'collapsed'
  | 'editingArea'
  | 'onToggleCollapsed'
  | 'onStartAreaEditing'
  | 'onFinishAreaRename'
  | 'onRemoveArea'
>) {
  return (
    <div className="layer-area-folder-header" title={areaFolderTitle(layers.length, graphHelpers.length)}>
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
      <LayerAreaName
        area={area}
        editingArea={editingArea}
        onStartAreaEditing={onStartAreaEditing}
        onFinishAreaRename={onFinishAreaRename}
      />
      <span className="layer-area-count layer-area-summary">
        {layers.length} layer{pluralSuffix(layers.length)}
      </span>
      {graphHelpers.length > 0 && (
        <span className="layer-area-graph-count">
          +{graphHelpers.length} node{pluralSuffix(graphHelpers.length)}
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
  );
}

function LayerAreaVisibilityButton({
  area,
  layers,
  hasVisibleLayer,
  onToggleAreaVisible,
}: Pick<LayerAreaFolderProps, 'area' | 'layers' | 'onToggleAreaVisible'> & { hasVisibleLayer: boolean }) {
  return (
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
  );
}

function LayerAreaContents(props: LayerAreaFolderProps) {
  if (props.collapsed) return null;
  return (
    <>
      {props.layers.map((layer) => (
        <LayerRow
          key={layer.id}
          layer={layer}
          areas={[]}
          nested
          selected={props.selectedActionLayerIds.includes(layer.id)}
          dragOverPosition={props.dragOverTarget?.id === layer.id ? props.dragOverTarget.position : null}
          editing={props.editingId === layer.id}
          onSelect={props.onSelectLayer}
          onOpenContextMenu={props.onOpenLayerContextMenu}
          onStartEditing={props.onStartEditing}
          onFinishRename={props.onFinishRename}
          onDragStart={props.onDragStart}
          onDragOverLayer={props.onDragOverLayer}
          onDropLayer={props.onDropLayer}
          onDragEnd={props.onDragEnd}
          onToggleVisible={props.onToggleVisible}
          onDuplicateLayer={props.onDuplicateLayer}
          onRemoveLayer={props.onRemoveLayer}
          canQuickAdd={props.canQuickAddLayerAbove(layer.id)}
          onInsertLayerAbove={props.onInsertLayerAbove}
        />
      ))}
      {props.graphHelpers.map((helper) => (
        <GraphHelperRow
          key={helper.id}
          helper={helper}
          areaId={props.area.id}
          onRemoveFromArea={props.onRemoveNodesFromArea}
        />
      ))}
    </>
  );
}

export function LayerAreaFolder(props: LayerAreaFolderProps) {
  const { area, layers, graphHelpers, collapsed, editingArea } = props;
  const hasVisibleLayer = layers.some((layer) => layer.visible);
  const areaStyle = { '--layer-area-color': area.color } as CSSProperties;

  return (
    <div
      className={`layer-area-folder${collapsed ? ' layer-area-folder-collapsed' : ''}`}
      data-area-collapsed={collapsed ? 'true' : 'false'}
      style={areaStyle}
    >
      <LayerAreaFolderHeader
        area={area}
        layers={layers}
        graphHelpers={graphHelpers}
        collapsed={collapsed}
        editingArea={editingArea}
        onToggleCollapsed={props.onToggleCollapsed}
        onStartAreaEditing={props.onStartAreaEditing}
        onFinishAreaRename={props.onFinishAreaRename}
        onRemoveArea={props.onRemoveArea}
      />
      <LayerAreaVisibilityButton
        area={area}
        layers={layers}
        hasVisibleLayer={hasVisibleLayer}
        onToggleAreaVisible={props.onToggleAreaVisible}
      />
      <p className="layer-area-folder-note">Organizes nodes only. Render order stays unchanged.</p>
      <LayerAreaContents {...props} />
    </div>
  );
}
