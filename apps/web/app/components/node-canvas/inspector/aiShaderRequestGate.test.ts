import { describe, expect, it } from 'vitest';
import { type AiShaderRequestRef, beginAiShaderRequest, finishAiShaderRequest } from './aiShaderRequestGate';

describe('AI shader request gate', () => {
  it('keeps a rapid second submission from starting beside the active request', () => {
    const requestRef: AiShaderRequestRef = { current: null };

    const first = beginAiShaderRequest(requestRef);
    const second = beginAiShaderRequest(requestRef);

    expect(first).toBeInstanceOf(AbortController);
    expect(second).toBeNull();

    finishAiShaderRequest(requestRef, first as AbortController);
    expect(beginAiShaderRequest(requestRef)).toBeInstanceOf(AbortController);
  });
});
