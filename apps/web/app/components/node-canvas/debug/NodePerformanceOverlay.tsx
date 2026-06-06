import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getRenderWorkerDiagnosticsSnapshot,
  type RenderWorkerDiagnosticsSnapshot,
  subscribeRenderWorkerDiagnostics,
} from '../../../utils/render/workers/diagnostics';
import {
  getThumbnailQueueSnapshot,
  subscribeThumbnailQueue,
  type ThumbnailQueueSnapshot,
} from '../thumbnails/thumbnailQueue';

const EMPTY_QUEUE_SNAPSHOT: ThumbnailQueueSnapshot = {
  queued: 0,
  active: false,
  activeTaskKey: null,
  totalScheduled: 0,
  completed: 0,
  lastDurationMs: 0,
  averageDurationMs: 0,
};

const EMPTY_WORKER_SNAPSHOT: RenderWorkerDiagnosticsSnapshot = {
  active: 0,
  totalScheduled: 0,
  completed: 0,
  fallbacks: 0,
  failures: 0,
  lastDurationMs: 0,
  averageDurationMs: 0,
};

interface FrameMetrics {
  fps: number;
  p95FrameMs: number;
  maxFrameMs: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  heapMb: number | null;
}

interface NodePerformanceOverlayProps {
  debugEnabled: boolean;
  nodeCount: number;
}

export function NodePerformanceOverlay({ debugEnabled, nodeCount }: NodePerformanceOverlayProps) {
  const queue = useSyncExternalStore(subscribeThumbnailQueue, getThumbnailQueueSnapshot, () => EMPTY_QUEUE_SNAPSHOT);
  const worker = useSyncExternalStore(
    subscribeRenderWorkerDiagnostics,
    getRenderWorkerDiagnosticsSnapshot,
    () => EMPTY_WORKER_SNAPSHOT,
  );
  const pending = queue.queued + (queue.active ? 1 : 0);
  const metrics = useFrameMetrics(debugEnabled);
  const status = useMemo(() => {
    if (pending <= 0) return null;
    return queue.active ? `Preparing previews ${pending} remaining` : `Queued previews ${pending}`;
  }, [pending, queue.active]);

  if (nodePerformanceOverlayHidden(debugEnabled, status)) return null;

  return (
    <div className={`node-perf-overlay${debugEnabled ? ' node-perf-overlay-debug' : ''}`} aria-live="polite">
      <NodePerfStatus status={status} />
      <NodePerfDebugGrid
        debugEnabled={debugEnabled}
        metrics={metrics}
        nodeCount={nodeCount}
        queue={queue}
        worker={worker}
      />
    </div>
  );
}

function nodePerformanceOverlayHidden(debugEnabled: boolean, status: string | null) {
  return !debugEnabled && !status;
}

function NodePerfStatus({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <div className="node-perf-status">
      <span className="node-perf-dot" aria-hidden="true" />
      {status}
    </div>
  );
}

function NodePerfDebugGrid({
  debugEnabled,
  metrics,
  nodeCount,
  queue,
  worker,
}: {
  debugEnabled: boolean;
  metrics: FrameMetrics;
  nodeCount: number;
  queue: ThumbnailQueueSnapshot;
  worker: RenderWorkerDiagnosticsSnapshot;
}) {
  if (!debugEnabled) return null;
  return (
    <dl className="node-perf-grid" aria-label="Node editor performance">
      {nodePerfMetricRows(metrics, nodeCount, queue, worker).map(({ label, value }) => (
        <PerfMetric key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

function nodePerfMetricRows(
  metrics: FrameMetrics,
  nodeCount: number,
  queue: ThumbnailQueueSnapshot,
  worker: RenderWorkerDiagnosticsSnapshot,
) {
  return [
    { label: 'fps', value: metrics.fps.toFixed(0) },
    { label: 'p95 frame', value: `${metrics.p95FrameMs.toFixed(1)}ms` },
    { label: 'max frame', value: `${metrics.maxFrameMs.toFixed(1)}ms` },
    { label: 'nodes', value: String(nodeCount) },
    { label: 'queue', value: `${queue.queued}${queue.active ? ' + active' : ''}` },
    { label: 'thumb avg', value: `${queue.averageDurationMs.toFixed(1)}ms` },
    { label: 'thumb last', value: `${queue.lastDurationMs.toFixed(1)}ms` },
    { label: 'worker active', value: String(worker.active) },
    { label: 'worker avg', value: `${worker.averageDurationMs.toFixed(1)}ms` },
    { label: 'worker last', value: `${worker.lastDurationMs.toFixed(1)}ms` },
    { label: 'worker fallback', value: `${worker.fallbacks} / ${worker.failures}` },
    { label: 'long tasks', value: `${metrics.longTaskCount} / ${metrics.longTaskTotalMs.toFixed(0)}ms` },
    ...(metrics.heapMb !== null ? [{ label: 'heap', value: `${metrics.heapMb.toFixed(0)}mb` }] : []),
  ];
}

function PerfMetric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function useFrameMetrics(enabled: boolean): FrameMetrics {
  const [metrics, setMetrics] = useState<FrameMetrics>({
    fps: 0,
    p95FrameMs: 0,
    maxFrameMs: 0,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    heapMb: null,
  });
  const longTasksRef = useRef({ count: 0, totalMs: 0 });

  useEffect(() => {
    if (!enabled) return;

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasksRef.current.count += 1;
          longTasksRef.current.totalMs += entry.duration;
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      observer = null;
    }

    let raf = 0;
    let lastFrame = performance.now();
    let lastPublish = lastFrame;
    let frames: number[] = [];

    const tick = (now: number) => {
      frames.push(now - lastFrame);
      lastFrame = now;

      if (now - lastPublish >= 750) {
        setMetrics(frameMetricsSnapshot(frames, longTasksRef.current));
        frames = [];
        lastPublish = now;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      longTasksRef.current = { count: 0, totalMs: 0 };
    };
  }, [enabled]);

  return metrics;
}

function frameMetricsSnapshot(frames: number[], longTasks: { count: number; totalMs: number }): FrameMetrics {
  const sorted = [...frames].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    fps: total > 0 ? (frames.length * 1000) / total : 0,
    p95FrameMs: percentileFrameMs(sorted, 0.95),
    maxFrameMs: sorted.at(-1) ?? 0,
    longTaskCount: longTasks.count,
    longTaskTotalMs: longTasks.totalMs,
    heapMb: getHeapMb(),
  };
}

function percentileFrameMs(sortedFrames: number[], percentile: number) {
  if (!sortedFrames.length) return 0;
  return sortedFrames[Math.min(sortedFrames.length - 1, Math.ceil(sortedFrames.length * percentile) - 1)];
}

function getHeapMb() {
  const memory = performanceMemory();
  if (!memory) return null;
  return memory.usedJSHeapSize / 1024 / 1024;
}

function performanceMemory(): { usedJSHeapSize: number } | null {
  if (typeof performance === 'undefined') return null;
  return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory ?? null;
}
