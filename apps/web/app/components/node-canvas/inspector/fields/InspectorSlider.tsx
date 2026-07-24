import { type ComponentPropsWithoutRef, useRef } from 'react';

import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { NoPan } from '../../nodes/NoPan';

export function InspectorSlider({
  label,
  value,
  valueLabel,
  min,
  max,
  step = 1,
  overrideMax,
  effectKey,
  disabled = false,
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
  disabled?: boolean;
  onInfoEnter?: (key: string, rect: DOMRect) => void;
  onInfoLeave?: () => void;
  onChange: (value: number) => void;
}) {
  const infoRef = useRef<HTMLButtonElement>(null);
  const sliderValue = Math.min(max, Math.max(min, value));
  const manualMax = overrideMax ?? max;
  const clampManualValue = (nextValue: number) => Math.min(manualMax, Math.max(min, nextValue));
  return (
    <PropertyRow
      className={`node-inspector-control${disabled ? ' node-inspector-control-disabled' : ''}`}
      label={<span className="node-inspector-label">{label}</span>}
      labelAction={
        effectKey && onInfoEnter ? (
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
        ) : undefined
      }
      value={<span className="node-inspector-value">{valueLabel ?? value}</span>}
      disabled={disabled}
    >
      <SliderInputs
        label={label}
        value={value}
        sliderValue={sliderValue}
        min={min}
        max={max}
        step={step}
        overrideMax={overrideMax}
        clampManualValue={clampManualValue}
        onChange={onChange}
      />
    </PropertyRow>
  );
}

function SliderInputs({
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  disabled,
  label,
  value,
  sliderValue,
  min,
  max,
  step,
  overrideMax,
  clampManualValue,
  onChange,
}: Pick<ComponentPropsWithoutRef<'input'>, 'aria-describedby' | 'aria-invalid' | 'disabled' | 'id'> & {
  clampManualValue: (value: number) => number;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  overrideMax?: number;
  sliderValue: number;
  step: number;
  value: number;
}) {
  return (
    <div className="node-slider-row">
      <input
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className="node-slider nodrag nopan nowheel"
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        disabled={disabled}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onWheel={stopNodeEvent}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {overrideMax ? (
        <input
          className="node-slider-number nodrag nopan nowheel"
          type="number"
          min={min}
          max={overrideMax}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={`${label} override`}
          title={`Manual override up to ${overrideMax}`}
          onPointerDown={stopNodeEvent}
          onMouseDown={stopNodeEvent}
          onClick={stopNodeEvent}
          onDoubleClick={stopNodeEvent}
          onWheel={stopNodeEvent}
          onChange={(event) => {
            if (event.target.value === '') return;
            onChange(clampManualValue(Number(event.target.value)));
          }}
        />
      ) : null}
    </div>
  );
}
