import { memo } from 'react';
import type { GraphHelperRowData } from './layerDisplayItems';

export const GraphHelperRow = memo(function GraphHelperRow({
  helper,
  areaId,
  onRemoveFromArea,
}: {
  helper: GraphHelperRowData;
  areaId: string;
  onRemoveFromArea: (areaId: string, ids: string[]) => void;
}) {
  return (
    <div
      className="layer-graph-helper-row"
      aria-label={`${helper.label} graph node: ${helper.name}`}
      title={`${helper.label} graph node`}
    >
      <span className="layer-graph-helper-grip" aria-hidden="true">
        ·
      </span>
      <span className="layer-graph-helper-icon" aria-hidden="true">
        {helper.icon}
      </span>
      <span className="layer-graph-helper-name">{helper.name}</span>
      <span className="layer-graph-helper-kind">{helper.label}</span>
      <button
        type="button"
        className="layer-graph-helper-remove"
        onClick={() => onRemoveFromArea(areaId, [helper.id])}
        aria-label={`Remove ${helper.name} from area`}
        title="Remove from area"
      >
        ×
      </button>
    </div>
  );
});
