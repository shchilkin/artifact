import type { GenerationQueuePayload } from './contracts.js';

export const GENERATION_QUEUE_NAME = 'ai-generation';

export type QueueJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface QueueJob<TPayload> {
  readonly id: string;
  readonly name: string;
  readonly data: TPayload;
  readonly attemptsMade: number;
  readonly createdAt: Date;
  readonly status: QueueJobStatus;
}

export interface QueueWorker {
  close(): Promise<void>;
}

export interface QueueEnqueueOptions {
  jobId?: string;
  name?: string;
}

export interface QueuePort<TPayload> {
  enqueue(payload: TPayload, options?: QueueEnqueueOptions): Promise<QueueJob<TPayload>>;
  process(handler: (job: QueueJob<TPayload>) => Promise<void>): QueueWorker;
}

interface MutableQueueJob<TPayload> {
  id: string;
  name: string;
  data: TPayload;
  attemptsMade: number;
  createdAt: Date;
  status: QueueJobStatus;
}

export class InMemoryQueue<TPayload> implements QueuePort<TPayload> {
  private readonly pending: MutableQueueJob<TPayload>[] = [];
  private processor?: (job: QueueJob<TPayload>) => Promise<void>;
  private closed = false;
  private idSequence = 0;

  async enqueue(payload: TPayload, options: QueueEnqueueOptions = {}): Promise<QueueJob<TPayload>> {
    if (this.closed) throw new Error('Cannot enqueue into a closed queue');

    const job: MutableQueueJob<TPayload> = {
      id: options.jobId ?? this.nextJobId(),
      name: options.name ?? GENERATION_QUEUE_NAME,
      data: payload,
      attemptsMade: 0,
      createdAt: new Date(),
      status: 'queued',
    };

    this.pending.push(job);
    this.drain();

    return snapshotJob(job);
  }

  process(handler: (job: QueueJob<TPayload>) => Promise<void>): QueueWorker {
    if (this.closed) throw new Error('Cannot process a closed queue');
    if (this.processor) throw new Error('Queue processor is already registered');

    this.processor = handler;
    this.drain();

    return {
      close: async () => {
        this.closed = true;
        this.processor = undefined;
      },
    };
  }

  private drain() {
    const processor = this.processor;
    if (!processor || this.closed) return;

    const next = this.pending.shift();
    if (!next) return;

    next.status = 'running';
    next.attemptsMade += 1;

    void processor(snapshotJob(next))
      .then(() => {
        next.status = 'succeeded';
      })
      .catch(() => {
        next.status = 'failed';
      })
      .finally(() => {
        this.drain();
      });
  }

  private nextJobId() {
    this.idSequence += 1;
    return `memory-job-${this.idSequence}`;
  }
}

export type GenerationQueue = QueuePort<GenerationQueuePayload>;

export function createInMemoryGenerationQueue(): GenerationQueue {
  return new InMemoryQueue<GenerationQueuePayload>();
}

function snapshotJob<TPayload>(job: MutableQueueJob<TPayload>): QueueJob<TPayload> {
  return {
    id: job.id,
    name: job.name,
    data: job.data,
    attemptsMade: job.attemptsMade,
    createdAt: new Date(job.createdAt),
    status: job.status,
  };
}
