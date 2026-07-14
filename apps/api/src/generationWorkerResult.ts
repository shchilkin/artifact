export type GenerationWorkerResult =
  | { status: 'succeeded' }
  | { status: 'failed'; code: string }
  | { status: 'skipped' };
