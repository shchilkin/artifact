import { InspectorLabel } from './InspectorLabel';

export type InspectorSelectOption = string | { value: string; label: string };

export function InspectorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly InspectorSelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="node-inspector-control">
      <InspectorLabel>{label}</InspectorLabel>
      <select className="node-field" value={value} onChange={(e) => onChange(e.target.value)}>
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
