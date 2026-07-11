import { describe, expect, it } from 'vitest';
import { type AiShaderInspectorViewModelInput, aiShaderInspectorViewModel } from './AiShaderInspectorModel';

const baseInput: AiShaderInspectorViewModelInput = {
  promptTooLong: false,
  sourceConnected: true,
  compileFailed: false,
  generationMessage: null,
  fallbackAvailable: false,
  failed: false,
  generating: false,
  creatingOpenAi: false,
  refining: false,
  validating: false,
  repairing: false,
  generatingFallback: false,
  hasResult: false,
  hasPrompt: false,
};

function view(overrides: Partial<AiShaderInspectorViewModelInput> = {}) {
  return aiShaderInspectorViewModel({ ...baseInput, ...overrides });
}

describe('AiShaderInspectorModel', () => {
  it('describes empty, source-missing, and prompt-limit states', () => {
    expect(view()).toMatchObject({ summary: 'empty', primaryActionLabel: 'Create with AI', status: null });
    expect(view({ sourceConnected: false })).toMatchObject({
      summary: 'needs source',
      primaryActionLabel: 'Connect Source First',
      status: { title: 'Connect source', tone: 'info' },
    });
    expect(view({ promptTooLong: true })).toMatchObject({
      summary: 'too long',
      primaryActionLabel: 'Shorten Prompt',
      status: { title: 'Prompt is too long', tone: 'warning' },
    });
  });

  it('keeps generation phases distinct for the loading state and action', () => {
    expect(view({ generating: true, creatingOpenAi: true })).toMatchObject({
      summary: 'creating',
      primaryActionLabel: 'Creating...',
      loading: { title: 'Creating shader' },
    });
    expect(view({ generating: true, validating: true })).toMatchObject({
      primaryActionLabel: 'Checking...',
      loading: { title: 'Checking shader' },
    });
    expect(view({ generating: true, repairing: true })).toMatchObject({
      primaryActionLabel: 'Repairing...',
      loading: { title: 'Repairing shader' },
    });
    expect(view({ generating: true, refining: true })).toMatchObject({
      primaryActionLabel: 'Refining...',
      loading: { title: 'Refining shader' },
    });
    expect(view({ generating: true, generatingFallback: true })).toMatchObject({
      loading: { title: 'Making local draft' },
    });
  });

  it('prioritizes actionable failures and labels fallback explicitly', () => {
    expect(
      view({
        generationMessage: 'Provider unavailable.',
        failed: true,
        fallbackAvailable: true,
      }),
    ).toMatchObject({
      summary: 'choose next',
      primaryActionLabel: 'Try Again',
      status: { title: 'Could not create', message: 'Provider unavailable.', tone: 'warning' },
    });
    expect(view({ compileFailed: true, compileMessage: 'Uniform is missing.' })).toMatchObject({
      summary: 'try again',
      status: { title: 'Could not prepare this result', message: 'Uniform is missing.', tone: 'warning' },
    });
  });

  it('describes accepted AI, repaired, refined, and local results', () => {
    expect(view({ hasResult: true, provenance: { source: 'openai', attempt: 'initial' } })).toMatchObject({
      summary: 'ready',
      primaryActionLabel: 'Create New Version',
      status: { title: 'AI version' },
    });
    expect(view({ hasResult: true, provenance: { source: 'openai', attempt: 'repair' } }).status?.title).toBe(
      'AI version · repaired',
    );
    expect(view({ hasResult: true, provenance: { source: 'openai', attempt: 'refine' } }).status?.title).toBe(
      'AI version · refined',
    );
    expect(view({ hasResult: true, provenance: { source: 'localFallback' } }).status?.title).toBe('Local draft');
  });
});
