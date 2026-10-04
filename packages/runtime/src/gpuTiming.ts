/**
 * Per-effect budget: one effect alone at 540px, median GPU time on the reference machine (docs/runtime/README.md,
 * "GPU budget"). CI has no timer queries, so it is checked by hand with `RUNTIME_GPU_BUDGET=1`.
 */
export const GPU_BUDGET_MS = 2;

/** GPU time of a draw call sequence, from `EXT_disjoint_timer_query_webgl2`. */
export interface GpuTiming {
  /** Median over the valid samples, in milliseconds. */
  readonly medianMs: number;
  readonly samples: readonly number[];
}

export interface GpuTimingOptions {
  /** Timed renders. Default 15. */
  readonly samples?: number;
  /** Untimed renders first, so shader compilation and uploads are not measured. Default 2. */
  readonly warmup?: number;
  /** Resolves on the next frame; query results arrive asynchronously. Defaults to `requestAnimationFrame`. */
  readonly nextFrame?: () => Promise<void>;
  /** Gives up on pending queries after this many frames. Default 120. */
  readonly maxFrames?: number;
}

interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

const TIMER_QUERY_EXTENSION = 'EXT_disjoint_timer_query_webgl2';

export function gpuTimingSupported(gl: WebGL2RenderingContext): boolean {
  return gl.getExtension(TIMER_QUERY_EXTENSION) !== null;
}

/**
 * Measures `render` on the GPU, one query per sample. Returns `null` when the context has no timer query extension
 * (most headless and Firefox/Safari contexts), or when every sample was invalidated by a disjoint event.
 */
export async function measureGpuTime(
  gl: WebGL2RenderingContext,
  render: () => void,
  options: GpuTimingOptions = {},
): Promise<GpuTiming | null> {
  const ext = gl.getExtension(TIMER_QUERY_EXTENSION) as TimerQueryExtension | null;
  if (!ext) return null;
  const nextFrame = options.nextFrame ?? defaultNextFrame;
  for (let index = 0; index < (options.warmup ?? 2); index += 1) render();

  // Clear a disjoint flag left by earlier work.
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const queries: WebGLQuery[] = [];
  for (let index = 0; index < (options.samples ?? 15); index += 1) {
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    render();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    queries.push(query);
  }
  gl.flush();

  const maxFrames = options.maxFrames ?? 120;
  let frames = 0;
  const last = queries[queries.length - 1];
  while (last && !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE)) {
    if (frames >= maxFrames) break;
    frames += 1;
    await nextFrame();
  }
  const disjoint = Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT));
  const samples: number[] = [];
  for (const query of queries) {
    if (!disjoint && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      samples.push((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6);
    }
    gl.deleteQuery(query);
  }
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { medianMs, samples };
}

function defaultNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}
