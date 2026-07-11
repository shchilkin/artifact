import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useArtifactAuth } from '../../../hooks/useArtifactAuth';
import { AI_SHADER_PROMPT_MAX_LENGTH, type AiShaderRequestMode } from '../../../types/aiGeneration';
import type { GraphShaderNode, ShaderPropertyValue } from '../../../types/config';
import {
  AiGenerationApiError,
  createAiIdempotencyKey,
  createAiShader,
  repairAiShader,
} from '../../../utils/aiGenerationClient';
import { validateAndCommitAiShaderCandidate } from '../../../utils/aiShaderAcceptance';
import { getArtifactAiApiBaseUrl } from '../../../utils/apiBaseUrl';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { useNodeCanvasActions } from '../context';
import { codeShaderUniformControls } from './CodeShaderInspectorModel';
import { InspectorSection, InspectorSlider, InspectorTextArea } from './fields';
import { aiShaderEmptyStatus, canCreateAiShader } from './ShaderInspectorModel';
import { ShaderPropertyControl } from './ShaderPropertyControl';
import { ShaderStatusMessage } from './ShaderStatusMessage';
import { shaderGenerationMachine } from './shaderGenerationMachine';

export function AiShaderInspector({
  shaderNode,
  onChange,
  sourceConnected,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  sourceConnected: boolean;
}) {
  const [promptOpen, setPromptOpen] = useState(true);
  const [refineOpen, setRefineOpen] = useState(true);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [controlsOpen, setControlsOpen] = useState(true);
  const [generationState, sendGeneration] = useMachine(shaderGenerationMachine);
  const requestRef = useRef<AbortController | null>(null);
  const openAiRequestKeyRef = useRef<string | null>(null);
  const auth = useArtifactAuth();
  const { setShaderNodeGenerationStatus } = useNodeCanvasActions();
  const apiBaseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const instance = shaderNode.shaderInstance;
  const definition = instance?.definition;
  const provenance = definition?.provenance;
  const prompt = shaderNode.aiPrompt ?? provenance?.prompt ?? '';
  const promptTooLong = prompt.length > AI_SHADER_PROMPT_MAX_LENGTH;
  const hasPrompt = prompt.trim().length >= 3;
  const hasResult = Boolean(definition?.code.trim() && provenance);
  const validating =
    generationState.matches('validating') ||
    generationState.matches('validatingRepair') ||
    generationState.matches('validatingFallback');
  const repairing = generationState.matches('repairing');
  const refining = generationState.matches('creatingRefine');
  const generating =
    generationState.matches('creatingOpenAi') ||
    generationState.matches('creatingRefine') ||
    generationState.matches('creatingFallback') ||
    validating ||
    repairing;
  const fallbackAvailable = generationState.context.fallbackAvailable;
  const generatingFallback = generationState.matches('creatingFallback');
  const canCreate = canCreateAiShader(prompt, sourceConnected, generating);
  const cleanRefineInstruction = refineInstruction.trim();
  const canRefine =
    Boolean(provenance?.requestId) &&
    sourceConnected &&
    !generating &&
    cleanRefineInstruction.length >= 3 &&
    cleanRefineInstruction.length <= AI_SHADER_PROMPT_MAX_LENGTH;
  const compileResult = useMemo(() => {
    if (!definition?.code.trim()) return null;
    return compileCustomCodeShaderForDiagnostics(definition.code, definition.properties, {
      requireBackdrop: true,
      requirePropertyUniforms: true,
      requirePropertyInfluence: true,
      requireVisualVariation: true,
    });
  }, [definition]);
  const compileFailed = Boolean(compileResult && !compileResult.ok);
  const message = generationState.context.message;
  const status = promptTooLong
    ? {
        title: 'Prompt is too long',
        message: `Shorten it to ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer. Nothing was cut off.`,
        tone: 'warning' as const,
      }
    : !sourceConnected
      ? {
          title: 'Connect source',
          message: 'Connect artwork before creating this effect. Until then, the output stays empty.',
          tone: 'info' as const,
        }
      : compileFailed
        ? {
            title: 'Could not prepare this result',
            message: compileResult?.message ?? 'Create a new version or adjust the prompt.',
            tone: 'warning' as const,
          }
        : message
          ? {
              title: fallbackAvailable || generationState.matches('failed') ? 'Could not create' : 'Shader ready',
              message,
              tone:
                fallbackAvailable || generationState.matches('failed') ? ('warning' as const) : ('success' as const),
            }
          : provenance
            ? {
                title:
                  provenance.source === 'localFallback'
                    ? 'Local draft'
                    : provenance.attempt === 'repair' || provenance.attempt === 'refineRepair'
                      ? 'AI version · repaired'
                      : provenance.attempt === 'refine'
                        ? 'AI version · refined'
                        : 'AI version',
                message:
                  provenance.source === 'localFallback'
                    ? 'This local draft is clearly marked and can be tuned below.'
                    : provenance.attempt === 'repair' || provenance.attempt === 'refineRepair'
                      ? 'Created with AI and repaired once after browser validation.'
                      : provenance.attempt === 'refine'
                        ? 'Refined from the previous accepted AI version.'
                        : 'Created with AI. Tune the generated controls below.',
                tone: 'info' as const,
              }
            : null;
  const summary = generating
    ? 'creating'
    : fallbackAvailable
      ? 'choose next'
      : generationState.matches('failed') || compileFailed
        ? 'try again'
        : promptTooLong
          ? 'too long'
          : !sourceConnected
            ? 'needs source'
            : hasResult
              ? 'ready'
              : hasPrompt
                ? 'ready to create'
                : 'empty';
  const primaryActionLabel = generationState.matches('creatingOpenAi')
    ? 'Creating...'
    : refining
      ? 'Refining...'
      : validating
        ? 'Checking...'
        : repairing
          ? 'Repairing...'
          : fallbackAvailable || generationState.matches('failed') || compileFailed
            ? 'Try Again'
            : promptTooLong
              ? 'Shorten Prompt'
              : !sourceConnected
                ? 'Connect Source First'
                : hasResult
                  ? 'Create New Version'
                  : 'Create with AI';

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
    },
    [],
  );

  const generate = useCallback(
    async (mode: AiShaderRequestMode = 'openai', refinement?: { instruction: string; sourceRequestId: string }) => {
      const cleanPrompt = refinement?.instruction.trim() ?? prompt.trim();
      const isRefinement = Boolean(refinement);
      if (isRefinement ? !canRefine : !canCreate) return;
      const controller = new AbortController();
      const idempotencyKey = createAiIdempotencyKey('shader');
      if (mode === 'openai' && !isRefinement) openAiRequestKeyRef.current = idempotencyKey;
      requestRef.current = controller;
      sendGeneration({
        type: mode === 'localFallback' ? 'CREATE_FALLBACK' : isRefinement ? 'REFINE_OPENAI' : 'CREATE_OPENAI',
      });
      setShaderNodeGenerationStatus(
        shaderNode.id,
        mode === 'localFallback' ? 'creatingFallback' : isRefinement ? 'creatingRefine' : 'creatingOpenAi',
      );
      try {
        const bearerToken = devToken || (auth.signedIn ? ((await auth.getToken()) ?? undefined) : undefined);
        const result = await createAiShader(
          {
            prompt: cleanPrompt,
            mode,
            idempotencyKey,
            ...(mode === 'localFallback' && openAiRequestKeyRef.current
              ? { fallbackForIdempotencyKey: openAiRequestKeyRef.current }
              : {}),
            ...(refinement ? { refineFromRequestId: refinement.sourceRequestId } : {}),
          },
          { baseUrl: apiBaseUrl, bearerToken, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        sendGeneration({ type: mode === 'localFallback' ? 'FALLBACK_RECEIVED' : 'CANDIDATE_RECEIVED' });
        setShaderNodeGenerationStatus(shaderNode.id, 'validating');
        let candidate = result;
        const clientOptions = { baseUrl: apiBaseUrl, bearerToken, signal: controller.signal };
        const commitCandidate = (accepted: typeof candidate) =>
          onChange({
            shaderKind: 'aiShader',
            role: 'effect',
            aiPrompt: isRefinement ? shaderNode.aiPrompt : accepted.prompt,
            name: accepted.instance.definition.label,
            shaderInstance: accepted.instance,
          });
        let acceptance = await validateAndCommitAiShaderCandidate(candidate, clientOptions, commitCandidate);

        if (!acceptance.accepted) {
          if (controller.signal.aborted) return;
          if (!acceptance.repairAvailable || mode === 'localFallback') {
            sendGeneration({
              type: 'VALIDATION_FAILED',
              message: browserValidationFailureMessage(mode, false),
              offerFallback: mode === 'openai' && !isRefinement,
            });
            setShaderNodeGenerationStatus(shaderNode.id, 'failed');
            return;
          }

          sendGeneration({ type: 'VALIDATION_REPAIRABLE', message: 'Repairing this result for your browser.' });
          setShaderNodeGenerationStatus(shaderNode.id, 'repairing');
          try {
            candidate = await repairAiShader(candidate.requestId, {
              baseUrl: apiBaseUrl,
              bearerToken,
              signal: controller.signal,
            });
          } catch (error) {
            if (controller.signal.aborted) return;
            sendGeneration({
              type: 'REPAIR_FAILED',
              message: shaderRepairError(error),
              offerFallback: !isRefinement,
            });
            setShaderNodeGenerationStatus(shaderNode.id, 'failed');
            return;
          }
          sendGeneration({ type: 'REPAIR_RECEIVED' });
          setShaderNodeGenerationStatus(shaderNode.id, 'validating');
          acceptance = await validateAndCommitAiShaderCandidate(candidate, clientOptions, commitCandidate);
          if (!acceptance.accepted) {
            if (controller.signal.aborted) return;
            sendGeneration({
              type: 'VALIDATION_FAILED',
              message: browserValidationFailureMessage(mode, true),
              offerFallback: !isRefinement,
            });
            setShaderNodeGenerationStatus(shaderNode.id, 'failed');
            return;
          }
        }

        if (controller.signal.aborted) return;
        const successMessage =
          candidate.attempt === 'repair' || candidate.attempt === 'refineRepair'
            ? 'Created with AI and repaired for this browser. You can tune it below.'
            : candidate.attempt === 'refine'
              ? 'Refined the current shader. The previous version stayed active until this one passed.'
              : candidate.source === 'localFallback'
                ? 'Made a local draft from this prompt. It stays labeled as local.'
                : 'Made an editable shader from this prompt. You can tune it below.';
        sendGeneration({
          type: 'VALIDATION_PASSED',
          message: successMessage,
          source: candidate.source,
          model: candidate.model,
        });
        if (isRefinement) setRefineInstruction('');
        setShaderNodeGenerationStatus(shaderNode.id, null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure = shaderGenerationError(error, mode);
        sendGeneration({
          type: 'UNEXPECTED_FAILED',
          message: failure.message,
          offerFallback: mode === 'openai' && !isRefinement && failure.offerFallback,
        });
        setShaderNodeGenerationStatus(shaderNode.id, 'failed');
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [
      apiBaseUrl,
      auth,
      canRefine,
      canCreate,
      devToken,
      onChange,
      prompt,
      sendGeneration,
      setShaderNodeGenerationStatus,
      shaderNode.id,
      shaderNode.aiPrompt,
    ],
  );

  const changeProperty = useCallback(
    (key: string, value: ShaderPropertyValue) => {
      if (!instance) return;
      onChange({ shaderInstance: { ...instance, values: { ...instance.values, [key]: value } } });
    },
    [instance, onChange],
  );
  const builtInControls = definition ? codeShaderUniformControls(definition.code) : [];

  return (
    <>
      <InspectorSection
        title="Prompt"
        summary={summary}
        open={promptOpen}
        onToggle={() => setPromptOpen((open) => !open)}
      >
        {!hasResult && !generating && !fallbackAvailable && !generationState.matches('failed') ? (
          <ShaderStatusMessage {...aiShaderEmptyStatus(hasPrompt, sourceConnected)} tone="info" />
        ) : null}
        <InspectorTextArea
          value={prompt}
          placeholder="Describe how this should transform the connected artwork"
          onChange={(value) => {
            requestRef.current?.abort();
            requestRef.current = null;
            openAiRequestKeyRef.current = null;
            sendGeneration({ type: 'RESET' });
            setShaderNodeGenerationStatus(shaderNode.id, null);
            onChange({ aiPrompt: value });
          }}
        />
        <p
          className={`node-inspector-character-count${promptTooLong ? ' node-inspector-character-count-warning' : ''}`}
          aria-live="polite"
        >
          {prompt.length} / {AI_SHADER_PROMPT_MAX_LENGTH}
        </p>
        <button
          type="button"
          className="node-inspector-action nodrag nopan nowheel"
          disabled={generating || !canCreate}
          onClick={() => void generate('openai')}
        >
          {primaryActionLabel}
        </button>
        {fallbackAvailable ? (
          <button
            type="button"
            className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
            disabled={generating || !canCreate}
            onClick={() => void generate('localFallback')}
          >
            Make Local Draft
          </button>
        ) : null}
        {generating ? (
          <div className="node-inspector-loading" role="status" aria-live="polite">
            <span className="node-inspector-loading-dot" aria-hidden="true" />
            <div>
              <p className="node-inspector-loading-title">
                {repairing
                  ? 'Repairing shader'
                  : refining
                    ? 'Refining shader'
                    : validating
                      ? 'Checking shader'
                      : generatingFallback
                        ? 'Making local draft'
                        : 'Creating shader'}
              </p>
              <p className="node-inspector-loading-copy">
                {repairing
                  ? 'Adjusting the result once so it works in this browser.'
                  : refining
                    ? 'Updating the accepted version while keeping it visible until the new result passes.'
                    : validating
                      ? 'Making sure the result works before replacing your current shader.'
                      : generatingFallback
                        ? 'Making an editable local version from this prompt.'
                        : 'Creating the effect and its editable controls. This may take a few seconds.'}
              </p>
            </div>
          </div>
        ) : status ? (
          <ShaderStatusMessage {...status} />
        ) : null}
      </InspectorSection>
      {hasResult && instance && definition && provenance?.requestId ? (
        <InspectorSection
          title="Refine"
          summary={refining ? 'refining' : cleanRefineInstruction ? 'ready' : 'optional'}
          open={refineOpen}
          onToggle={() => setRefineOpen((open) => !open)}
        >
          <InspectorTextArea
            value={refineInstruction}
            placeholder="Describe what to change while keeping the current effect"
            onChange={setRefineInstruction}
          />
          <p
            className={`node-inspector-character-count${refineInstruction.length > AI_SHADER_PROMPT_MAX_LENGTH ? ' node-inspector-character-count-warning' : ''}`}
            aria-live="polite"
          >
            {refineInstruction.length} / {AI_SHADER_PROMPT_MAX_LENGTH}
          </p>
          <button
            type="button"
            className="node-inspector-action nodrag nopan nowheel"
            disabled={!canRefine}
            onClick={() =>
              void generate('openai', {
                instruction: refineInstruction,
                sourceRequestId: provenance.requestId!,
              })
            }
          >
            {refining ? 'Refining...' : 'Refine with AI'}
          </button>
        </InspectorSection>
      ) : null}
      {hasResult && !generating && instance && definition ? (
        <InspectorSection
          title="Controls"
          summary={`${definition.properties.length + builtInControls.length} controls`}
          open={controlsOpen}
          onToggle={() => setControlsOpen((open) => !open)}
        >
          <div className="node-shader-flat-controls">
            {builtInControls.includes('strength') ? (
              <InspectorSlider
                label="Strength"
                value={shaderNode.distortion}
                min={0}
                max={100}
                onChange={(value) => onChange({ distortion: value })}
              />
            ) : null}
            {builtInControls.includes('variation') ? (
              <InspectorSlider
                label="Variation"
                value={shaderNode.seedOffset}
                min={0}
                max={9999}
                onChange={(value) => onChange({ seedOffset: value })}
              />
            ) : null}
            {definition.properties.map((property) => (
              <ShaderPropertyControl
                key={property.key}
                property={property}
                value={instance.values[property.key] ?? property.default}
                showUniformName={false}
                onChange={(value) => changeProperty(property.key, value)}
              />
            ))}
          </div>
        </InspectorSection>
      ) : null}
    </>
  );
}

function shaderGenerationError(error: unknown, mode: AiShaderRequestMode): { message: string; offerFallback: boolean } {
  if (error instanceof AiGenerationApiError) {
    switch (error.code) {
      case 'unauthenticated':
      case 'unauthorized':
      case 'missing_auth':
        return { message: 'Sign in, then try again.', offerFallback: false };
      case 'not_enabled':
      case 'ai_disabled':
      case 'provider_disabled':
        return { message: 'AI creation is not available for this account.', offerFallback: false };
      case 'shader_provider_unavailable':
        return {
          message: 'AI creation is not connected here. Try again after setup, or make a local version.',
          offerFallback: true,
        };
      case 'invalid_prompt':
      case 'prompt_too_short':
        return { message: 'Add a little more detail to the prompt.', offerFallback: false };
      case 'prompt_too_long':
        return {
          message: `Shorten the prompt to ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer.`,
          offerFallback: false,
        };
      case 'rate_limited':
        return { message: 'Too many requests. Wait a moment, then try again.', offerFallback: false };
      case 'quota_exceeded':
        return { message: 'The monthly AI creation limit has been reached.', offerFallback: false };
      case 'shader_provider_timeout':
        return { message: 'Creation took too long. Try again.', offerFallback: true };
      case 'shader_request_in_progress':
        return {
          message: 'This shader is already being created. Wait a moment, then try again.',
          offerFallback: false,
        };
      case 'invalid_response':
      case 'invalid_shader':
        return { message: 'Creation returned an incomplete result. Try again.', offerFallback: true };
      case 'shader_provider_failed':
      case 'provider_failed':
        return {
          message:
            mode === 'openai'
              ? 'Could not create this shader. Try again, or make a local draft from the same prompt.'
              : 'The local version could not be created. Try a simpler prompt.',
          offerFallback: mode === 'openai',
        };
      case 'invalid_fallback_reference':
      case 'fallback_not_available':
        return { message: 'Try creating with AI again before making a local draft.', offerFallback: false };
      default:
        return {
          message:
            error.status >= 500
              ? 'Could not create this shader right now. Try again.'
              : 'Check the prompt and try again.',
          offerFallback: error.status >= 500,
        };
    }
  }
  return {
    message:
      mode === 'openai'
        ? 'Could not create this shader. Try again.'
        : 'The local version could not be created. Try again.',
    offerFallback: false,
  };
}

function browserValidationFailureMessage(mode: AiShaderRequestMode, repaired: boolean) {
  if (mode === 'localFallback') return 'The local draft did not work in this browser. Try a different prompt.';
  return repaired
    ? 'The repaired result still did not work in this browser. Your previous shader was kept.'
    : 'The result did not work in this browser. Your previous shader was kept.';
}

function shaderRepairError(error: unknown) {
  if (error instanceof AiGenerationApiError && error.code === 'shader_provider_timeout') {
    return 'Repair took too long. Your previous shader was kept.';
  }
  return 'The result could not be repaired. Your previous shader was kept.';
}

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}
