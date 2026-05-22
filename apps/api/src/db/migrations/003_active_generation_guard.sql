WITH ranked_active_jobs AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status WHEN 'running' THEN 0 ELSE 1 END,
        queued_at DESC,
        created_at DESC,
        id DESC
    ) AS active_rank
  FROM ai_generation_jobs
  WHERE status IN ('queued', 'running')
)
UPDATE ai_generation_jobs
SET
  status = 'expired',
  error_code = 'active_job_guard_migration_expired',
  error_message = 'Expired by migration because another active generation job already existed for this user.',
  retryable = true,
  completed_at = now(),
  expires_at = COALESCE(expires_at, now())
WHERE id IN (
  SELECT id
  FROM ranked_active_jobs
  WHERE active_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_generation_jobs_one_active_per_user_idx
  ON ai_generation_jobs (user_id)
  WHERE status IN ('queued', 'running');
