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
        checked={layer.visible}
        label="Visible"
        locked={layer.locked}
        onChange={(visible) => onChange({ visible })}
      />
      <InspectorToggle
        checked={layer.locked}
        label="Locked"
        locked={layer.locked}
        onChange={(locked) => onChange({ locked })}
      />
      {layer.kind !== 'effect' && (
        <InspectorToggle
          checked={layer.clipToBelow === true}
          label="Clip to layer below"
          locked={layer.locked}
          onChange={(clipToBelow) => onChange({ clipToBelow })}
        />
      )}
    </InspectorSection>
  );
}

function layerStateSummary(layer: Layer) {
  const parts = [layer.visible ? 'Visible' : 'Hidden'];
  if (layer.locked) parts.push('locked');
  if (layer.kind !== 'effect' && layer.clipToBelow) parts.push('clipped');
  return parts.join(' / ');
}
