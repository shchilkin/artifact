import { type ComponentPropsWithoutRef, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { createCoalescedCommit } from '../../../../utils/coalescedCommit';
import { PREVIEW_FRAME_INTERVAL_MS } from '../../../../utils/interactionTiming';
import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { NoPan } from '../../nodes/NoPan';
import { InspectorTargetContext } from './inspectorTargetContext';

/**
 * The slider shows every value at once and updates the document at most once per preview frame interval, so a drag
 * does not re-render the editor on every pointer move. A change after a pause goes through immediately. A value
 * still waiting goes to the target it was made on: when the gesture ends, the inspector switches to another layer
 * or node, or the slider unmounts.
 */
function useCoalescedSliderValue(value: number, onChange: (value: number) => void) {
  const [draft, setDraft] = useState<number | null>(null);
  const [coalesced] = useState(() =>
    createCoalescedCommit({ intervalMs: PREVIEW_FRAME_INTERVAL_MS, onPendingChange: setDraft }),
  );
  const target = useContext(InspectorTargetContext);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a target change is what flushes the waiting value
  useLayoutEffect(() => coalesced.flush(), [coalesced, target]);
  useEffect(() => coalesced.flush, [coalesced]);

  return {
    displayValue: draft ?? value,
    change: (nextValue: number) => coalesced.change(nextValue, onChange),
    flush: coalesced.flush,
  };
}

export function InspectorSlider({
  label,
  value,
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
  /** Formats the shown value, including a value still being dragged. */
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
  const shownLabel = formatValue ? formatValue(displayValue) : displayValue;
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
          onBlur={onCommit}
        />
      ) : null}
    </div>
  );
}
