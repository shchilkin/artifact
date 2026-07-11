import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useArtifactAuth } from '../../../hooks/useArtifactAuth';
import type {
  AiShaderGenerationResponse,
  AiShaderRequestMode,
  CreateAiShaderRequest,
} from '../../../types/aiGeneration';
import type { GraphShaderNode } from '../../../types/config';
import { createAiIdempotencyKey } from '../../../utils/aiGenerationClient';
import { getArtifactAiApiBaseUrl } from '../../../utils/apiBaseUrl';
import { useNodeCanvasActions } from '../context';
import type { ShaderNodeGenerationStatus } from '../types';
import {
  type AiShaderGenerationPhase,
  type AiShaderGenerationResult,
  runAiShaderGeneration,
} from './aiShaderGenerationController';
import {
  browserValidationFailureMessage,
  shaderGenerationError,
  shaderGenerationSuccessMessage,
  shaderRepairError,
} from './aiShaderGenerationMessages';
import { canCreateAiShader } from './ShaderInspectorModel';
import { type ShaderGenerationMachineEvent, shaderGenerationMachine } from './shaderGenerationMachine';

interface GenerationIntent {
  mode: AiShaderRequestMode;
  prompt: string;
  isRefinement: boolean;
}

interface GenerationCompletion {
  accepted: boolean;
  event: ShaderGenerationMachineEvent;
  status: ShaderNodeGenerationStatus | null;
}

const GENERATION_START: Record<'openai' | 'localFallback' | 'refine', GenerationCompletion> = {
  openai: { accepted: false, event: { type: 'CREATE_OPENAI' }, status: 'creatingOpenAi' },
  localFallback: { accepted: false, event: { type: 'CREATE_FALLBACK' }, status: 'creatingFallback' },
  refine: { accepted: false, event: { type: 'REFINE_OPENAI' }, status: 'creatingRefine' },
};

