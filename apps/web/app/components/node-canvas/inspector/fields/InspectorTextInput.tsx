import { Input } from '@artifact/ui';
import type { ReactNode } from 'react';

import { InspectorField, type InspectorStateProps, type InspectorValidationState } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';
import { useSyncedTextFieldValue } from './useSyncedTextFieldValue';

export function InspectorTextInput({
  label,
  value,
  dirty = false,
  disabled = false,
  error,
  hint,
  loading = false,
  locked = false,
  onChange,
  placeholder,
  status,
  validation = 'idle',
}: InspectorStateProps & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  status?: ReactNode;
  validation?: InspectorValidationState;
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
      <Input
        className="node-field nodrag nopan nowheel"
        value={localValue}
        placeholder={placeholder}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onChange={(event) => handleChange(event.target.value)}
      />
    </InspectorField>
  );
}
