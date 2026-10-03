import { useEffect, useState } from 'react';

/** `value`, updated once it has stopped changing for `delayMs`. */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, settled, value]);
  return settled;
}
