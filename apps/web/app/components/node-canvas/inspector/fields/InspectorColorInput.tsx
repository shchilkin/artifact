import { InspectorLabel } from './InspectorLabel';

export function InspectorColorInput({
  label,
  value,
  inactive = false,
  onChange,
}: {
  label: string;
  value: string;
  inactive?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`node-inspector-row${inactive ? ' node-inspector-row-inactive' : ''}`}>
      <InspectorLabel>{label}</InspectorLabel>
      <input className="node-color-input" type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
