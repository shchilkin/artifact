import { type ComponentPropsWithoutRef, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { createCoalescedCommit } from '../../../../utils/coalescedCommit';
import { PREVIEW_FRAME_INTERVAL_MS } from '../../../../utils/interactionTiming';
import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { NoPan } from '../../nodes/NoPan';
import { InspectorTargetContext } from './inspectorTargetContext';
import { formatEntry, parseEntry } from './sliderEntry';

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
  unit,
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
  /** Formats the value read out for the slider, including a value still being dragged. */
  formatValue?: (value: number) => string;
  /** A short unit shown after the numeric entry, such as `%` or `px`. */
  unit?: string;
  min: number;
  max: number;
  step?: number;
  /** Numeric entry accepts values up to this limit; the slider stops at `max`. */
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
  return (
    <PropertyRow
      className={`artifact-inspector-slider${disabled ? ' artifact-inspector-control-disabled' : ''}`}
      label={<span className="artifact-inspector-label">{label}</span>}
      labelAction={
        effectKey && onInfoEnter ? (
          <NoPan
            as="button"
            ref={infoRef}
            type="button"
            className="artifact-inspector-info"
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
      disabled={disabled}
    >
      <SliderInputs
        label={label}
        value={displayValue}
        valueText={formatValue?.(displayValue)}
        unit={unit}
        sliderValue={sliderValue}
        min={min}
        max={max}
        step={step}
        entryMax={overrideMax ?? max}
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
  valueText,
  unit,
  sliderValue,
  min,
  max,
  step,
  entryMax,
  onChange,
  onCommit,
}: Pick<ComponentPropsWithoutRef<'input'>, 'aria-describedby' | 'aria-invalid' | 'disabled' | 'id'> & {
  entryMax: number;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  /** The gesture ended: pass on a value that is still waiting. */
  onCommit: () => void;
  sliderValue: number;
  step: number;
  unit?: string;
  value: number;
  valueText?: string;
}) {
  return (
    <div className="node-slider-row">
      <input
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-valuetext={valueText}
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
      <NumericEntry
        label={label}
        value={value}
        unit={unit}
        min={min}
        max={entryMax}
        step={step}
        disabled={disabled}
        onChange={onChange}
        onCommit={onCommit}
      />
    </div>
  );
}

/**
 * Numeric entry for a slider. Typing only edits the text; Enter or blur commits it once, clamped to the range and
 * snapped to the step like a slider value, and Escape puts back the committed value. Text that is not a number is
 * discarded.
 */
function NumericEntry({
  label,
  value,
  unit,
  min,
  max,
  step,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const range = { min, max, step };
  const commit = () => {
    if (text === null) return;
    const next = parseEntry(text, range);
    if (next !== null && next !== value) onChange(next);
    setText(null);
    onCommit();
  };
  return (
    <span className="artifact-inspector-number">
      <input
        className="node-slider-number nodrag nopan nowheel"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text ?? formatEntry(value, range)}
        disabled={disabled}
        aria-label={`${label} value`}
        title={max > min ? `${min} to ${max}` : undefined}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onWheel={stopNodeEvent}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape' && text !== null) {
            // Keeps Escape from also closing or deselecting in the editor around the entry.
            event.stopPropagation();
            setText(null);
          }
        }}
        onBlur={commit}
      />
      {unit ? (
        <span className="artifact-inspector-number__unit" aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </span>
  );
}
