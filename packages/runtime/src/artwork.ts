import { type ChainRenderer, createChainRenderer } from './chain.js';
import {
  initialLifecycle,
  type LifecycleEvent,
  type LifecycleState,
  type LifecycleStatus,
  lifecycleStatus,
  shouldAnimate,
  transition,
} from './lifecycle.js';
import { computeRenderSize, DEFAULT_MAX_DEVICE_PIXEL_RATIO, DEFAULT_MAX_RENDER_SIZE } from './sizing.js';
import type { ArtworkSource, ChainPass, UniformValues } from './types.js';

/** Animation-frame clock. Injectable so tests can step frames by hand. */
export interface FrameScheduler {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  /** Milliseconds, monotonic. */
  now(): number;
}

/** Starts watching whether `target` is on screen; returns a function that stops watching. */
export type VisibilityObserver = (target: Element, onChange: (visible: boolean) => void) => () => void;

/** What a frame is drawn from. */
export interface FrameState {
  /** Seconds since the artwork's time origin. Stops while the artwork is stopped; `seek` moves it. */
  readonly time: number;
  /** Scheduler clock in milliseconds when the frame is drawn. Keeps running while stopped, for input smoothing. */
  readonly clock: number;
  /** Frames drawn so far, before this one. */
  readonly frame: number;
  /** Values set through `setInput`. */
  readonly inputs: Readonly<Record<string, number>>;
  /** `prefers-reduced-motion` applies: hooks return the authored still (no overrides). */
  readonly reducedMotion: boolean;
}

/** Per-frame uniform overrides: entry `i` is merged over pass `i`'s resting uniforms. */
export type FrameUniforms = (frame: FrameState) => readonly (UniformValues | undefined)[] | undefined;

export interface ArtworkOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly source: ArtworkSource;
  readonly chain: readonly ChainPass[];
  /** Hook for time- and input-driven uniforms. Without it every frame shows the resting chain. */
  readonly frameUniforms?: FrameUniforms;
  /** Longest drawing-buffer side in device pixels. Default 1080. */
  readonly maxRenderSize?: number;
  /** Device pixel ratio cap. Default 2. */
  readonly maxDevicePixelRatio?: number;
  /** Defaults to `window.devicePixelRatio`. */
  readonly devicePixelRatio?: number;
  /** Defaults to `matchMedia('(prefers-reduced-motion: reduce)')`, followed live. */
  readonly reducedMotion?: boolean;
  /** Defaults to an IntersectionObserver for on-page canvases; `null` keeps the artwork always visible. */
  readonly observeVisibility?: VisibilityObserver | null;
  /** Defaults to `requestAnimationFrame` and `performance.now`. */
  readonly scheduler?: FrameScheduler;
  readonly contextAttributes?: WebGLContextAttributes;
}

export interface ArtworkState {
  readonly status: LifecycleStatus;
  readonly time: number;
  /** Frames drawn since creation, including still frames. */
  readonly frames: number;
  readonly width: number;
  readonly height: number;
}

export interface Artwork {
  /** Plays from the current time. Under reduced motion the still frame stays and nothing is scheduled. */
  start(): void;
  pause(): void;
  /** Moves to `time` seconds and draws that frame. */
  seek(time: number): void;
  /** Resizes to a CSS size; without arguments, reads the canvas's displayed size. */
  resize(cssWidth?: number, cssHeight?: number): void;
  /**
   * Sets a named input for the following frames (see `FrameState.inputs`). A stopped artwork redraws once so the
   * change shows; under reduced motion the still frame stays.
   */
  setInput(name: string, value: number): void;
  /** Redraws the current frame if the artwork is stopped and motion is allowed. Input trackers call this. */
  redraw(): void;
  /** Stops the loop, stops observers, and deletes every GL object the artwork created. */
  destroy(): void;
  readonly state: ArtworkState;
}

