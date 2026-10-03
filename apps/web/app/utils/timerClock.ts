/** Time and timers, injectable so schedulers can be tested with a fake clock. */
export interface TimerClock {
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export const browserTimerClock: TimerClock = {
  now: () => performance.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
