import { type RefObject, useEffect, useRef } from 'react';

export function useNativeTransformWheel(
  rootRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onWheelDelta: ((deltaY: number) => void) | undefined,
) {
  const enabledRef = useRef(enabled);
  const onWheelDeltaRef = useRef(onWheelDelta);

  useEffect(() => {
    enabledRef.current = enabled;
    onWheelDeltaRef.current = onWheelDelta;
  }, [enabled, onWheelDelta]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (!enabledRef.current || !onWheelDeltaRef.current) return;
      if (!root.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onWheelDeltaRef.current(event.deltaY);
    };

    const controller = new AbortController();
    const options: AddEventListenerOptions = {
      capture: true,
      passive: false,
      signal: controller.signal,
    };
    root.addEventListener('wheel', handleWheel, options);
    return () => controller.abort();
  }, [rootRef]);
}