const DEFAULT_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function createArtwork(options: ArtworkOptions): Artwork {
  const { canvas, chain, frameUniforms } = options;
  const gl = canvas.getContext('webgl2', {
    ...DEFAULT_CONTEXT_ATTRIBUTES,
    ...options.contextAttributes,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('WebGL2 is not available.');

  const scheduler = options.scheduler ?? defaultScheduler();
  const motionQuery = options.reducedMotion === undefined ? reducedMotionQuery() : null;
  let lifecycle: LifecycleState = initialLifecycle({
    reducedMotion: options.reducedMotion ?? motionQuery?.matches ?? false,
  });

  const renderer: ChainRenderer = createChainRenderer(gl, chain);
  renderer.setSource(options.source);

  const inputs: Record<string, number> = {};
  let frames = 0;
  let width = 0;
  let height = 0;
  let frameHandle: number | null = null;
  // Clock: `elapsed` seconds banked while stopped, plus wall time since `resumedAt` while animating.
  let elapsed = 0;
  let resumedAt = 0;

  const currentTime = () => (frameHandle === null ? elapsed : elapsed + (scheduler.now() - resumedAt) / 1000);

  const draw = (time: number) => {
    const overrides = frameUniforms?.({
      time,
      clock: scheduler.now(),
      frame: frames,
      inputs,
      reducedMotion: lifecycle.reducedMotion,
    });
    renderer.render(overrides);
    frames += 1;
  };

  const tick = () => {
    frameHandle = scheduler.requestFrame(tick);
    draw(elapsed + (scheduler.now() - resumedAt) / 1000);
  };

  const dispatch = (event: LifecycleEvent) => {
    const wasAnimating = frameHandle !== null;
    const previous = lifecycle;
    lifecycle = transition(lifecycle, event);
    const animate = shouldAnimate(lifecycle);
    if (animate && !wasAnimating) {
      resumedAt = scheduler.now();
      frameHandle = scheduler.requestFrame(tick);
    } else if (!animate && wasAnimating && frameHandle !== null) {
      elapsed = currentTime();
      scheduler.cancelFrame(frameHandle);
      frameHandle = null;
    }
    // Reduced motion switched on: replace whatever moving frame is showing with the authored still.
    if (lifecycle.reducedMotion && !previous.reducedMotion) draw(currentTime());
  };

  const redraw = () => {
    if (lifecycle.destroyed || lifecycle.reducedMotion || frameHandle !== null) return;
    draw(currentTime());
  };

  const resize = (cssWidth?: number, cssHeight?: number) => {
    const displayed = displayedSize(canvas);
    const next = computeRenderSize({
      cssWidth: cssWidth ?? displayed.width,
      cssHeight: cssHeight ?? displayed.height,
      // A canvas off the page has no CSS size: its own size is already in device pixels.
      devicePixelRatio: displayed.css ? (options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1) : 1,
      maxDevicePixelRatio: options.maxDevicePixelRatio ?? DEFAULT_MAX_DEVICE_PIXEL_RATIO,
      maxRenderSize: options.maxRenderSize ?? DEFAULT_MAX_RENDER_SIZE,
    });
    if (next.width === width && next.height === height) return false;
    width = next.width;
    height = next.height;
    canvas.width = width;
    canvas.height = height;
    renderer.setSize(width, height);
    return true;
  };

  resize();
  // The resting frame, drawn once so the canvas is never blank and reduced motion has its still image.
  draw(0);

  const onMotionChange = (event: MediaQueryListEvent) =>
    dispatch({ type: 'reducedMotion', reducedMotion: event.matches });
  motionQuery?.addEventListener('change', onMotionChange);

  const observe = options.observeVisibility === undefined ? defaultVisibilityObserver() : options.observeVisibility;
  const stopObserving =
    observe && isElement(canvas) ? observe(canvas, (visible) => dispatch({ type: 'visibility', visible })) : null;

  return {
    start: () => dispatch({ type: 'start' }),
    pause: () => dispatch({ type: 'pause' }),
    seek(time) {
      if (lifecycle.destroyed) return;
      elapsed = Math.max(0, time);
      resumedAt = scheduler.now();
      draw(elapsed);
    },
    resize(cssWidth, cssHeight) {
      if (lifecycle.destroyed) return;
      // Resizing clears the drawing buffer, so a stopped artwork redraws its current frame.
      if (resize(cssWidth, cssHeight) && frameHandle === null) draw(currentTime());
    },
    setInput(name, value) {
      if (lifecycle.destroyed || inputs[name] === value) return;
      inputs[name] = value;
      redraw();
    },
    redraw,
    destroy() {
      if (lifecycle.destroyed) return;
      dispatch({ type: 'destroy' });
      stopObserving?.();
      motionQuery?.removeEventListener('change', onMotionChange);
      renderer.destroy();
    },
    get state() {
      return { status: lifecycleStatus(lifecycle), time: currentTime(), frames, width, height };
    },
  };
}

function defaultScheduler(): FrameScheduler {
  return {
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    now: () => performance.now(),
  };
}

function reducedMotionQuery(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null;
}

function defaultVisibilityObserver(): VisibilityObserver | null {
  if (typeof IntersectionObserver !== 'function') return null;
  return (target, onChange) => {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) onChange(entry.isIntersecting);
    });
    observer.observe(target);
    return () => observer.disconnect();
  };
}

function isElement(canvas: HTMLCanvasElement | OffscreenCanvas): canvas is HTMLCanvasElement {
  return typeof Element === 'function' && canvas instanceof Element;
}

function displayedSize(canvas: HTMLCanvasElement | OffscreenCanvas): { width: number; height: number; css: boolean } {
  if (isElement(canvas) && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    return { width: canvas.clientWidth, height: canvas.clientHeight, css: true };
  }
  return { width: canvas.width, height: canvas.height, css: false };
}
