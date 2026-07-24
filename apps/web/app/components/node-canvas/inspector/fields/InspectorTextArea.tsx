import { Textarea } from '@artifact/ui';
import type { ReactNode } from 'react';

import { InspectorField, type InspectorStateProps, type InspectorValidationState } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { useSyncedTextFieldValue } from './useSyncedTextFieldValue';

export function InspectorTextArea({
  label,
  value,
  dirty = false,
  disabled = false,
  error,
  hint,
  loading = false,
  locked = false,
  placeholder,
  rows = 4,
  status,
  validation = 'idle',
  onChange,
}: InspectorStateProps & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  value: string;
  placeholder?: string;
  rows?: number;
  status?: ReactNode;
  validation?: InspectorValidationState;
  onChange: (value: string) => void;
}) {
  const [localValue, handleChange] = useSyncedTextFieldValue(value, onChange);

  return (
    <InspectorField
      className={`node-inspector-control${disabled ? ' node-inspector-control-disabled' : ''}`}
      label={label}
      dirty={dirty}
      disabled={disabled}
      error={error}
      hint={hint}
      loading={loading}
      locked={locked}
      status={status}
      validation={validation}
    >
      <Textarea
        className="node-field node-field-textarea nodrag nopan nowheel"
        value={localValue}
        placeholder={placeholder}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onChange={(event) => handleChange(event.target.value)}
        rows={rows}
      />
    </InspectorField>
  );
}
