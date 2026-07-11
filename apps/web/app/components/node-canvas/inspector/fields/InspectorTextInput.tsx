import { stopNodeEvent } from '../../helpers';
import { useSyncedTextFieldValue } from './useSyncedTextFieldValue';

export function InspectorTextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [localValue, handleChange] = useSyncedTextFieldValue(value, onChange);

  return (
    <input
      className="node-field nodrag nopan nowheel"
      value={localValue}
      placeholder={placeholder}
      onPointerDown={stopNodeEvent}
      onMouseDown={stopNodeEvent}
      onClick={stopNodeEvent}
      onDoubleClick={stopNodeEvent}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
