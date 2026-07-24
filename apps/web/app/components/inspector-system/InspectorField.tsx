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
  controlId,
  dirty = false,
  disabled = false,
  error,
  hint,
  loading = false,
  locked = false,
  status,
  validation = 'idle',
  ...props
}: InspectorFieldProps) {
  const state = { dirty, disabled, loading, locked, validation };
  const stateLabels = inspectorStateLabels(state);
  const hasHint = Boolean(hint || status || stateLabels.length > 0);
  const hasError = error !== null && error !== undefined && error !== false;
  const hintId = controlId && hasHint ? `${controlId}-hint` : undefined;
  const errorId = controlId && hasError ? `${controlId}-error` : undefined;
  const control = cloneElement(
    children as ReactElement<{
      'aria-describedby'?: string;
      'aria-errormessage'?: string;
      'aria-invalid'?: boolean;
      disabled?: boolean;
      id?: string;
    }>,
    {
      'aria-describedby': joinIds(children.props['aria-describedby'], hintId, errorId),
      'aria-errormessage': children.props['aria-errormessage'] ?? errorId,
      'aria-invalid': validation === 'invalid' || children.props['aria-invalid'],
      disabled: disabled || children.props.disabled,
      id: children.props.id ?? controlId,
    },
  );

  return (
    <Field
      {...props}
      children={control}
      className={cn('artifact-inspector-field', className)}
      controlId={controlId}
      error={error}
      hint={
        hasHint ? (
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

function joinIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}
