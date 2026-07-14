ALTER TABLE ai_operations
  DROP CONSTRAINT IF EXISTS ai_operations_status_check;

ALTER TABLE ai_operations
  ADD CONSTRAINT ai_operations_status_check CHECK (
    status IN ('reserved', 'running', 'awaiting_validation', 'succeeded', 'failed', 'cancelled', 'expired')
  );

UPDATE ai_operations AS operations
SET status = 'awaiting_validation'
FROM ai_shader_requests AS shaders
WHERE shaders.operation_id = operations.id
  AND operations.status = 'running'
  AND shaders.status IN ('generated', 'client_rejected');
