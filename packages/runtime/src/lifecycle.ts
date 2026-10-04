/**
 * Playback state of an artwork, kept apart from GL so it can be tested without a context. The loop animates only
 * while the host asked to play, the canvas is on screen, motion is allowed, and the artwork is alive.
 */
export interface LifecycleState {
  /** The host called `start` and has not called `pause` since. */
  readonly playing: boolean;
  /** The canvas intersects the viewport. */
  readonly visible: boolean;
  /** `prefers-reduced-motion: reduce`: the artwork shows one still frame and never animates. */
  readonly reducedMotion: boolean;
  readonly destroyed: boolean;
}

export type LifecycleEvent =
  | { readonly type: 'start' }
  | { readonly type: 'pause' }
  | { readonly type: 'visibility'; readonly visible: boolean }
  | { readonly type: 'reducedMotion'; readonly reducedMotion: boolean }
  | { readonly type: 'destroy' };

/** What the host sees: why the artwork is or is not moving. */
export type LifecycleStatus = 'destroyed' | 'still' | 'idle' | 'offscreen' | 'running';

export function initialLifecycle(options: { reducedMotion: boolean; visible?: boolean }): LifecycleState {
  return { playing: false, visible: options.visible ?? true, reducedMotion: options.reducedMotion, destroyed: false };
}

export function transition(state: LifecycleState, event: LifecycleEvent): LifecycleState {
  if (state.destroyed) return state;
  switch (event.type) {
    case 'start':
      return state.playing ? state : { ...state, playing: true };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'visibility':
      return state.visible === event.visible ? state : { ...state, visible: event.visible };
    case 'reducedMotion':
      return state.reducedMotion === event.reducedMotion ? state : { ...state, reducedMotion: event.reducedMotion };
    case 'destroy':
      return { ...state, playing: false, destroyed: true };
  }
}

export function shouldAnimate(state: LifecycleState): boolean {
  return state.playing && state.visible && !state.reducedMotion && !state.destroyed;
}

export function lifecycleStatus(state: LifecycleState): LifecycleStatus {
  if (state.destroyed) return 'destroyed';
  if (state.reducedMotion) return 'still';
  if (!state.playing) return 'idle';
  if (!state.visible) return 'offscreen';
  return 'running';
}
