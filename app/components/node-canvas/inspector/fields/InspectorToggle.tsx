import { NoPan } from '../../nodes/NoPan';
import { InspectorLabel } from './InspectorLabel';

export function InspectorToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <NoPan as="label" className="node-inspector-toggle">
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="node-check"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </NoPan>
  );
}
