import { useRef } from 'react';

import { NoPan } from '../../nodes/NoPan';
import { InspectorLabel } from './InspectorLabel';

export function InspectorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  effectKey,
  onInfoEnter,
  onInfoLeave,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  effectKey?: string;
  onInfoEnter?: (key: string, rect: DOMRect) => void;
  onInfoLeave?: () => void;
  onChange: (value: number) => void;
}) {
  const infoRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="node-inspector-control">
      <div className="node-inspector-control-header">
        <span className="node-inspector-control-label">
          <InspectorLabel>{label}</InspectorLabel>
          {effectKey && onInfoEnter && (
            <NoPan
              as="button"
              ref={infoRef}
              type="button"
              className="node-shell-action node-info-button"
              onMouseEnter={() => {
                if (infoRef.current) onInfoEnter(effectKey, infoRef.current.getBoundingClientRect());
              }}
              onMouseLeave={onInfoLeave}
              aria-label={`About ${label}`}
            >
              i
            </NoPan>
          )}
        </span>
        <span className="node-inspector-value">{value}</span>
      </div>
      <input
        className="node-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
