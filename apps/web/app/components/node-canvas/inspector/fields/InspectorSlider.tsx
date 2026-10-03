import { type ComponentPropsWithoutRef, type PointerEvent, startTransition, useEffect, useRef, useState } from 'react';

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
      value={<span className="artifact-inspector-value">{valueLabel ?? value}</span>}
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
  const { draftValue, onPointerDown, change, onBlur } = useSliderGestureDraft(sliderValue, onChange);
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
        value={draftValue ?? sliderValue}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onBlur={onBlur}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onWheel={stopNodeEvent}
        onChange={(event) => change(Number(event.target.value))}
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

/**
 * Gesture draft for a pointer drag on the range input: the thumb follows a local draft value, and each document
 * update is a transition, so React can drop intermediate states when the editor is busy while the preview still
 * follows the drag. The gesture ends with a commit on pointer-up, blur, or unmount (the last value as a normal
 * update unless the document already has it) or a revert to the starting value on Escape or pointer-cancel.
 * Keyboard and other discrete changes go straight to `onChange`.
 */
function useSliderGestureDraft(committedValue: number, onChange: (value: number) => void) {
  const [draftValue, setDraftValue] = useState<number | null>(null);
  const gestureRef = useRef<{ start: number; last: number | null; end: (commit: boolean) => void } | null>(null);
  const onChangeRef = useRef(onChange);
  const committedValueRef = useRef(committedValue);

  useEffect(() => {
    onChangeRef.current = onChange;
    committedValueRef.current = committedValue;
  }, [onChange, committedValue]);

  useEffect(() => () => gestureRef.current?.end(true), []);

  function onPointerDown(event: PointerEvent<HTMLInputElement>) {
    stopNodeEvent(event);
    gestureRef.current?.end(true);
    const commit = () => end(true);
    const revert = () => end(false);
    // On the window: WebKit does not focus a range input on pointer-down, so the key may not reach the input.
    const onEscape = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.stopPropagation();
      revert();
    };
    const end = (keep: boolean) => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', revert);
      window.removeEventListener('keydown', onEscape, true);
      const gesture = gestureRef.current;
      gestureRef.current = null;
      setDraftValue(null);
      if (!gesture || gesture.last === null) return;
      const value = keep ? gesture.last : gesture.start;
      if (value !== committedValueRef.current) onChangeRef.current(value);
    };
    gestureRef.current = { start: committedValueRef.current, last: null, end };
    window.addEventListener('pointerup', commit);
    window.addEventListener('pointercancel', revert);
    window.addEventListener('keydown', onEscape, true);
  }

  function change(value: number) {
    const gesture = gestureRef.current;
    if (!gesture) {
      onChange(value);
      return;
    }
    gesture.last = value;
    setDraftValue(value);
    startTransition(() => onChange(value));
  }

  const onBlur = () => gestureRef.current?.end(true);

  return { draftValue, onPointerDown, change, onBlur };
}
