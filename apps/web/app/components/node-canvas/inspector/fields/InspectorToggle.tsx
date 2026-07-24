import { PropertyRow } from '../../../inspector-system';
import { stopNodeEvent } from '../../helpers';

export function InspectorToggle({
  ariaLabel,
  label,
  checked,
  className,
  disabled = false,
  locked = false,
  onChange,
}: {
  ariaLabel?: string;
  label: string;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  locked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <PropertyRow
      className={`node-inspector-toggle${disabled ? ' node-inspector-control-disabled' : ''}${className ? ` ${className}` : ''}`}
      label={<span className="node-inspector-label">{label}</span>}
      disabled={disabled}
      locked={locked}
    >
      <input
        aria-label={ariaLabel}
        className="node-check nodrag nopan nowheel"
        type="checkbox"
        checked={checked}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        onDoubleClick={stopNodeEvent}
        onChange={(event) => onChange(event.target.checked)}
      />
    </PropertyRow>
  );
}
