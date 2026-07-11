import { useSyncedTextFieldValue } from './useSyncedTextFieldValue';

export function InspectorTextArea({
  value,
  placeholder,
  rows = 4,
  onChange,
}: {
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  const [localValue, handleChange] = useSyncedTextFieldValue(value, onChange);

  return (
    <textarea
      className="node-field node-field-textarea"
      value={localValue}
      placeholder={placeholder}
      onChange={(e) => handleChange(e.target.value)}
      rows={rows}
    />
  );
}
