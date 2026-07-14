import type { ShaderDefinitionProvenance } from '@artifact/shared';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';

export interface AiShaderInspectorStatus {
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
}

export interface AiShaderInspectorViewModelInput {
  promptTooLong: boolean;
  sourceConnected: boolean;
  compileFailed: boolean;
  compileMessage?: string;
  generationMessage: string | null;
  fallbackAvailable: boolean;
  blocked: boolean;
  failed: boolean;
  provenance?: ShaderDefinitionProvenance;
  generating: boolean;
  creatingOpenAi: boolean;
  refining: boolean;
  validating: boolean;
  repairing: boolean;
  generatingFallback: boolean;
  hasResult: boolean;
  hasPrompt: boolean;
}

export interface AiShaderInspectorViewModel {
  status: AiShaderInspectorStatus | null;
  summary: string;
  primaryActionLabel: string;
  loading: { title: string; message: string };
}

type ConditionalValue<T> = { when: boolean; value: T };

export function aiShaderInspectorViewModel(input: AiShaderInspectorViewModelInput): AiShaderInspectorViewModel {
  return {
    status: aiShaderInspectorStatus(input),
    summary: aiShaderInspectorSummary(input),
    primaryActionLabel: aiShaderPrimaryActionLabel(input),
    loading: aiShaderLoadingMessage(input),
  };
}

function firstMatching<T>(choices: ConditionalValue<T>[], fallback: T): T {
  return choices.find(({ when }) => when)?.value ?? fallback;
}

function aiShaderInspectorStatus(input: AiShaderInspectorViewModelInput): AiShaderInspectorStatus | null {
  return firstMatching(
    [
      { when: input.promptTooLong, value: promptTooLongStatus },
      { when: !input.sourceConnected, value: sourceMissingStatus },
      { when: input.compileFailed, value: compileFailureStatus(input.compileMessage) },
      { when: Boolean(input.generationMessage), value: generationStatus(input) },
      { when: Boolean(input.provenance), value: provenanceStatus(input.provenance) },
    ],
    null,
  );
}

const promptTooLongStatus: AiShaderInspectorStatus = {
  title: 'Prompt is too long',
  message: `Shorten it to ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer. Nothing was cut off.`,
  tone: 'warning',
};

const sourceMissingStatus: AiShaderInspectorStatus = {
  title: 'Connect source',
  message: 'Connect artwork before creating this effect. Until then, the output stays empty.',
  tone: 'info',
};

function compileFailureStatus(message?: string): AiShaderInspectorStatus {
  return {
    title: 'Could not prepare this result',
    message: message ?? 'Create a new version or adjust the prompt.',
    tone: 'warning',
  };
}

function generationStatus(input: AiShaderInspectorViewModelInput): AiShaderInspectorStatus {
  if (input.blocked) {
    return {
      title: 'Another creation is running',
      message: input.generationMessage ?? '',
      tone: 'info',
    };
  }
  const failed = input.fallbackAvailable || input.failed;
  return {
    title: failed ? 'Could not create' : 'Shader ready',
    message: input.generationMessage ?? '',
    tone: failed ? 'warning' : 'success',
  };
}

const provenanceStatuses: Record<'localFallback' | 'repair' | 'refine' | 'openai', AiShaderInspectorStatus> = {
  localFallback: {
    title: 'Local draft',
    message: 'This local draft is clearly marked and can be tuned below.',
    tone: 'info',
  },
  repair: {
    title: 'AI version · repaired',
    message: 'Created with AI and repaired once after browser validation.',
    tone: 'info',
  },
  refine: {
    title: 'AI version · refined',
    message: 'Refined from the previous accepted AI version.',
    tone: 'info',
  },
  openai: {
    title: 'AI version',
    message: 'Created with AI. Tune the generated controls below.',
    tone: 'info',
  },
};

function provenanceStatus(provenance?: ShaderDefinitionProvenance): AiShaderInspectorStatus {
  if (provenance?.source === 'localFallback') return provenanceStatuses.localFallback;
  if (provenance?.attempt === 'repair' || provenance?.attempt === 'refineRepair') return provenanceStatuses.repair;
  if (provenance?.attempt === 'refine') return provenanceStatuses.refine;
  return provenanceStatuses.openai;
}

function aiShaderInspectorSummary(input: AiShaderInspectorViewModelInput): string {
  return firstMatching(
    [
      { when: input.generating, value: 'creating' },
      { when: input.blocked, value: 'wait' },
      { when: input.fallbackAvailable, value: 'choose next' },
      { when: input.failed || input.compileFailed, value: 'try again' },
      { when: input.promptTooLong, value: 'too long' },
      { when: !input.sourceConnected, value: 'needs source' },
      { when: input.hasResult, value: 'ready' },
      { when: input.hasPrompt, value: 'ready to create' },
    ],
    'empty',
  );
}

function aiShaderPrimaryActionLabel(input: AiShaderInspectorViewModelInput): string {
  return firstMatching(
    [
      { when: input.creatingOpenAi, value: 'Creating...' },
      { when: input.refining, value: 'Refining...' },
      { when: input.validating, value: 'Checking...' },
      { when: input.repairing, value: 'Repairing...' },
      { when: input.blocked || input.fallbackAvailable || input.failed || input.compileFailed, value: 'Try Again' },
      { when: input.promptTooLong, value: 'Shorten Prompt' },
      { when: !input.sourceConnected, value: 'Connect Source First' },
      { when: input.hasResult, value: 'Create New Version' },
    ],
    'Create with AI',
  );
}

function aiShaderLoadingMessage(input: AiShaderInspectorViewModelInput) {
  return firstMatching(
    [
      {
        when: input.repairing,
        value: {
          title: 'Repairing shader',
          message: 'Adjusting the result once so it works in this browser.',
        },
      },
      {
        when: input.refining,
        value: {
          title: 'Refining shader',
          message: 'Updating the accepted version while keeping it visible until the new result passes.',
        },
      },
      {
        when: input.validating,
        value: {
          title: 'Checking shader',
          message: 'Making sure the result works before replacing your current shader.',
        },
      },
      {
        when: input.generatingFallback,
        value: {
          title: 'Making local draft',
          message: 'Making an editable local version from this prompt.',
        },
      },
    ],
    {
      title: 'Creating shader',
      message: 'Creating the effect and its editable controls. This may take a few seconds.',
    },
  );
}
