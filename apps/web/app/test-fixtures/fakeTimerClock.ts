import type { TimerClock } from '../utils/timerClock';

/** A `TimerClock` that only moves when told to, firing due timers in order. */
export function createFakeTimerClock({ afterTimer }: { afterTimer?: () => void } = {}) {
  let time = 0;
  const timers: Array<{ at: number; callback: () => void; cleared: boolean }> = [];
  const clock: TimerClock = {
    now: () => time,
    setTimer: (callback, ms) => {
      const timer = { at: time + ms, callback, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      const timer = timers.find((item) => item === handle);
      if (timer) timer.cleared = true;
    },
  };
  /** Moves the clock to `target`, firing due timers (including ones they set) in order. */
  const advanceTo = (target: number) => {
    while (true) {
      const due = timers.filter((item) => !item.cleared && item.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      time = Math.max(time, due.at);
      due.cleared = true;
      due.callback();
      afterTimer?.();
    }
    time = target;
  };
  return { clock, advanceTo };
}
