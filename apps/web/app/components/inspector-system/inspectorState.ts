export type InspectorValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

export interface InspectorStateProps {
  dirty?: boolean;
  disabled?: boolean;
  loading?: boolean;
  locked?: boolean;
  validation?: InspectorValidationState;
}

export function inspectorStateAttributes({
  dirty = false,
  disabled = false,
  loading = false,
  locked = false,
  validation = 'idle',
}: InspectorStateProps) {
  return {
    'data-inspector-dirty': dirty ? 'true' : 'false',
    'data-inspector-disabled': disabled ? 'true' : 'false',
    'data-inspector-loading': loading ? 'true' : 'false',
    'data-inspector-locked': locked ? 'true' : 'false',
    'data-inspector-validation': validation,
    'aria-busy': loading || validation === 'validating' || undefined,
    'aria-disabled': disabled || undefined,
  } as const;
}

export function inspectorStateLabels({
  dirty = false,
  disabled = false,
  loading = false,
  locked = false,
  validation = 'idle',
}: InspectorStateProps) {
  const labels: string[] = [];
  if (dirty) labels.push('Edited');
  if (locked) labels.push('Lock');
  if (disabled) labels.push('Unavailable');
  if (loading) labels.push('Loading');
  if (validation !== 'idle') labels.push(inspectorValidationLabel(validation));
  return labels;
}

export function inspectorValidationLabel(validation: Exclude<InspectorValidationState, 'idle'>) {
  if (validation === 'validating') return 'Checking';
  if (validation === 'valid') return 'Valid';
  return 'Error';
}
