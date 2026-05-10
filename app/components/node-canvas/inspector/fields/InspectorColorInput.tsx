import { InspectorLabel } from './InspectorLabel';

export function InspectorColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="node-inspector-row">
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="node-color-input"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
