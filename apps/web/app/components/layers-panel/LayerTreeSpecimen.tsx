import { useId, useMemo, useState } from 'react';
import type { CanvasDocument, GraphArea, Layer } from '../../types/config';
import { buildGraphLayerTree } from '../../utils/graphLayerTree';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { EditorRowFrame, EditorRowPrimary } from '../editor-workflow/EditorRowFrame';
import { GraphLayerTreeView } from './GraphLayerTreeView';
import { type LayerPanelView, LayerPanelViewSwitch } from './LayerPanelViewSwitch';
import { LayerTreeEditStatus } from './LayerTreeEditStatus';
import { type LayerRowTreeDrag, type LayerRowTreePlacement, layerTreeItemProps } from './layerRowTree';

// `/docs/style-guide` specimen for the Layers tree: a merge folder, a mask clip, a shared source shown
// once with a reference row, an area rail, and a layer that does not reach Output; then the tree's edit
// states (drop line above and below, dragging row, moving row, blocked-edit notice). Lazy-loaded by
// the style guide so the tree stays out of that route's initial bundle.

const MERGE_ID = 'style-tree-merge';

function specimenDocument(layers: Layer[], area: GraphArea): CanvasDocument {
  return {
    global: { bg: '#101018', seed: 1, aspect: '1:1' },
    layers,
    graph: {
      edges: [
        { id: 'style-tree-a', fromId: 'style-layer-locked', fromPort: 'out', toId: MERGE_ID, toPort: 'a' },
        { id: 'style-tree-in', fromId: 'style-layer-selected', fromPort: 'out', toId: 'style-tree-mask', toPort: 'in' },
        {
          id: 'style-tree-mask',
          fromId: 'style-layer-locked',
          fromPort: 'out',
          toId: 'style-tree-mask',
          toPort: 'mask',
        },
        { id: 'style-tree-b', fromId: 'style-tree-mask', fromPort: 'out', toId: MERGE_ID, toPort: 'b' },
        { id: 'style-tree-out', fromId: MERGE_ID, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [{ id: MERGE_ID, name: 'Print glow', blendMode: 'screen', opacity: 70 }],
      colorNodes: [],
      maskNodes: [
        {
          id: 'style-tree-mask',
          name: 'Type cutout',
          mode: 'alpha',
          invert: false,
          threshold: 50,
          feather: 0,
          expand: 0,
          opacity: 100,
        },
      ],
      areas: [area],
    },
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

const noop = () => {};

function specimenDrag(state: Partial<LayerRowTreeDrag>): LayerRowTreeDrag {
  return {
    draggable: true,
    dragging: false,
    dropPosition: null,
    onDragStart: noop,
    onDragOver: noop,
    onDrop: noop,
    onDragEnd: noop,
    ...state,
  };
}

const EDIT_STATES: Array<{ name: string; label: string; drag: Partial<LayerRowTreeDrag>; moving?: boolean }> = [
  { name: 'Drop above', label: 'Drop line above a row', drag: { dropPosition: 'above' } },
  { name: 'Drop below', label: 'Drop line below a row', drag: { dropPosition: 'below' } },
  { name: 'Dragging', label: 'Row being dragged', drag: { dragging: true } },
  { name: 'Moving', label: 'Row being placed from the keyboard', drag: {}, moving: true },
];

/** Static rows in each tree edit state, and the notice a blocked edit shows. */
function LayerTreeEditStates() {
  const helpId = useId();
  return (
    <div className="style-guide-layer-tree-edits">
      <div role="tree" aria-label="Layers tree edit states" className="layer-tree">
        {EDIT_STATES.map((state, index) => {
          const placement: LayerRowTreePlacement = {
            key: `style-tree-edit-${index}`,
            level: 1,
            setSize: EDIT_STATES.length,
            posInSet: index + 1,
            focusable: index === 0,
            label: state.label,
            drag: specimenDrag(state.drag),
            moving: state.moving,
          };
          return (
            <EditorRowFrame
              key={placement.key}
              {...layerTreeItemProps(placement, false)}
              className="layer-row layer-row-tree layer-tree-node-row px-3 border-b border-border select-none"
            >
              <EditorRowPrimary>
                <span className="layer-row-name text-dim">{state.name}</span>
              </EditorRowPrimary>
            </EditorRowFrame>
          );
        })}
      </div>
      <LayerTreeEditStatus
        helpId={helpId}
        status={{ message: 'Backdrop feeds more than one input. Rewire it in Nodes.', tone: 'blocked' }}
      />
    </div>
  );
}

export default function LayerTreeSpecimen({ layers, area }: { layers: Layer[]; area: GraphArea }) {
  const doc = useMemo(() => specimenDocument(layers, area), [layers, area]);
  const tree = useMemo(() => buildGraphLayerTree(doc), [doc]);
  const [view, setView] = useState<LayerPanelView>('structure');
  const [selectedId, setSelectedId] = useState<string | null>(MERGE_ID);
  const selectedLayerIds = selectedId && layers.some((layer) => layer.id === selectedId) ? [selectedId] : [];
  return (
    <div className="style-guide-layer-tree" aria-label="Layers tree specimen">
      <LayerPanelViewSwitch value={view} onChange={setView} />
      <GraphLayerTreeView
        doc={doc}
        tree={tree}
        selectedLayerId={selectedId}
        selectedActionLayerIds={selectedLayerIds}
        editingId={null}
        onSelectLayer={(id) => setSelectedId(id)}
        onSelectNode={setSelectedId}
        onOpenLayerContextMenu={noop}
        onOpenLayerContextMenuAt={noop}
        onStartEditing={noop}
        onFinishRename={noop}
        onToggleVisible={noop}
        onDuplicateLayer={noop}
        onRemoveLayer={noop}
      />
      <LayerTreeEditStates />
    </div>
  );
}
