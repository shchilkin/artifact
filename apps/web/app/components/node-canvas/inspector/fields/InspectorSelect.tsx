import { stopNodeEvent } from '../../helpers';
import { InspectorLabel } from './InspectorLabel';

export type InspectorSelectOption = string | { value: string; label: string };

export function InspectorSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly InspectorSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`node-inspector-control${disabled ? ' node-inspector-control-disabled' : ''}`}>
      <InspectorLabel>{label}</InspectorLabel>
      <select
        className="node-field nodrag nopan nowheel"
        value={value}
        disabled={disabled}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}
