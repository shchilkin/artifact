export const ACTIVE_GENERATION_JOB_INDEX = 'ai_generation_jobs_one_active_per_user_idx';

export class ActiveGenerationJobExistsError extends Error {
  constructor(readonly userId: string) {
    super(`Active generation job already exists for user: ${userId}`);
    this.name = 'ActiveGenerationJobExistsError';
  }
}

export function isActiveGenerationJobExistsError(error: unknown): error is ActiveGenerationJobExistsError {
  return error instanceof ActiveGenerationJobExistsError;
}

export function isActiveGenerationJobUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const pgError = error as { code?: unknown; constraint?: unknown };
  return pgError.code === '23505' && pgError.constraint === ACTIVE_GENERATION_JOB_INDEX;
}
