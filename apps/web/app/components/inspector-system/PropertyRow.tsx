import { type ComponentPropsWithoutRef, cloneElement, type ReactElement, type ReactNode, useId } from 'react';

import { cn } from '@/lib/utils';

import { type InspectorStateProps, inspectorStateAttributes, inspectorStateLabels } from './inspectorState';
import './inspector-system.css';

interface PropertyRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'>, InspectorStateProps {
  children: ReactElement<{
    'aria-describedby'?: string;
    'aria-errormessage'?: string;
    'aria-invalid'?: boolean;
    disabled?: boolean;
    id?: string;
  }>;
  controlId?: string;
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  labelAction?: ReactNode;
  status?: ReactNode;
  value?: ReactNode;
}

export function PropertyRow({
  children,
  className,
  controlId,
  dirty = false,
  disabled = false,
  error,
  hint,
  label,
  labelAction,
  loading = false,
  locked = false,
  status,
  validation = 'idle',
  value,
  ...props
}: PropertyRowProps) {
  const generatedId = useId();
  const state = { dirty, disabled, loading, locked, validation };
  const stateLabels = inspectorStateLabels(state);
  const resolvedControlId = children.props.id ?? controlId ?? `artifact-property-${generatedId}`;
  const descriptionId = hint || status ? `${resolvedControlId}-description` : undefined;
  const errorId = error ? `${resolvedControlId}-error` : undefined;
  const stateId = stateLabels.length > 0 ? `${resolvedControlId}-state` : undefined;
  const describedBy = joinIds(children.props['aria-describedby'], descriptionId, stateId, errorId);
  const control = cloneElement(children, {
    id: resolvedControlId,
    disabled: disabled || children.props.disabled,
    'aria-describedby': describedBy,
    'aria-errormessage': children.props['aria-errormessage'] ?? errorId,
    'aria-invalid': validation === 'invalid' || children.props['aria-invalid'] || undefined,
  } as typeof children.props);

  return (
    <div
      {...props}
      className={cn('artifact-property-row', className)}
      data-inspector-property-row="true"
      {...inspectorStateAttributes(state)}
    >
      <span className="artifact-property-row__heading">
        <label className="artifact-property-row__label" htmlFor={resolvedControlId}>
          {label}
        </label>
        {labelAction ? <span className="artifact-property-row__label-action">{labelAction}</span> : null}
        {stateId ? (
          <span className="artifact-inspector-state-labels" id={stateId}>
            {stateLabels.map((stateLabel) => (
              <span className="artifact-inspector-state-label" key={stateLabel}>
                {stateLabel}
              </span>
            ))}
          </span>
        ) : null}
        {value !== undefined ? <output className="artifact-property-row__value">{value}</output> : null}
      </span>
      <span className="artifact-property-row__control">{control}</span>
      {descriptionId ? (
        <span className="artifact-property-row__description" id={descriptionId}>
          {hint}
          {status ? <span className="artifact-property-row__status">{status}</span> : null}
        </span>
      ) : null}
      {errorId ? (
        <span className="artifact-property-row__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function joinIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}
