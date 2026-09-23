type Kind = 'preview' | 'export';

/** Transient work ownership: superseded jobs can never publish or download. */
export class RenderJobs {
  private jobs = new Map<Kind, AbortController>();

  cancel(kind: Kind) {
    this.jobs.get(kind)?.abort();
    this.jobs.delete(kind);
  }

  invalidate() {
    this.cancel('preview');
    this.cancel('export');
  }

  async run<T>(
    kind: Kind,
    work: (signal: AbortSignal) => Promise<T>,
    publish: (value: T) => void,
    failed: (error: unknown) => void,
    settled: () => void = () => {},
  ) {
    this.cancel(kind);
    const controller = new AbortController();
    this.jobs.set(kind, controller);
    const current = () => this.jobs.get(kind) === controller && !controller.signal.aborted;
    try {
      const result = await work(controller.signal);
      if (current()) publish(result);
    } catch (error) {
      if (current()) failed(error);
    } finally {
      if (current()) {
        this.jobs.delete(kind);
        settled();
      }
    }
  }
}
