import { type Job as BullJob, Queue as BullQueue, Worker as BullWorker } from 'bullmq';
import { Redis } from 'ioredis';
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
  close?(): Promise<void>;
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

  async close(): Promise<void> {
    this.closed = true;
    this.processor = undefined;
    this.pending.length = 0;
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

export function createBullMqGenerationQueue(redisUrl: string): GenerationQueue {
  return new BullMqGenerationQueue(GENERATION_QUEUE_NAME, redisUrl);
}

export function getBullBoardQueue(queue: GenerationQueue): BullQueue<GenerationQueuePayload, void, string> | null {
  return queue instanceof BullMqGenerationQueue ? queue.bullBoardQueue() : null;
}

class BullMqGenerationQueue implements QueuePort<GenerationQueuePayload> {
  private readonly connection: Redis;
  private readonly queue: BullQueue<GenerationQueuePayload, void, string>;

  constructor(
    private readonly queueName: string,
    redisUrl: string,
  ) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new BullQueue<GenerationQueuePayload, void, string>(queueName, { connection: this.connection });
  }

  async enqueue(
    payload: GenerationQueuePayload,
    options: QueueEnqueueOptions = {},
  ): Promise<QueueJob<GenerationQueuePayload>> {
    const job = await this.queue.add(options.name ?? this.queueName, payload, { jobId: options.jobId });
    return bullJobSnapshot(job, 'queued');
  }

  process(handler: (job: QueueJob<GenerationQueuePayload>) => Promise<void>): QueueWorker {
    const connection = new Redis(this.connection.options);
    const worker = new BullWorker<GenerationQueuePayload, void, string>(
      this.queueName,
      async (job) => {
        await handler(bullJobSnapshot(job, 'running'));
      },
      { connection },
    );

    return {
      close: async () => {
        await worker.close();
        await connection.quit();
      },
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }

  bullBoardQueue() {
    return this.queue;
  }
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

function bullJobSnapshot(
  job: BullJob<GenerationQueuePayload, void, string>,
  status: QueueJobStatus,
): QueueJob<GenerationQueuePayload> {
  return {
    id: String(job.id),
    name: job.name,
    data: job.data,
    attemptsMade: job.attemptsMade,
    createdAt: new Date(job.timestamp),
    status,
  };
}
