import { useSyncedTextFieldValue } from './useSyncedTextFieldValue';

export function InspectorTextArea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [localValue, handleChange] = useSyncedTextFieldValue(value, onChange);

  return (
    <textarea
      className="node-field node-field-textarea"
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      rows={4}
    />
  );
}
