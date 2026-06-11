export async function measurePerformancePhase<T>(measureName: string, task: () => Promise<T>, markScope?: string) {
  if (!canMeasurePerformance()) return task();

  const { startMark, endMark } = createMeasureMarks(measureName, markScope);
  try {
    performance.mark(startMark);
    const result = await task();
    performance.mark(endMark);
    safeMeasure(measureName, startMark, endMark);
    return result;
  } finally {
    clearMeasureMarks(startMark, endMark);
  }
}

export function measurePerformancePhaseSync<T>(measureName: string, task: () => T, markScope?: string) {
  if (!canMeasurePerformance()) return task();

  const { startMark, endMark } = createMeasureMarks(measureName, markScope);
  try {
    performance.mark(startMark);
    const result = task();
    performance.mark(endMark);
    safeMeasure(measureName, startMark, endMark);
    return result;
  } finally {
    clearMeasureMarks(startMark, endMark);
  }
}

function canMeasurePerformance() {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

function createMeasureMarks(measureName: string, markScope?: string) {
  const markId = `${measureName}:${markScope ?? 'scope'}:${Math.random().toString(36).slice(2)}`;
  return {
    startMark: `${markId}:start`,
    endMark: `${markId}:end`,
  };
}

function safeMeasure(measureName: string, startMark: string, endMark: string) {
  try {
    performance.measure(measureName, startMark, endMark);
  } catch {
    // Instrumentation must never break rendering or export.
  }
}

function clearMeasureMarks(startMark: string, endMark: string) {
  performance.clearMarks?.(startMark);
  performance.clearMarks?.(endMark);
}
