import { InspectorLabel } from './InspectorLabel';

export function InspectorColorInput({
  label,
  value,
  inactive = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  inactive?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`node-inspector-row${inactive || disabled ? ' node-inspector-row-inactive' : ''}`}>
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="node-color-input"
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
