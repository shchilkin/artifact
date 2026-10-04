import { useMemo, useState } from 'react';
import type { CanvasDocument, GraphArea, Layer } from '../../types/config';
import { buildGraphLayerTree } from '../../utils/graphLayerTree';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { GraphLayerTreeView } from './GraphLayerTreeView';
import { type LayerPanelView, LayerPanelViewSwitch } from './LayerPanelViewSwitch';

// `/docs/style-guide` specimen for the Layers tree: a merge folder, a mask clip, a shared source shown
// once with a reference row, an area rail, and a layer that does not reach Output. Lazy-loaded by the
// style guide so the tree stays out of that route's initial bundle.

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
    </div>
  );
}
