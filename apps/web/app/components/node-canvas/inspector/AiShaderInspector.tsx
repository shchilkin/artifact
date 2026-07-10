import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useArtifactAuth } from '../../../hooks/useArtifactAuth';
import { AI_SHADER_PROMPT_MAX_LENGTH, type AiShaderRequestMode } from '../../../types/aiGeneration';
import type { GraphShaderNode, ShaderPropertyValue } from '../../../types/config';
import { AiGenerationApiError, createAiIdempotencyKey, createAiShader } from '../../../utils/aiGenerationClient';
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
  const generating = generationState.matches('creatingOpenAi') || generationState.matches('creatingFallback');
  const fallbackOffered = generationState.matches('fallbackOffered');
  const generatingFallback = generationState.matches('creatingFallback');
  const canCreate = canCreateAiShader(prompt, sourceConnected, generating);
  const compileResult = useMemo(() => {
    if (!definition?.code.trim()) return null;
    return compileCustomCodeShaderForDiagnostics(definition.code, definition.properties, {
      requireBackdrop: true,
      requirePropertyUniforms: true,
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
              title: fallbackOffered || generationState.matches('failed') ? 'Could not create' : 'Shader ready',
              message,
              tone: fallbackOffered || generationState.matches('failed') ? ('warning' as const) : ('success' as const),
            }
          : provenance
            ? {
                title: provenance.source === 'localFallback' ? 'Local draft' : 'AI version',
                message:
                  provenance.source === 'localFallback'
                    ? 'This local draft is clearly marked and can be tuned below.'
                    : 'Created with AI. Tune the generated controls below.',
                tone: 'info' as const,
              }
            : null;
  const summary = generating
    ? 'creating'
    : fallbackOffered
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
    : fallbackOffered || generationState.matches('failed') || compileFailed
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
    async (mode: AiShaderRequestMode = 'openai') => {
      const cleanPrompt = prompt.trim();
      if (!canCreate) return;
      const controller = new AbortController();
      const idempotencyKey = createAiIdempotencyKey('shader');
      if (mode === 'openai') openAiRequestKeyRef.current = idempotencyKey;
      requestRef.current = controller;
      sendGeneration({ type: mode === 'localFallback' ? 'CREATE_FALLBACK' : 'CREATE_OPENAI' });
      setShaderNodeGenerationStatus(shaderNode.id, mode === 'localFallback' ? 'creatingFallback' : 'creatingOpenAi');
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
          },
          { baseUrl: apiBaseUrl, bearerToken, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const prepared = compileCustomCodeShaderForDiagnostics(
          result.instance.definition.code,
          result.instance.definition.properties,
          { requireBackdrop: true, requirePropertyUniforms: true },
        );
        if (!prepared.ok) throw new GeneratedShaderCompileError(prepared.message);
        onChange({
          shaderKind: 'aiShader',
          role: 'effect',
          aiPrompt: result.prompt,
          name: result.instance.definition.label,
          shaderInstance: result.instance,
        });
        const successMessage =
          result.warnings?.join(' ') ??
          (result.source === 'localFallback'
            ? 'Made a local draft from this prompt. It stays labeled as local.'
            : 'Made an editable shader from this prompt. You can tune it below.');
        sendGeneration(
          mode === 'localFallback'
            ? { type: 'FALLBACK_DONE', message: successMessage, source: result.source, model: result.model }
            : { type: 'OPENAI_DONE', message: successMessage, source: result.source, model: result.model },
        );
        setShaderNodeGenerationStatus(shaderNode.id, null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure = shaderGenerationError(error, mode);
        if (mode === 'localFallback') {
          sendGeneration({ type: 'FALLBACK_FAILED', message: failure.message });
        } else {
          sendGeneration({
            type: failure.offerFallback ? 'OPENAI_FAILED' : 'OPENAI_BLOCKED',
            message: failure.message,
          });
        }
        setShaderNodeGenerationStatus(shaderNode.id, 'failed');
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [
      apiBaseUrl,
      auth,
      canCreate,
      devToken,
      onChange,
      prompt,
      sendGeneration,
      setShaderNodeGenerationStatus,
      shaderNode.id,
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
        {!hasResult && !generating && !fallbackOffered && !generationState.matches('failed') ? (
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
        {fallbackOffered ? (
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
                {generatingFallback ? 'Making local draft' : 'Creating shader'}
              </p>
              <p className="node-inspector-loading-copy">
                {generatingFallback
                  ? 'Making an editable local version from this prompt.'
                  : 'Creating the effect and its editable controls. This may take a few seconds.'}
              </p>
            </div>
          </div>
        ) : status ? (
          <ShaderStatusMessage {...status} />
        ) : null}
      </InspectorSection>
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
                onChange={(value) => changeProperty(property.key, value)}
              />
            ))}
          </div>
        </InspectorSection>
      ) : null}
    </>
  );
}

class GeneratedShaderCompileError extends Error {
  constructor(message: string | null) {
    super(message ?? 'This result could not be prepared in this browser.');
    this.name = 'GeneratedShaderCompileError';
  }
}

function shaderGenerationError(error: unknown, mode: AiShaderRequestMode): { message: string; offerFallback: boolean } {
  if (error instanceof GeneratedShaderCompileError) {
    return {
      message: 'The created result could not be prepared in this browser. Try a different prompt or create it again.',
      offerFallback: false,
    };
  }
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

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}
