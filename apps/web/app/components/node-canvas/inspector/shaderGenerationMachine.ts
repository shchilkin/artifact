import { assign, setup } from 'xstate';

import type { AiShaderSource } from '../../../types/aiGeneration';

interface ShaderGenerationMachineContext {
  message: string | null;
  source: AiShaderSource | null;
  model: string | undefined;
  fallbackAvailable: boolean;
}

export type ShaderGenerationMachineEvent =
  | { type: 'CREATE_OPENAI' }
  | { type: 'REFINE_OPENAI' }
  | { type: 'CANDIDATE_RECEIVED' }
  | { type: 'VALIDATION_PASSED'; message: string; source: AiShaderSource; model?: string }
  | { type: 'VALIDATION_REPAIRABLE'; message: string }
  | { type: 'REPAIR_RECEIVED' }
  | { type: 'VALIDATION_FAILED'; message: string; offerFallback?: boolean }
  | { type: 'REPAIR_FAILED'; message: string; offerFallback?: boolean }
  | { type: 'OPERATION_BLOCKED'; message: string }
  | { type: 'CREATE_FALLBACK' }
  | { type: 'FALLBACK_RECEIVED' }
  | { type: 'UNEXPECTED_FAILED'; message: string; offerFallback?: boolean }
  | { type: 'RESET' };

const markMessage = assign({
  message: ({ event }: { event: ShaderGenerationMachineEvent }) => ('message' in event ? event.message : null),
  source: null,
  model: undefined,
  fallbackAvailable: ({ event }: { event: ShaderGenerationMachineEvent }) =>
    (event.type === 'VALIDATION_FAILED' || event.type === 'REPAIR_FAILED' || event.type === 'UNEXPECTED_FAILED') &&
    event.offerFallback === true,
});

export const shaderGenerationMachine = setup({
  types: {
    context: {} as ShaderGenerationMachineContext,
    events: {} as ShaderGenerationMachineEvent,
  },
  actions: {
    clear: assign({ message: null, source: null, model: undefined, fallbackAvailable: false }),
    startOpenAi: assign({
      message: 'Creating an editable shader.',
      source: null,
      model: undefined,
      fallbackAvailable: false,
    }),
    startRefine: assign({
      message: 'Refining the accepted shader.',
      source: null,
      model: undefined,
      fallbackAvailable: false,
    }),
    startValidation: assign({ message: 'Checking the result in this browser.' }),
    startRepair: assign({
      message: 'Repairing the result for this browser.',
      source: null,
      model: undefined,
      fallbackAvailable: false,
    }),
    startFallback: assign({
      message: 'Creating a local version from the prompt.',
      source: null,
      model: undefined,
      fallbackAvailable: false,
    }),
    markMessage,
    markSuccess: assign({
      message: ({ event }) => (event.type === 'VALIDATION_PASSED' ? event.message : null),
      source: ({ event }) => (event.type === 'VALIDATION_PASSED' ? event.source : null),
      model: ({ event }) => (event.type === 'VALIDATION_PASSED' ? event.model : undefined),
      fallbackAvailable: false,
    }),
  },
}).createMachine({
  id: 'shaderGeneration',
  initial: 'idle',
  context: { message: null, source: null, model: undefined, fallbackAvailable: false },
  on: {
    RESET: { target: '.idle', actions: 'clear' },
    UNEXPECTED_FAILED: { target: '.failed', actions: 'markMessage' },
    OPERATION_BLOCKED: { target: '.blocked', actions: 'markMessage' },
  },
  states: {
    idle: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
        REFINE_OPENAI: { target: 'creatingRefine', actions: 'startRefine' },
      },
    },
    creatingOpenAi: {
      tags: ['generating'],
      on: {
        CANDIDATE_RECEIVED: { target: 'validating', actions: 'startValidation' },
      },
    },
    creatingRefine: {
      tags: ['generating'],
      on: {
        CANDIDATE_RECEIVED: { target: 'validating', actions: 'startValidation' },
      },
    },
    validating: {
      tags: ['generating', 'validating'],
      on: {
        VALIDATION_PASSED: { target: 'succeeded', actions: 'markSuccess' },
        VALIDATION_REPAIRABLE: { target: 'repairing', actions: 'startRepair' },
        VALIDATION_FAILED: { target: 'failed', actions: 'markMessage' },
      },
    },
    repairing: {
      tags: ['generating'],
      on: {
        REPAIR_RECEIVED: { target: 'validatingRepair', actions: 'startValidation' },
        REPAIR_FAILED: { target: 'failed', actions: 'markMessage' },
      },
    },
    validatingRepair: {
      tags: ['generating', 'validating'],
      on: {
        VALIDATION_PASSED: { target: 'succeeded', actions: 'markSuccess' },
        VALIDATION_FAILED: { target: 'failed', actions: 'markMessage' },
      },
    },
    creatingFallback: {
      tags: ['generating'],
      on: {
        FALLBACK_RECEIVED: { target: 'validatingFallback', actions: 'startValidation' },
      },
    },
    validatingFallback: {
      tags: ['generating', 'validating'],
      on: {
        VALIDATION_PASSED: { target: 'succeeded', actions: 'markSuccess' },
        VALIDATION_FAILED: { target: 'failed', actions: 'markMessage' },
      },
    },
    succeeded: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
        REFINE_OPENAI: { target: 'creatingRefine', actions: 'startRefine' },
      },
    },
    blocked: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
        REFINE_OPENAI: { target: 'creatingRefine', actions: 'startRefine' },
      },
    },
    failed: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
        REFINE_OPENAI: { target: 'creatingRefine', actions: 'startRefine' },
        CREATE_FALLBACK: { target: 'creatingFallback', actions: 'startFallback' },
      },
    },
  },
});
