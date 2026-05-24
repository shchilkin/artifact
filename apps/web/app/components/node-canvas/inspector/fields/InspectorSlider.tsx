import { useRef } from 'react';

import { NoPan } from '../../nodes/NoPan';
import { InspectorLabel } from './InspectorLabel';

export function InspectorSlider({
  label,
  value,
  valueLabel,
  min,
  max,
  step = 1,
  overrideMax,
  effectKey,
  onInfoEnter,
  onInfoLeave,
  onChange,
}: {
  label: string;
  value: number;
  valueLabel?: string;
  min: number;
  max: number;
  step?: number;
  overrideMax?: number;
  effectKey?: string;
  onInfoEnter?: (key: string, rect: DOMRect) => void;
  onInfoLeave?: () => void;
  onChange: (value: number) => void;
}) {
  const infoRef = useRef<HTMLButtonElement>(null);
  const sliderValue = Math.min(max, Math.max(min, value));
  const manualMax = overrideMax ?? max;
  const clampManualValue = (nextValue: number) => Math.min(manualMax, Math.max(min, nextValue));
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
        <span className="node-inspector-value">{valueLabel ?? value}</span>
      </div>
      <div className="node-slider-row">
        <input
          className="node-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {overrideMax && (
          <input
            className="node-slider-number nodrag nopan nowheel"
            type="number"
            min={min}
            max={overrideMax}
            step={step}
            value={value}
            aria-label={`${label} override`}
            title={`Manual override up to ${overrideMax}`}
            onChange={(e) => {
              if (e.target.value === '') return;
              onChange(clampManualValue(Number(e.target.value)));
            }}
          />
        )}
      </div>
    </div>
  );
}
