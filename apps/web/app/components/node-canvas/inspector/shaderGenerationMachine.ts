import { assign, setup } from 'xstate';

import type { AiShaderSpecSource } from '../../../types/aiGeneration';

interface ShaderGenerationMachineContext {
  message: string | null;
  source: AiShaderSpecSource | null;
  model: string | undefined;
}

export type ShaderGenerationMachineEvent =
  | { type: 'CREATE_OPENAI' }
  | { type: 'OPENAI_DONE'; message: string; source: AiShaderSpecSource; model?: string }
  | { type: 'OPENAI_FAILED'; message: string }
  | { type: 'CREATE_FALLBACK' }
  | { type: 'FALLBACK_DONE'; message: string; source: AiShaderSpecSource; model?: string }
  | { type: 'FALLBACK_FAILED'; message: string }
  | { type: 'RESET' };

export const shaderGenerationMachine = setup({
  types: {
    context: {} as ShaderGenerationMachineContext,
    events: {} as ShaderGenerationMachineEvent,
  },
  actions: {
    clear: assign({
      message: null,
      source: null,
      model: undefined,
    }),
    startOpenAi: assign({
      message: 'Creating an editable shader.',
      source: null,
      model: undefined,
    }),
    startFallback: assign({
      message: 'Creating a local version from the prompt.',
      source: null,
      model: undefined,
    }),
    markOpenAiSuccess: assign({
      message: ({ event }) => (event.type === 'OPENAI_DONE' ? event.message : null),
      source: ({ event }) => (event.type === 'OPENAI_DONE' ? event.source : null),
      model: ({ event }) => (event.type === 'OPENAI_DONE' ? event.model : undefined),
    }),
    markOpenAiFailure: assign({
      message: ({ event }) => (event.type === 'OPENAI_FAILED' ? event.message : null),
      source: null,
      model: undefined,
    }),
    markFallbackSuccess: assign({
      message: ({ event }) => (event.type === 'FALLBACK_DONE' ? event.message : null),
      source: ({ event }) => (event.type === 'FALLBACK_DONE' ? event.source : null),
      model: ({ event }) => (event.type === 'FALLBACK_DONE' ? event.model : undefined),
    }),
    markFallbackFailure: assign({
      message: ({ event }) => (event.type === 'FALLBACK_FAILED' ? event.message : null),
      source: null,
      model: undefined,
    }),
  },
}).createMachine({
  id: 'shaderGeneration',
  initial: 'idle',
  context: {
    message: null,
    source: null,
    model: undefined,
  },
  on: {
    RESET: { target: '.idle', actions: 'clear' },
  },
  states: {
    idle: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
      },
    },
    creatingOpenAi: {
      on: {
        OPENAI_DONE: { target: 'succeeded', actions: 'markOpenAiSuccess' },
        OPENAI_FAILED: { target: 'fallbackOffered', actions: 'markOpenAiFailure' },
      },
    },
    fallbackOffered: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
        CREATE_FALLBACK: { target: 'creatingFallback', actions: 'startFallback' },
      },
    },
    creatingFallback: {
      on: {
        FALLBACK_DONE: { target: 'succeeded', actions: 'markFallbackSuccess' },
        FALLBACK_FAILED: { target: 'failed', actions: 'markFallbackFailure' },
      },
    },
    succeeded: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
      },
    },
    failed: {
      on: {
        CREATE_OPENAI: { target: 'creatingOpenAi', actions: 'startOpenAi' },
        CREATE_FALLBACK: { target: 'creatingFallback', actions: 'startFallback' },
      },
    },
  },
});
