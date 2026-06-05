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
      className="node-field"
      value={localValue}
      placeholder={placeholder}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
