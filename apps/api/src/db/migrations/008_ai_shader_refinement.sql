ALTER TABLE ai_shader_requests
  ADD COLUMN IF NOT EXISTS parent_request_id text NULL
    REFERENCES ai_shader_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_shader_requests_parent_idx
  ON ai_shader_requests (parent_request_id);
