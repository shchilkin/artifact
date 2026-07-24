import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';

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
    <PropertyRow
      className={`node-inspector-row${inactive || disabled ? ' node-inspector-row-inactive' : ''}`}
      label={<span className="node-inspector-label">{label}</span>}
      disabled={disabled}
    >
      <input
        className="node-color-input nodrag nopan nowheel"
        type="color"
        value={value}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onChange={(e) => onChange(e.target.value)}
      />
    </PropertyRow>
  );
}
