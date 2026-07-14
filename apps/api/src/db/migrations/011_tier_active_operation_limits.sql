DROP INDEX IF EXISTS ai_operations_one_active_per_user_idx;
DROP INDEX IF EXISTS ai_generation_jobs_one_active_per_user_idx;

CREATE INDEX IF NOT EXISTS ai_operations_active_per_user_idx
  ON ai_operations (user_id)
  WHERE status IN ('reserved', 'running');

CREATE INDEX IF NOT EXISTS ai_generation_jobs_active_per_user_idx
  ON ai_generation_jobs (user_id)
  WHERE status IN ('queued', 'running');
