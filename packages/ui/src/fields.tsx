import { type ComponentPropsWithRef, createContext, type ReactElement, type ReactNode, use, useId } from 'react';

interface FieldContextValue {
  controlId: string;
  describedBy: string | undefined;
  errorId: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  children: ReactElement<{ id?: string }>;
  controlId?: string;
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
}

export function Field({ children, className, controlId, error, hint, label, ...props }: FieldProps) {
  const generatedId = useId();
  const resolvedControlId = children.props.id ?? controlId ?? `ui-field-${generatedId}`;
  const hasError = error !== null && error !== undefined && error !== false;
  const hintId = hint ? `${resolvedControlId}-hint` : undefined;
  const errorId = hasError ? `${resolvedControlId}-error` : undefined;
  const describedBy = joinIds(hintId, errorId);

  return (
    <FieldContext value={{ controlId: resolvedControlId, describedBy, errorId, invalid: hasError }}>
      <div {...props} className={joinClassNames('ui-field', className)} data-invalid={hasError ? 'true' : undefined}>
        <label className="ui-field__label" htmlFor={resolvedControlId}>
          {label}
        </label>
        {children}
        {hint ? (
          <span className="ui-field__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
        {hasError ? (
          <span className="ui-field__error" id={errorId}>
            {error}
          </span>
        ) : null}
      </div>
    </FieldContext>
  );
}

export type InputProps = ComponentPropsWithRef<'input'>;

export function Input({ className, ...props }: InputProps) {
  const fieldProps = useFieldControlProps(props);
  return <input {...props} {...fieldProps} className={joinClassNames('ui-field-control ui-input', className)} />;
}

export type TextareaProps = ComponentPropsWithRef<'textarea'>;

export function Textarea({ className, ...props }: TextareaProps) {
  const fieldProps = useFieldControlProps(props);
  return <textarea {...props} {...fieldProps} className={joinClassNames('ui-field-control ui-textarea', className)} />;
}

export type NativeSelectProps = ComponentPropsWithRef<'select'>;

export function NativeSelect({ className, ...props }: NativeSelectProps) {
  const fieldProps = useFieldControlProps(props);
  return (
    <select {...props} {...fieldProps} className={joinClassNames('ui-field-control ui-native-select', className)} />
  );
}

function useFieldControlProps(props: {
  id?: string;
  'aria-describedby'?: string;
  'aria-errormessage'?: string;
  'aria-invalid'?: ComponentPropsWithRef<'input'>['aria-invalid'];
}) {
  const field = use(FieldContext);
  return {
    id: props.id ?? field?.controlId,
    'aria-describedby': joinIds(props['aria-describedby'], field?.describedBy),
    'aria-errormessage': props['aria-errormessage'] ?? field?.errorId,
    'aria-invalid': field?.invalid ? true : props['aria-invalid'],
  };
}

function joinIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
