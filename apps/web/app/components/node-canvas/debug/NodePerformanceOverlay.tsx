import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { type OverlayPosition, PERF_OVERLAY_DEFAULT_POSITION, parsePerfOverlayPosition } from './perfOverlayModel';

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

interface OverlayDragState {
  origin: OverlayPosition;
  pointerId: number;
  startX: number;
  startY: number;
}

interface OverlayDragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

const PERF_OVERLAY_STORAGE_KEY = 'artifact-node-perf-overlay-position';
const PERF_OVERLAY_MARGIN = 12;

export function NodePerformanceOverlay({ debugEnabled, nodeCount }: NodePerformanceOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const { dragHandlers, position } = usePerfOverlayPosition(overlayRef);
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
    <div
      ref={overlayRef}
      className={`node-perf-overlay${debugEnabled ? ' node-perf-overlay-debug' : ''}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      aria-live="polite"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <NodePerfDragHeader debugEnabled={debugEnabled} dragHandlers={dragHandlers} />
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

function usePerfOverlayPosition(overlayRef: RefObject<HTMLDivElement | null>) {
  const dragRef = useRef<OverlayDragState | null>(null);
  const [position, setPosition] = useState(readStoredPerfOverlayPosition);
  const positionRef = useRef(position);
  const clampPosition = useCallback(
    (next: OverlayPosition) => {
      return clampPerfOverlayPosition(next, overlayRef.current);
    },
    [overlayRef],
  );

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition]);

  return {
    dragHandlers: usePerfOverlayDrag(dragRef, positionRef, setPosition, clampPosition),
    position,
  };
}

function usePerfOverlayDrag(
  dragRef: RefObject<OverlayDragState | null>,
  positionRef: RefObject<OverlayPosition>,
  setPosition: Dispatch<SetStateAction<OverlayPosition>>,
  clampPosition: (next: OverlayPosition) => OverlayPosition,
): OverlayDragHandlers {
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        origin: positionRef.current,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [dragRef, positionRef],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = activePerfOverlayDrag(dragRef.current, event.pointerId);
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const next = clampPosition(nextPerfOverlayDragPosition(drag, event));
      positionRef.current = next;
      setPosition(next);
    },
    [clampPosition, dragRef, positionRef, setPosition],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activePerfOverlayDrag(dragRef.current, event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = null;
      storePerfOverlayPosition(positionRef.current);
    },
    [dragRef, positionRef],
  );

  return { onPointerCancel: onPointerUp, onPointerDown, onPointerMove, onPointerUp };
}

function activePerfOverlayDrag(drag: OverlayDragState | null, pointerId: number) {
  return drag?.pointerId === pointerId ? drag : null;
}

function nextPerfOverlayDragPosition(drag: OverlayDragState, event: ReactPointerEvent<HTMLDivElement>) {
  return {
    x: drag.origin.x + event.clientX - drag.startX,
    y: drag.origin.y + event.clientY - drag.startY,
  };
}

function readStoredPerfOverlayPosition(): OverlayPosition {
  if (typeof window === 'undefined') return PERF_OVERLAY_DEFAULT_POSITION;
  try {
    return parsePerfOverlayPosition(window.localStorage.getItem(PERF_OVERLAY_STORAGE_KEY));
  } catch {
    return PERF_OVERLAY_DEFAULT_POSITION;
  }
}

function storePerfOverlayPosition(position: OverlayPosition) {
  try {
    window.localStorage.setItem(PERF_OVERLAY_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Ignore storage failures; the panel remains draggable for this session.
  }
}

function clampPerfOverlayPosition(next: OverlayPosition, overlay: HTMLDivElement | null): OverlayPosition {
  const parent = overlay?.parentElement;
  if (!parent || !overlay) return next;
  const maxX = parent.clientWidth - overlay.offsetWidth - PERF_OVERLAY_MARGIN;
  const maxY = parent.clientHeight - overlay.offsetHeight - PERF_OVERLAY_MARGIN;
  return {
    x: clamp(next.x, PERF_OVERLAY_MARGIN, Math.max(PERF_OVERLAY_MARGIN, maxX)),
    y: clamp(next.y, PERF_OVERLAY_MARGIN, Math.max(PERF_OVERLAY_MARGIN, maxY)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function NodePerfDragHeader({
  debugEnabled,
  dragHandlers,
}: {
  debugEnabled: boolean;
  dragHandlers: OverlayDragHandlers;
}) {
  if (!debugEnabled) return null;
  return (
    <div className="node-perf-header" aria-label="Drag performance panel" {...dragHandlers}>
      <span>Perf</span>
    </div>
  );
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
    let pendingMetrics: FrameMetrics | null = null;
    let pendingTimer: number | null = null;
    let lastFrame = performance.now();
    let lastPublish = lastFrame;
    let frames: number[] = [];
    const commitMetrics = () => {
      pendingTimer = null;
      if (!pendingMetrics) return;
      setMetrics(pendingMetrics);
      pendingMetrics = null;
    };
    const scheduleMetricsCommit = (nextMetrics: FrameMetrics) => {
      pendingMetrics = nextMetrics;
      if (pendingTimer !== null) return;
      pendingTimer = window.setTimeout(commitMetrics, 0);
    };

    const tick = (now: number) => {
      frames.push(now - lastFrame);
      lastFrame = now;

      if (now - lastPublish >= 750) {
        scheduleMetricsCommit(frameMetricsSnapshot(frames, longTasksRef.current));
        frames = [];
        lastPublish = now;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
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
