export interface AiShaderRequestRef {
  current: AbortController | null;
}

export function beginAiShaderRequest(requestRef: AiShaderRequestRef): AbortController | null {
  if (requestRef.current) return null;
  const controller = new AbortController();
  requestRef.current = controller;
  return controller;
}

export function finishAiShaderRequest(requestRef: AiShaderRequestRef, controller: AbortController) {
  if (requestRef.current === controller) requestRef.current = null;
}
