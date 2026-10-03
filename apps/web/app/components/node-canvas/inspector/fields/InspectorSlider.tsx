import { type ComponentPropsWithoutRef, useEffect, useRef, useState } from 'react';

import { useStableCallback } from '../../../../hooks/useStableCallback';
import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { NoPan } from '../../nodes/NoPan';
import { createCoalescedCommit } from './coalescedCommit';

/**
 * Shortest time between two document updates from one slider. The layer preview renders at most this often during a
 * drag, so updating the document (and re-rendering the editor) on every pointer move in between does nothing visible.
 */
const SLIDER_COMMIT_INTERVAL_MS = 66;

/**
 * The slider shows every value at once and passes it on through a coalesced commit, so a drag updates the document
 * at the preview's frame rate rather than on every pointer move.
 */
function useCoalescedSliderValue(value: number, onChange: (value: number) => void) {
  const [draft, setDraft] = useState<number | null>(null);
  const commitChange = useStableCallback(onChange);
  const [coalesced] = useState(() =>
    createCoalescedCommit({ intervalMs: SLIDER_COMMIT_INTERVAL_MS, commit: commitChange, onPendingChange: setDraft }),
  );

  // A value still waiting when the slider goes away (selection change, panel close) is not lost.
  useEffect(() => coalesced.flush, [coalesced]);

  return { displayValue: draft ?? value, change: coalesced.change, flush: coalesced.flush };
}

export function InspectorSlider({
  label,
  value,
  valueLabel,
  formatValue,
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
  /** Formats the shown value; preferred over `valueLabel`, because it also formats a value still being dragged. */
  formatValue?: (value: number) => string;
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
  const { displayValue, change, flush } = useCoalescedSliderValue(value, onChange);
  const sliderValue = Math.min(max, Math.max(min, displayValue));
  const shownLabel = formatValue
    ? formatValue(displayValue)
    : displayValue === value && valueLabel !== undefined
      ? valueLabel
      : displayValue;
  const manualMax = overrideMax ?? max;
  const clampManualValue = (nextValue: number) => Math.min(manualMax, Math.max(min, nextValue));
  return (
    <PropertyRow
      className={`artifact-inspector-control${disabled ? ' artifact-inspector-control-disabled' : ''}`}
      label={<span className="artifact-inspector-label">{label}</span>}
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
      value={<span className="artifact-inspector-value">{shownLabel}</span>}
      disabled={disabled}
    >
      <SliderInputs
        label={label}
        value={displayValue}
        sliderValue={sliderValue}
        min={min}
        max={max}
        step={step}
        overrideMax={overrideMax}
        clampManualValue={clampManualValue}
        onChange={change}
        onCommit={flush}
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
  onCommit,
}: Pick<ComponentPropsWithoutRef<'input'>, 'aria-describedby' | 'aria-invalid' | 'disabled' | 'id'> & {
  clampManualValue: (value: number) => number;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  /** The gesture ended: pass on a value that is still waiting. */
  onCommit: () => void;
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
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
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
