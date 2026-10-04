/**
 * Visitor inputs as numbers a binding can read. The model is pure: every event and sample takes a timestamp in
 * milliseconds, so tests drive it without a DOM or a clock. `attachPointerInputs` (inputTracker.ts) feeds it from
 * pointer events on a canvas.
 *
 * Coordinates are normalised to the artwork: `x` 0 → 1 left to right, `y` 0 → 1 top to bottom, matching the
 * shader's `vTextureCoord` (the image's top row is `y = 0`).
 */

export const INPUT_NAMES = [
  'pointer.x',
  'pointer.y',
  'pointer.speed',
  'pointer.dirX',
  'pointer.dirY',
  'hover',
  'click',
  'click.x',
  'click.y',
  'scroll',
] as const;

export type InputName = (typeof INPUT_NAMES)[number];

export type InputValues = Readonly<Record<InputName, number>>;

/** Natural range of each input; bindings map it onto their target range. */
export const INPUT_DOMAINS: Readonly<Record<InputName, readonly [number, number]>> = {
  'pointer.x': [0, 1],
  'pointer.y': [0, 1],
  'pointer.speed': [0, 1],
  'pointer.dirX': [-1, 1],
  'pointer.dirY': [-1, 1],
  hover: [0, 1],
  click: [0, 1],
  'click.x': [0, 1],
  'click.y': [0, 1],
  scroll: [0, 1],
};

/** Values before any pointer activity: the pointer rests at the centre, nothing is moving or pressed. */
export const RESTING_INPUTS: InputValues = {
  'pointer.x': 0.5,
  'pointer.y': 0.5,
  'pointer.speed': 0,
  'pointer.dirX': 0,
  'pointer.dirY': 0,
  hover: 0,
  click: 0,
  'click.x': 0.5,
  'click.y': 0.5,
  scroll: 0,
};

export function isInputName(name: string): name is InputName {
  return (INPUT_NAMES as readonly string[]).includes(name);
}

export interface PointerModelOptions {
  /** Seconds `hover` takes to ease from 0 to 1 (and back). Default 0.25. */
  readonly hoverSeconds?: number;
  /** Time constant, in seconds, of the exponential smoothing on pointer velocity. Default 0.1. */
  readonly speedSmoothing?: number;
  /** Speed, in artwork lengths per second, that reads as `pointer.speed = 1`. Default 3. */
  readonly maxSpeed?: number;
  /** Time constant, in seconds, of the click impulse's exponential decay. Default 0.5. */
  readonly clickDecay?: number;
}

export interface PointerModel {
  /** The pointer moved to normalised `(x, y)`. */
  move(x: number, y: number, timeMs: number): void;
  /** A mouse or pen entered the artwork. */
  enter(timeMs: number): void;
  /** A mouse or pen left the artwork. */
  leave(timeMs: number): void;
  /** A press at `(x, y)`. Touch presses also start hover, since touch has no hover of its own. */
  down(x: number, y: number, timeMs: number, touch: boolean): void;
  /** A release or cancel. Touch releases end hover. */
  up(timeMs: number, touch: boolean): void;
  /** Scroll progress of the artwork through the viewport, 0..1 (see `scrollProgress`). */
  setScroll(progress: number): void;
  /** Input values at `timeMs`. Advances the velocity smoothing, so call it once per drawn frame. */
  sample(timeMs: number): InputValues;
}

