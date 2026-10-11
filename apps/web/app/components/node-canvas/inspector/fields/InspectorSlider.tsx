import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createCoalescedCommit } from '../../../../utils/coalescedCommit';
import { PREVIEW_FRAME_INTERVAL_MS } from '../../../../utils/interactionTiming';
import { EditorWorkflowNotice } from '../../../editor-workflow/EditorWorkflowNotice';
import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { InspectorTargetContext } from './inspectorTargetContext';
import { SliderHelp, SliderHelpTrigger } from './SliderHelp';
import { entryLimitMessage, formatEntry, parseEntry } from './sliderEntry';

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
  help,
  disabled = false,
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
  /** Help for the control, opened from an "About …" button beside the row. */
  help?: ReactNode;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { displayValue, change, flush } = useCoalescedSliderValue(value, onChange);
  const sliderValue = Math.min(max, Math.max(min, displayValue));
  const row = (
    <PropertyRow
      className={`artifact-inspector-slider${disabled ? ' artifact-inspector-control-disabled' : ''}`}
      label={<span className="artifact-inspector-label">{label}</span>}
      labelAction={help ? <SliderHelpTrigger label={label} /> : undefined}
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
  return help ? (
    <SliderHelp label={label} content={help}>
      {row}
    </SliderHelp>
  ) : (
    row
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
  const limit = useEntryLimitMessage();
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
        onLimit={limit.show}
      />
      {/* Laid over the slider track, so the message never moves the rows or gets clipped by a section edge. It stays
          mounted while empty so its live region is registered before the first message. */}
      <EditorWorkflowNotice
        className="artifact-inspector-entry-limit"
        variant="info"
        data-visible={limit.message ? 'true' : 'false'}
      >
        {limit.message ?? ''}
      </EditorWorkflowNotice>
    </div>
  );
}

/** How long numeric entry shows the limit it clamped a typed value to. */
export const ENTRY_LIMIT_MESSAGE_MS = 2400;

/**
 * Numeric entry for a slider. Typing only edits the text; Enter or blur commits it once, clamped to the range and
 * snapped to the step like a slider value, and Escape puts back the committed value. A value outside the range
 * briefly shows the limit it was clamped to. Text that is not a number is discarded.
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
  onLimit,
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
  /** Reports the limit a committed value was clamped to, or `null` when it was in range. */
  onLimit: (message: string | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const range = { min, max, step };
  const commit = () => {
    if (text === null) return;
    const next = parseEntry(text, range);
    if (next !== null && next !== value) onChange(next);
    onLimit(entryLimitMessage(text, range, unit));
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

/** Gap between clearing the live region and the next message, so the same limit typed twice is announced twice. */
const ENTRY_LIMIT_REANNOUNCE_MS = 50;

function useEntryLimitMessage() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    message,
    show: (next: string | null) => {
      clearTimeout(timer.current);
      setMessage(null);
      if (!next) return;
      timer.current = setTimeout(() => {
        setMessage(next);
        timer.current = setTimeout(() => setMessage(null), ENTRY_LIMIT_MESSAGE_MS);
      }, ENTRY_LIMIT_REANNOUNCE_MS);
    },
  };
}
