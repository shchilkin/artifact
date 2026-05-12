import { useLayoutEffect, useRef, useState } from 'react';

export function InspectorTextArea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(value);
  const prevPropRef = useRef(value);

  useLayoutEffect(() => {
    if (value !== prevPropRef.current) {
      prevPropRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  return (
    <textarea
      className="node-field node-field-textarea"
      value={localValue}
      onChange={(e) => {
        prevPropRef.current = value;
        setLocalValue(e.target.value);
        onChange(e.target.value);
      }}
      rows={4}
    />
  );
}