export function createPointerModel(options: PointerModelOptions = {}): PointerModel {
  const hoverSeconds = positive(options.hoverSeconds, 0.25);
  const speedSmoothing = positive(options.speedSmoothing, 0.1);
  const maxSpeed = positive(options.maxSpeed, 3);
  const clickDecay = positive(options.clickDecay, 0.5);

  let x = RESTING_INPUTS['pointer.x'];
  let y = RESTING_INPUTS['pointer.y'];
  // Whether (x, y) is a position the pointer is tracking, so the next move measures a real distance.
  let tracking = false;
  let travelX = 0;
  let travelY = 0;
  let velocityX = 0;
  let velocityY = 0;
  let dirX = 0;
  let dirY = 0;
  let lastSampleMs: number | null = null;

  // Hover ramps linearly toward its target from where it was when the target last changed.
  let hoverTarget = 0;
  let hoverFrom = 0;
  let hoverChangedMs = 0;
  const hoverRamp = (timeMs: number) => {
    const progress = Math.max(0, timeMs - hoverChangedMs) / 1000 / hoverSeconds;
    return hoverTarget > hoverFrom
      ? Math.min(hoverTarget, hoverFrom + progress)
      : Math.max(hoverTarget, hoverFrom - progress);
  };
  const setHover = (target: number, timeMs: number) => {
    if (target === hoverTarget) return;
    hoverFrom = hoverRamp(timeMs);
    hoverTarget = target;
    hoverChangedMs = timeMs;
  };

  let clickMs: number | null = null;
  let clickX = RESTING_INPUTS['click.x'];
  let clickY = RESTING_INPUTS['click.y'];
  let scroll = RESTING_INPUTS.scroll;

  const moveTo = (nextX: number, nextY: number) => {
    const clampedX = clamp01(nextX);
    const clampedY = clamp01(nextY);
    if (tracking) {
      travelX += clampedX - x;
      travelY += clampedY - y;
    }
    x = clampedX;
    y = clampedY;
    tracking = true;
  };

  return {
    move(nextX, nextY) {
      moveTo(nextX, nextY);
    },
    enter(timeMs) {
      setHover(1, timeMs);
    },
    leave(timeMs) {
      tracking = false;
      setHover(0, timeMs);
    },
    down(nextX, nextY, timeMs, touch) {
      // A touch lands somewhere new: jump there without counting the jump as speed.
      if (touch) tracking = false;
      moveTo(nextX, nextY);
      clickMs = timeMs;
      clickX = x;
      clickY = y;
      if (touch) setHover(1, timeMs);
    },
    up(timeMs, touch) {
      if (!touch) return;
      tracking = false;
      setHover(0, timeMs);
    },
    setScroll(progress) {
      scroll = clamp01(progress);
    },
    sample(timeMs) {
      const dt = lastSampleMs === null ? 0 : (timeMs - lastSampleMs) / 1000;
      if (dt > 0) {
        const blend = 1 - Math.exp(-dt / speedSmoothing);
        velocityX += (travelX / dt - velocityX) * blend;
        velocityY += (travelY / dt - velocityY) * blend;
        travelX = 0;
        travelY = 0;
      } else if (lastSampleMs === null) {
        travelX = 0;
        travelY = 0;
      }
      if (lastSampleMs === null || timeMs > lastSampleMs) lastSampleMs = timeMs;

      const speed = Math.hypot(velocityX, velocityY);
      // Direction keeps its last heading once the pointer slows to a stop.
      if (speed > 1e-4) {
        dirX = velocityX / speed;
        dirY = velocityY / speed;
      }
      const click = clickMs === null ? 0 : Math.exp(-Math.max(0, timeMs - clickMs) / 1000 / clickDecay);
      return {
        'pointer.x': x,
        'pointer.y': y,
        'pointer.speed': Math.min(1, speed / maxSpeed),
        'pointer.dirX': dirX,
        'pointer.dirY': dirY,
        hover: smoothstep(hoverRamp(timeMs)),
        click,
        'click.x': clickX,
        'click.y': clickY,
        scroll,
      };
    },
  };
}

/** A client-space point as a position on the artwork, clamped to its bounds; `y = 0` is the top edge. */
export function normalizePointer(
  clientX: number,
  clientY: number,
  rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): { x: number; y: number } {
  return {
    x: rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0.5,
    y: rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0.5,
  };
}

/**
 * How far the artwork has travelled through the viewport: 0 while its top edge is at the viewport's bottom edge
 * (about to enter), 1 when its bottom edge reaches the viewport's top edge (just left).
 */
export function scrollProgress(
  rect: { readonly top: number; readonly height: number },
  viewportHeight: number,
): number {
  const travel = viewportHeight + rect.height;
  return travel > 0 ? clamp01((viewportHeight - rect.top) / travel) : 0;
}

export function smoothstep(t: number): number {
  const clamped = clamp01(t);
  return clamped * clamped * (3 - 2 * clamped);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
