import type { ReactNode } from 'react';

import { type InspectorValidationState, PropertyRow } from '../../../inspector-system';

export function InspectorReadout({
  className,
  detail,
  label,
  locked = false,
  status,
  validation = 'idle',
  value,
}: {
  className?: string;
  detail?: ReactNode;
  label: string;
  locked?: boolean;
  status?: ReactNode;
  validation?: InspectorValidationState;
  value: ReactNode;
}) {
  return (
    <PropertyRow
      className={`node-inspector-readout${className ? ` ${className}` : ''}`}
      hint={detail}
      label={label}
      locked={locked}
      status={status}
      validation={validation}
    >
      <output className="node-inspector-readout-value">{value}</output>
    </PropertyRow>
  );
}
