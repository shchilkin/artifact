import { useLayoutEffect, useRef, useState } from 'react';

export function useSyncedTextFieldValue(value: string, onChange: (value: string) => void) {
  const [localValue, setLocalValue] = useState(value);
  const prevPropRef = useRef(value);

  useLayoutEffect(() => {
    if (value !== prevPropRef.current) {
      prevPropRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  const handleChange = (nextValue: string) => {
    prevPropRef.current = value;
    setLocalValue(nextValue);
    onChange(nextValue);
  };

  return [localValue, handleChange] as const;
}
