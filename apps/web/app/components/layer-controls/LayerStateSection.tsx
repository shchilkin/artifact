import { useState } from 'react';

import type { Layer } from '../../types/config';
import { InspectorSection, InspectorToggle } from '../node-canvas/inspector/fields';

/**
 * Visibility and lock for the selected layer. Layers and Nodes render it after the layer's own controls, so the
 * same target has the same inspector in both modes.
 */
export function LayerStateSection({ layer, onChange }: { layer: Layer; onChange: (patch: Partial<Layer>) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <InspectorSection
      title="Layer"
      summary={layerStateSummary(layer)}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <InspectorToggle
        ariaLabel="Toggle layer visibility"
        checked={layer.visible}
        label="Visible"
        locked={layer.locked}
        onChange={(visible) => onChange({ visible })}
      />
      <InspectorToggle
        ariaLabel="Toggle layer delete and reorder lock"
        checked={layer.locked}
        label="Locked"
        locked={layer.locked}
        onChange={(locked) => onChange({ locked })}
      />
    </InspectorSection>
  );
}

function layerStateSummary(layer: Layer) {
  const visibility = layer.visible ? 'Visible' : 'Hidden';
  return layer.locked ? `${visibility} / locked` : visibility;
}
