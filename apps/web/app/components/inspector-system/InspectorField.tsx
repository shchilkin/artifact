import { Field, type FieldProps } from '@artifact/ui';
import { cloneElement, type ReactElement } from 'react';

import { cn } from '@/lib/utils';

import { type InspectorStateProps, inspectorStateAttributes, inspectorStateLabels } from './inspectorState';
import './inspector-system.css';

interface InspectorFieldProps extends FieldProps, InspectorStateProps {
  status?: React.ReactNode;
}

export function InspectorField({
  className,
  children,
  dirty = false,
  disabled = false,
  hint,
  loading = false,
  locked = false,
  status,
  validation = 'idle',
  ...props
}: InspectorFieldProps) {
  const state = { dirty, disabled, loading, locked, validation };
  const stateLabels = inspectorStateLabels(state);
  const control = cloneElement(children as ReactElement<{ 'aria-invalid'?: boolean; disabled?: boolean }>, {
    'aria-invalid': validation === 'invalid' || children.props['aria-invalid'],
    disabled: disabled || children.props.disabled,
  });

  return (
    <Field
      {...props}
      children={control}
      className={cn('artifact-inspector-field', className)}
      hint={
        hint || status || stateLabels.length > 0 ? (
          <>
            {hint}
            {status ? <span className="artifact-inspector-field__status">{status}</span> : null}
            {stateLabels.length > 0 ? (
              <span className="artifact-inspector-state-labels">
                {stateLabels.map((label) => (
                  <span className="artifact-inspector-state-label" key={label}>
                    {label}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        ) : undefined
      }
      data-inspector-field="true"
      {...inspectorStateAttributes(state)}
    />
  );
}
