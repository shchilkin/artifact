import type { Node as RFNode } from '@xyflow/react';
import { useMemo } from 'react';

import type { CanvasGraph } from '../../../types/config';
import { getGraphAreaBounds } from './areaBounds';

interface GraphAreaOverlayProps {
  graph: CanvasGraph;
  nodes: RFNode[];
  selectedAreaId?: string | null;
  onSelectArea: (id: string) => void;
  onRemoveArea: (id: string) => void;
}

export function GraphAreaOverlay({ graph, nodes, selectedAreaId, onSelectArea, onRemoveArea }: GraphAreaOverlayProps) {
  const bounds = useMemo(() => getGraphAreaBounds(graph, nodes), [graph, nodes]);

  if (bounds.length === 0) return null;

  return (
    <div className="node-area-overlay" aria-hidden={false}>
      {bounds.map(({ area, x, y, width, height, nodeCount }) => (
        <div
          key={area.id}
          className={`node-area${area.collapsed ? ' node-area-collapsed' : ''}${
            selectedAreaId === area.id ? ' node-area-selected' : ''
          }`}
          style={{
            left: x,
            top: y,
            width,
            height,
            '--node-area-color': area.color,
          }}
        >
          <div className="node-area-label">
            <button
              type="button"
              className="node-area-select"
              onClick={(event) => {
                event.stopPropagation();
                onSelectArea(area.id);
              }}
              aria-label={`Select ${area.name}`}
            >
              <span className="node-area-name">{area.name}</span>
              <span className="node-area-count">{nodeCount}</span>
            </button>
            <button
              type="button"
              className="node-area-remove"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveArea(area.id);
              }}
              aria-label={`Remove ${area.name}`}
              title="Remove area"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
