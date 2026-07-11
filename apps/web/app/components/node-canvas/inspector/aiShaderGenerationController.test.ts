import { describe, expect, it, vi } from 'vitest';
import type { AiShaderGenerationResponse } from '../../../types/aiGeneration';
import { runAiShaderGeneration } from './aiShaderGenerationController';

const candidate = {
  requestId: 'request-1',
  candidateRevision: 0,
  status: 'generated',
  attempt: 'initial',
  prompt: 'water refraction',
  source: 'openai',
  instance: {
    definition: {
      version: 1,
      id: 'shader-1',
      label: 'Water',
      language: 'glsl-fragment',
      code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
      properties: [],
    },
    values: {},
  },
} satisfies AiShaderGenerationResponse;

const request = { prompt: candidate.prompt, mode: 'openai', idempotencyKey: 'idempotency-1' } as const;
type RunOptions = Parameters<typeof runAiShaderGeneration>[0];

function runController(overrides: Partial<RunOptions> = {}) {
  return runAiShaderGeneration({
    request,
    clientOptions: {},
    commit: vi.fn(),
    onPhase: vi.fn(),
    ...overrides,
  });
}

describe('runAiShaderGeneration', () => {
  it('returns an accepted candidate without entering repair', async () => {
    const phases: string[] = [];
    const repair = vi.fn();
    const result = await runController({
      onPhase: (phase) => phases.push(phase),
      dependencies: {
        create: vi.fn().mockResolvedValue(candidate),
        repair,
        validate: vi.fn().mockResolvedValue({ accepted: true }),
      },
    });

    expect(result).toEqual({ kind: 'accepted', candidate });
    expect(phases).toEqual(['candidateReceived']);
    expect(repair).not.toHaveBeenCalled();
  });

  it('repairs one rejected OpenAI candidate and validates the replacement', async () => {
    const repaired = { ...candidate, candidateRevision: 1, attempt: 'repair' } satisfies AiShaderGenerationResponse;
    const phases: string[] = [];
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ accepted: false, repairAvailable: true, message: 'Compile failed.' })
      .mockResolvedValueOnce({ accepted: true });
    const result = await runController({
      onPhase: (phase) => phases.push(phase),
      dependencies: {
        create: vi.fn().mockResolvedValue(candidate),
        repair: vi.fn().mockResolvedValue(repaired),
        validate,
      },
    });

    expect(result).toEqual({ kind: 'accepted', candidate: repaired });
    expect(phases).toEqual(['candidateReceived', 'repairing', 'repairReceived']);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('never repairs a rejected local fallback', async () => {
    const repair = vi.fn();
    const result = await runController({
      request: { ...request, mode: 'localFallback', fallbackForIdempotencyKey: 'failed-openai' },
      dependencies: {
        create: vi.fn().mockResolvedValue({ ...candidate, source: 'localFallback', attempt: 'localFallback' }),
        repair,
        validate: vi.fn().mockResolvedValue({ accepted: false, repairAvailable: true, message: 'Rejected.' }),
      },
    });

    expect(result).toEqual({ kind: 'rejected', repaired: false });
    expect(repair).not.toHaveBeenCalled();
  });

  it('returns repair failures without losing the original error', async () => {
    const error = new Error('Provider timeout');
    const result = await runController({
      dependencies: {
        create: vi.fn().mockResolvedValue(candidate),
        repair: vi.fn().mockRejectedValue(error),
        validate: vi.fn().mockResolvedValue({ accepted: false, repairAvailable: true, message: 'Rejected.' }),
      },
    });

    expect(result).toEqual({ kind: 'repairFailed', error });
  });

  it('stops before validation when a completed create belongs to an aborted request', async () => {
    const controller = new AbortController();
    const phases: string[] = [];
    const validate = vi.fn();
    const result = await runController({
      clientOptions: { signal: controller.signal },
      onPhase: (phase) => phases.push(phase),
      dependencies: {
        create: vi.fn().mockImplementation(async () => {
          controller.abort();
          return candidate;
        }),
        validate,
      },
    });

    expect(result).toEqual({ kind: 'cancelled' });
    expect(phases).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
  });
});
