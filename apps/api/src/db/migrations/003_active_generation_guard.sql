CREATE UNIQUE INDEX IF NOT EXISTS ai_generation_jobs_one_active_per_user_idx
  ON ai_generation_jobs (user_id)
  WHERE status IN ('queued', 'running');