export function useAiShaderGeneration({
  shaderNode,
  onChange,
  prompt,
  sourceConnected,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  prompt: string;
  sourceConnected: boolean;
}) {
  const [state, send] = useMachine(shaderGenerationMachine);
  const requestRef = useRef<AbortController | null>(null);
  const openAiRequestKeyRef = useRef<string | null>(null);
  const auth = useArtifactAuth();
  const { setShaderNodeGenerationStatus } = useNodeCanvasActions();
  const apiBaseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const validating = state.hasTag('validating');
  const repairing = state.matches('repairing');
  const refining = state.matches('creatingRefine');
  const generatingFallback = state.matches('creatingFallback');
  const generating = state.hasTag('generating');
  const fallbackAvailable = state.context.fallbackAvailable;
  const canCreate = canCreateAiShader(prompt, sourceConnected, generating);
  const sourceRequestId = shaderNode.shaderInstance?.definition.provenance?.requestId;

  const cancelAndReset = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    openAiRequestKeyRef.current = null;
    send({ type: 'RESET' });
    setShaderNodeGenerationStatus(shaderNode.id, null);
  }, [send, setShaderNodeGenerationStatus, shaderNode.id]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
      setShaderNodeGenerationStatus(shaderNode.id, null);
    },
    [setShaderNodeGenerationStatus, shaderNode.id],
  );

  const canRefine = useCallback(
    (instruction: string) => Boolean(sourceRequestId) && canCreateAiShader(instruction, sourceConnected, generating),
    [generating, sourceConnected, sourceRequestId],
  );

  const applyCompletion = useCallback(
    (completion: GenerationCompletion | null) => {
      if (!completion) return false;
      send(completion.event);
      setShaderNodeGenerationStatus(shaderNode.id, completion.status);
      return completion.accepted;
    },
    [send, setShaderNodeGenerationStatus, shaderNode.id],
  );

  const updateGenerationPhase = useCallback(
    (phase: AiShaderGenerationPhase, mode: AiShaderRequestMode) => {
      applyCompletion(generationPhaseCompletion(phase, mode));
    },
    [applyCompletion],
  );

  const run = useCallback(
    async (mode: AiShaderRequestMode, refinementInstruction?: string) => {
      const intent = prepareGenerationIntent(mode, refinementInstruction, prompt, canCreate, canRefine);
      if (!intent) return false;

      const controller = new AbortController();
      const idempotencyKey = createAiIdempotencyKey('shader');
      const start = generationStart(intent);
      rememberOpenAiRequestKey(openAiRequestKeyRef, intent, idempotencyKey);
      requestRef.current = controller;
      applyCompletion(start);

      try {
        const bearerToken = await resolveBearerToken(devToken, auth.signedIn, auth.getToken);
        const clientOptions = { baseUrl: apiBaseUrl, bearerToken, signal: controller.signal };
        const result = await runAiShaderGeneration({
          request: buildShaderRequest(intent, idempotencyKey, openAiRequestKeyRef.current, sourceRequestId),
          clientOptions,
          commit: (candidate) => commitCandidate(onChange, shaderNode.aiPrompt, intent, candidate),
          onPhase: (phase) => updateGenerationPhase(phase, intent.mode),
        });
        return applyCompletion(generationResultCompletion(result, intent));
      } catch (error) {
        return applyCompletion(generationErrorCompletion(error, intent, controller.signal));
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [
      apiBaseUrl,
      applyCompletion,
      auth.getToken,
      auth.signedIn,
      canCreate,
      canRefine,
      devToken,
      onChange,
      prompt,
      shaderNode.aiPrompt,
      sourceRequestId,
      updateGenerationPhase,
    ],
  );

  return {
    state,
    validating,
    repairing,
    refining,
    generatingFallback,
    generating,
    fallbackAvailable,
    canCreate,
    canRefine,
    create: (mode: AiShaderRequestMode = 'openai') => run(mode),
    refine: (instruction: string) => run('openai', instruction),
    cancelAndReset,
  };
}

function prepareGenerationIntent(
  mode: AiShaderRequestMode,
  refinementInstruction: string | undefined,
  prompt: string,
  canCreate: boolean,
  canRefine: (instruction: string) => boolean,
): GenerationIntent | null {
  if (refinementInstruction === undefined) {
    return canCreate ? { mode, prompt: prompt.trim(), isRefinement: false } : null;
  }
  return canRefine(refinementInstruction) ? { mode, prompt: refinementInstruction.trim(), isRefinement: true } : null;
}

function generationStart(intent: GenerationIntent) {
  const key = intent.isRefinement ? 'refine' : intent.mode;
  return GENERATION_START[key];
}

function rememberOpenAiRequestKey(
  requestKeyRef: { current: string | null },
  intent: GenerationIntent,
  idempotencyKey: string,
) {
  if (intent.mode === 'openai' && !intent.isRefinement) requestKeyRef.current = idempotencyKey;
}

function buildShaderRequest(
  intent: GenerationIntent,
  idempotencyKey: string,
  fallbackForIdempotencyKey: string | null,
  sourceRequestId: string | undefined,
): CreateAiShaderRequest {
  const request: CreateAiShaderRequest = { prompt: intent.prompt, mode: intent.mode, idempotencyKey };
  addFallbackReference(request, intent.mode, fallbackForIdempotencyKey);
  addRefinementReference(request, intent.isRefinement, sourceRequestId);
  return request;
}

function addFallbackReference(
  request: CreateAiShaderRequest,
  mode: AiShaderRequestMode,
  fallbackForIdempotencyKey: string | null,
) {
  if (mode === 'localFallback' && fallbackForIdempotencyKey) {
    request.fallbackForIdempotencyKey = fallbackForIdempotencyKey;
  }
}

function addRefinementReference(
  request: CreateAiShaderRequest,
  isRefinement: boolean,
  sourceRequestId: string | undefined,
) {
  if (isRefinement && sourceRequestId) request.refineFromRequestId = sourceRequestId;
}

async function resolveBearerToken(
  devToken: string | undefined,
  signedIn: boolean,
  getToken: () => Promise<string | null>,
) {
  if (devToken) return devToken;
  if (!signedIn) return undefined;
  return (await getToken()) ?? undefined;
}

function commitCandidate(
  onChange: (patch: Partial<GraphShaderNode>) => void,
  currentPrompt: string | undefined,
  intent: GenerationIntent,
  candidate: AiShaderGenerationResponse,
) {
  onChange({
    shaderKind: 'aiShader',
    role: 'effect',
    aiPrompt: intent.isRefinement ? currentPrompt : candidate.prompt,
    name: candidate.instance.definition.label,
    shaderInstance: candidate.instance,
  });
}

function generationPhaseCompletion(phase: AiShaderGenerationPhase, mode: AiShaderRequestMode): GenerationCompletion {
  if (phase === 'repairing') {
    return {
      accepted: false,
      event: { type: 'VALIDATION_REPAIRABLE', message: 'Repairing this result for your browser.' },
      status: 'repairing',
    };
  }
  if (phase === 'repairReceived') {
    return { accepted: false, event: { type: 'REPAIR_RECEIVED' }, status: 'validating' };
  }
  const event: ShaderGenerationMachineEvent =
    mode === 'localFallback' ? { type: 'FALLBACK_RECEIVED' } : { type: 'CANDIDATE_RECEIVED' };
  return { accepted: false, event, status: 'validating' };
}

function generationResultCompletion(
  result: AiShaderGenerationResult,
  intent: GenerationIntent,
): GenerationCompletion | null {
  if (result.kind === 'cancelled') return null;
  if (result.kind === 'accepted') return acceptedCompletion(result.candidate);
  return failedCompletion(result, intent);
}

function acceptedCompletion(candidate: AiShaderGenerationResponse): GenerationCompletion {
  return {
    accepted: true,
    event: {
      type: 'VALIDATION_PASSED',
      message: shaderGenerationSuccessMessage(candidate.attempt, candidate.source),
      source: candidate.source,
      model: candidate.model,
    },
    status: null,
  };
}

function failedCompletion(
  result: Exclude<AiShaderGenerationResult, { kind: 'accepted' | 'cancelled' }>,
  intent: GenerationIntent,
): GenerationCompletion {
  if (result.kind === 'repairFailed') {
    return failedGeneration({
      type: 'REPAIR_FAILED',
      message: shaderRepairError(result.error),
      offerFallback: !intent.isRefinement,
    });
  }
  return failedGeneration({
    type: 'VALIDATION_FAILED',
    message: browserValidationFailureMessage(intent.mode, result.repaired),
    offerFallback: offerFallback(intent),
  });
}

function failedGeneration(event: ShaderGenerationMachineEvent): GenerationCompletion {
  return { accepted: false, event, status: 'failed' };
}

function generationErrorCompletion(
  error: unknown,
  intent: GenerationIntent,
  signal: AbortSignal,
): GenerationCompletion | null {
  if (signal.aborted) return null;
  const failure = shaderGenerationError(error, intent.mode);
  return failedGeneration({
    type: 'UNEXPECTED_FAILED',
    message: failure.message,
    offerFallback: offerFallback(intent) && failure.offerFallback,
  });
}

function offerFallback(intent: GenerationIntent) {
  return intent.mode === 'openai' && !intent.isRefinement;
}

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}
