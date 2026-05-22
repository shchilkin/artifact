export interface RenderWorkerDiagnosticsSnapshot {
  active: number;
  totalScheduled: number;
  completed: number;
  fallbacks: number;
  failures: number;
  lastDurationMs: number;
  averageDurationMs: number;
}

const listeners = new Set<() => void>();

let active = 0;
let totalScheduled = 0;
let completed = 0;
let fallbacks = 0;
let failures = 0;
let lastDurationMs = 0;
let totalDurationMs = 0;
let snapshot = createSnapshot();

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function createSnapshot(): RenderWorkerDiagnosticsSnapshot {
  return {
    active,
    totalScheduled,
    completed,
    fallbacks,
    failures,
    lastDurationMs,
    averageDurationMs: completed > 0 ? totalDurationMs / completed : 0,
  };
}

function emit() {
  snapshot = createSnapshot();
  listeners.forEach((listener) => listener());
}

export function getRenderWorkerDiagnosticsSnapshot(): RenderWorkerDiagnosticsSnapshot {
  return snapshot;
}

export function subscribeRenderWorkerDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginRenderWorkerJob() {
  totalScheduled += 1;
  active += 1;
  const startedAt = now();
  emit();

  return () => {
    active = Math.max(0, active - 1);
    completed += 1;
    lastDurationMs = now() - startedAt;
    totalDurationMs += lastDurationMs;
    emit();
  };
}

export function recordRenderWorkerFallback(durationMs: number) {
  fallbacks += 1;
  completed += 1;
  lastDurationMs = durationMs;
  totalDurationMs += durationMs;
  emit();
}

export function recordRenderWorkerFailure() {
  failures += 1;
  active = Math.max(0, active - 1);
  emit();
}
