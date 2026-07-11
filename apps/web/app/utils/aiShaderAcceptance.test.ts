import { describe, expect, it, vi } from 'vitest';
import type { AiShaderGenerationResponse } from '../types/aiGeneration';
import { validateAndCommitAiShaderCandidate } from './aiShaderAcceptance';

const candidate: AiShaderGenerationResponse = {
  requestId: 'shader-1',
  candidateRevision: 0,
  status: 'generated',
  attempt: 'initial',
  prompt: 'water refraction',
  source: 'openai',
  model: 'test-model',
  instance: {
    definition: {
      version: 1,
      id: 'shader-1-definition',
      label: 'Water Refraction',
      language: 'glsl-fragment',
      code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
      properties: [],
      provenance: { source: 'openai', requestId: 'shader-1', attempt: 'initial' },
    },
    values: {},
  },
};

describe('validateAndCommitAiShaderCandidate', () => {
  it('does not replace the working shader when browser validation rejects a candidate', async () => {
    const commit = vi.fn();
    const report = vi.fn(async () => ({
      requestId: 'shader-1',
      candidateRevision: 0 as const,
      status: 'client_rejected' as const,
      repairAvailable: true,
    }));

    await expect(
      validateAndCommitAiShaderCandidate(candidate, {}, commit, {
        compile: () => ({ ok: false, stage: 'compile', message: 'invalid token' }),
        report,
        browser: 'WebKit',
      }),
    ).resolves.toEqual({ accepted: false, repairAvailable: true, message: 'invalid token' });
    expect(commit).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      'shader-1',
      0,
      'rejected',
      { stage: 'compile', message: 'invalid token', browser: 'WebKit' },
      {},
    );
  });

  it('commits the exact candidate only after the API confirms browser acceptance', async () => {
    const commit = vi.fn();
    const report = vi.fn(async () => ({
      requestId: 'shader-1',
      candidateRevision: 0 as const,
      status: 'accepted' as const,
      repairAvailable: false,
    }));

    await expect(
      validateAndCommitAiShaderCandidate(candidate, {}, commit, {
        compile: () => ({ ok: true, stage: null, message: null }),
        report,
      }),
    ).resolves.toEqual({ accepted: true });
    expect(report).toHaveBeenCalledWith('shader-1', 0, 'accepted', undefined, {});
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(candidate);
  });

  it('does not commit when the API accepted a different candidate revision', async () => {
    const commit = vi.fn();
    const report = vi.fn(async () => ({
      requestId: 'shader-1',
      candidateRevision: 1 as const,
      status: 'accepted' as const,
      repairAvailable: false,
    }));

    await expect(
      validateAndCommitAiShaderCandidate(candidate, {}, commit, {
        compile: () => ({ ok: true, stage: null, message: null }),
        report,
      }),
    ).rejects.toThrow('Shader acceptance was not confirmed for this candidate.');
    expect(commit).not.toHaveBeenCalled();
  });
});
