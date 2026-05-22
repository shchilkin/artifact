import { useLayoutEffect, useRef, useState } from 'react';

export function InspectorTextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const prevPropRef = useRef(value);

  useLayoutEffect(() => {
    if (value !== prevPropRef.current) {
      prevPropRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  return (
    <input
      className="node-field"
      value={localValue}
      placeholder={placeholder}
      onChange={(e) => {
        prevPropRef.current = value;
        setLocalValue(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}
