import {
  createPointerModel,
  type InputValues,
  normalizePointer,
  type PointerModelOptions,
  scrollProgress,
} from './inputs.js';

export interface PointerInputOptions extends PointerModelOptions {
  /** Milliseconds, monotonic. Defaults to `performance.now`. Use the artwork's scheduler clock. */
  readonly now?: () => number;
  /** Called after any event that changes the inputs, so a stopped artwork can redraw. */
  readonly onChange?: () => void;
}

export interface PointerInputs {
  /** Input values at `timeMs` (defaults to `now()`). */
  sample(timeMs?: number): InputValues;
  /** Removes every listener this tracker added. */
  detach(): void;
}

/**
 * Feeds the pointer model from pointer events on `target` (pointer events cover mouse, pen and touch) and from
 * window scroll and resize. Touch has no hover, so `hover` follows touch-down. The tracker never calls
 * `preventDefault`, so touch scrolling over the artwork keeps working.
 */
export function attachPointerInputs(target: HTMLElement, options: PointerInputOptions = {}): PointerInputs {
  const now = options.now ?? (() => performance.now());
  const model = createPointerModel(options);
  const changed = () => options.onChange?.();

  const position = (event: PointerEvent) =>
    normalizePointer(event.clientX, event.clientY, target.getBoundingClientRect());
  const isTouch = (event: PointerEvent) => event.pointerType === 'touch';

  const onEnter = (event: PointerEvent) => {
    if (isTouch(event)) return;
    const { x, y } = position(event);
    model.enter(now());
    model.move(x, y, now());
    changed();
  };
  const onLeave = (event: PointerEvent) => {
    if (isTouch(event)) return;
    model.leave(now());
    changed();
  };
  const onMove = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const { x, y } = position(event);
    model.move(x, y, now());
    changed();
  };
  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const { x, y } = position(event);
    model.down(x, y, now(), isTouch(event));
    changed();
  };
  const onUp = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    model.up(now(), isTouch(event));
    changed();
  };

  const view = target.ownerDocument.defaultView;
  let scroll = -1;
  const onScroll = () => {
    const next = scrollProgress(target.getBoundingClientRect(), view?.innerHeight ?? 0);
    if (next === scroll) return;
    scroll = next;
    model.setScroll(next);
    changed();
  };
  scroll = scrollProgress(target.getBoundingClientRect(), view?.innerHeight ?? 0);
  model.setScroll(scroll);

  const passive = { passive: true } as const;
  target.addEventListener('pointerenter', onEnter, passive);
  target.addEventListener('pointerleave', onLeave, passive);
  target.addEventListener('pointermove', onMove, passive);
  target.addEventListener('pointerdown', onDown, passive);
  target.addEventListener('pointerup', onUp, passive);
  target.addEventListener('pointercancel', onUp, passive);
  view?.addEventListener('scroll', onScroll, passive);
  view?.addEventListener('resize', onScroll, passive);

  let attached = true;
  return {
    sample: (timeMs) => model.sample(timeMs ?? now()),
    detach() {
      if (!attached) return;
      attached = false;
      target.removeEventListener('pointerenter', onEnter);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      view?.removeEventListener('scroll', onScroll);
      view?.removeEventListener('resize', onScroll);
    },
  };
}
