import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useArtifactAuth } from '../../../hooks/useArtifactAuth';
import { AI_SHADER_PROMPT_MAX_LENGTH, type AiShaderSpecRequestMode } from '../../../types/aiGeneration';
import type { CustomShaderOperation, CustomShaderSpec, GraphShaderNode } from '../../../types/config';
import { AiGenerationApiError, createAiIdempotencyKey, createAiShaderSpec } from '../../../utils/aiGenerationClient';
import { getArtifactAiApiBaseUrl } from '../../../utils/apiBaseUrl';
import { cloneDefaultCustomShaderSpec, validateCustomShaderSpec } from '../../../utils/customShaderSpec';
import { useNodeCanvasActions } from '../context';
import { InspectorColorInput, InspectorSection, InspectorSlider, InspectorTextArea } from './fields';
import { aiShaderPassEmptyStatus, canCreateAiShaderPass } from './ShaderInspectorModel';
import { ShaderStatusMessage } from './ShaderStatusMessage';
import { shaderGenerationMachine } from './shaderGenerationMachine';

const MAX_AI_SHADER_COLORS = 8;

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
  const [toneOpen, setToneOpen] = useState(true);
  const [colorsOpen, setColorsOpen] = useState(true);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [generationState, sendGeneration] = useMachine(shaderGenerationMachine);
  const requestRef = useRef<AbortController | null>(null);
  const auth = useArtifactAuth();
  const { setShaderNodeGenerationStatus } = useNodeCanvasActions();
  const apiBaseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const prompt = shaderNode.aiPrompt ?? shaderNode.customShaderSpec?.prompt ?? '';
  const promptLength = prompt.length;
  const promptTooLong = promptLength > AI_SHADER_PROMPT_MAX_LENGTH;
  const spec = shaderNode.customShaderSpec ?? cloneDefaultCustomShaderSpec();
  const specErrors = validateCustomShaderSpec(spec);
  const hasResult = Boolean(spec.provenance);
  const hasPrompt = prompt.trim().length >= 3;
  const needsSource = !sourceConnected;
  const generating = generationState.matches('creatingOpenAi') || generationState.matches('creatingFallback');
  const canCreate = canCreateAiShaderPass(prompt, sourceConnected, generating);
  const generatingFallback = generationState.matches('creatingFallback');
  const fallbackOffered = generationState.matches('fallbackOffered');
  const message = generationState.context.message;
  const provenanceMessage = customSpecProvenanceMessage(spec.provenance);
  const status = promptTooLong
    ? {
        title: 'Prompt is too long',
        message: `Shorten it to ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer. Nothing was cut off.`,
        tone: 'warning' as const,
      }
    : specErrors.length > 0
      ? {
          title: 'Needs attention',
          message: customSpecValidationMessage(specErrors),
          tone: 'warning' as const,
        }
      : needsSource
        ? {
            title: 'Connect source',
            message: 'Connect an image or source node before creating this effect. Until then, the output stays empty.',
            tone: 'info' as const,
          }
        : message
          ? {
              title: fallbackOffered || generationState.matches('failed') ? 'Could not create' : 'Shader ready',
              message,
              tone: fallbackOffered || generationState.matches('failed') ? ('warning' as const) : ('success' as const),
            }
          : provenanceMessage
            ? {
                title: spec.provenance?.source === 'localFallback' ? 'Local draft' : 'AI version',
                message: provenanceMessage,
                tone: 'info' as const,
              }
            : null;
  const summary = generating
    ? 'creating'
    : fallbackOffered
      ? 'choose next'
      : generationState.matches('failed')
        ? 'try again'
        : promptTooLong
          ? 'too long'
          : specErrors.length
            ? 'needs attention'
            : needsSource
              ? 'needs source'
              : hasResult
                ? 'ready'
                : hasPrompt
                  ? 'ready to create'
                  : 'empty';
  const primaryActionLabel = generationState.matches('creatingOpenAi')
    ? 'Creating...'
    : fallbackOffered || generationState.matches('failed')
      ? 'Try Again'
      : promptTooLong
        ? 'Shorten Prompt'
        : needsSource
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

  const changeSpec = useCallback(
    (patch: Partial<CustomShaderSpec>) => {
      onChange({
        shaderKind: 'customSpec',
        customShaderSpec: {
          ...(shaderNode.customShaderSpec ?? cloneDefaultCustomShaderSpec()),
          ...patch,
        },
      });
    },
    [onChange, shaderNode.customShaderSpec],
  );
  const generate = useCallback(
    async (mode: AiShaderSpecRequestMode = 'openai') => {
      const cleanPrompt = prompt.trim();
      if (!canCreate) return;
      const controller = new AbortController();
      requestRef.current = controller;
      if (mode === 'localFallback') {
        sendGeneration({ type: 'CREATE_FALLBACK' });
        setShaderNodeGenerationStatus(shaderNode.id, 'creatingFallback');
      } else {
        sendGeneration({ type: 'CREATE_OPENAI' });
        setShaderNodeGenerationStatus(shaderNode.id, 'creatingOpenAi');
      }
      try {
        const bearerToken = devToken || (auth.signedIn ? ((await auth.getToken()) ?? undefined) : undefined);
        const result = await createAiShaderSpec(
          { prompt: cleanPrompt, mode, idempotencyKey: createAiIdempotencyKey('shader') },
          { baseUrl: apiBaseUrl, bearerToken, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        onChange({
          shaderKind: 'customSpec',
          aiPrompt: result.prompt,
          name: result.spec.label ?? shaderNode.name,
          customShaderSpec: result.spec,
        });
        const successMessage =
          result.warnings?.join(' ') ??
          (result.source === 'localFallback'
            ? 'Made a simple local version from this prompt. It stays labeled as local.'
            : 'Made an editable shader from this prompt. You can tune it below.');
        sendGeneration(
          mode === 'localFallback'
            ? { type: 'FALLBACK_DONE', message: successMessage, source: result.source, model: result.model }
            : { type: 'OPENAI_DONE', message: successMessage, source: result.source, model: result.model },
        );
        setShaderNodeGenerationStatus(shaderNode.id, null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const errorMessage = customSpecGenerationError(error, mode);
        sendGeneration(
          mode === 'localFallback'
            ? { type: 'FALLBACK_FAILED', message: errorMessage }
            : { type: 'OPENAI_FAILED', message: errorMessage },
        );
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
      shaderNode.name,
    ],
  );
  const changePalette = useCallback(
    (palette: string[]) => changeSpec({ palette: palette.slice(0, MAX_AI_SHADER_COLORS) }),
    [changeSpec],
  );
  const changeOperation = useCallback(
    (index: number, patch: Partial<CustomShaderOperation>) => {
      const operations = [...spec.operations];
      const current = operations[index];
      if (!current) return;
      operations[index] = { ...current, ...patch } as CustomShaderOperation;
      changeSpec({ operations });
    },
    [changeSpec, spec.operations],
  );
  const palette = spec.palette ?? cloneDefaultCustomShaderSpec().palette ?? [];

  return (
    <>
      <InspectorSection
        title="Prompt"
        summary={summary}
        open={promptOpen}
        onToggle={() => setPromptOpen((open) => !open)}
      >
        {!hasResult && !generating && !fallbackOffered && !generationState.matches('failed') ? (
          <ShaderStatusMessage {...aiShaderPassEmptyStatus(hasPrompt, sourceConnected)} tone="info" />
        ) : null}
        <InspectorTextArea
          value={prompt}
          placeholder="Describe how this should process the connected source"
          onChange={(value) => {
            requestRef.current?.abort();
            requestRef.current = null;
            sendGeneration({ type: 'RESET' });
            setShaderNodeGenerationStatus(shaderNode.id, null);
            onChange({
              aiPrompt: value,
              customShaderSpec: {
                ...(shaderNode.customShaderSpec ?? cloneDefaultCustomShaderSpec()),
                prompt: value,
              },
            });
          }}
        />
        <p
          className={`node-inspector-character-count${promptTooLong ? ' node-inspector-character-count-warning' : ''}`}
          aria-live="polite"
        >
          {promptLength} / {AI_SHADER_PROMPT_MAX_LENGTH}
        </p>
        <button
          type="button"
          className="node-inspector-action nodrag nopan nowheel"
          disabled={generating || !canCreate}
          onClick={() => void generate('openai')}
        >
          {primaryActionLabel}
        </button>
        {fallbackOffered && (
          <button
            type="button"
            className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
            disabled={generating || !canCreate}
            onClick={() => void generate('localFallback')}
          >
            Make Local Draft
          </button>
        )}
        {generating && (
          <div className="node-inspector-loading" role="status" aria-live="polite">
            <span className="node-inspector-loading-dot" aria-hidden="true" />
            <div>
              <p className="node-inspector-loading-title">
                {generatingFallback ? 'Making local draft' : 'Creating shader'}
              </p>
              <p className="node-inspector-loading-copy">
                {generatingFallback
                  ? 'Making an editable draft from this prompt. It will be labeled as local.'
                  : 'Building an editable shader from this prompt. This usually takes a few seconds.'}
              </p>
            </div>
          </div>
        )}
        {!generating && status ? <ShaderStatusMessage {...status} /> : null}
      </InspectorSection>
      {hasResult && !generating && (
        <>
          <InspectorSection
            title="Tone"
            summary="base / contrast"
            open={toneOpen}
            onToggle={() => setToneOpen((open) => !open)}
          >
            <div className="node-shader-flat-controls">
              <InspectorSlider
                label="Base tone"
                value={Math.round((spec.base ?? 0.46) * 100)}
                min={0}
                max={100}
                valueLabel={`${Math.round((spec.base ?? 0.46) * 100)}%`}
                onChange={(value) => changeSpec({ base: value / 100 })}
              />
              <InspectorSlider
                label="Contrast"
                value={Math.round((spec.contrast ?? 1.18) * 100)}
                min={10}
                max={400}
                valueLabel={`${Math.round((spec.contrast ?? 1.18) * 100)}%`}
                onChange={(value) => changeSpec({ contrast: value / 100 })}
              />
            </div>
          </InspectorSection>
          <InspectorSection
            title="Colors"
            summary={`${palette.length} colors`}
            open={colorsOpen}
            onToggle={() => setColorsOpen((open) => !open)}
          >
            <div className="node-shader-color-grid">
              {palette.map((color, index) => (
                <div key={`custom-palette-${index}`} className="node-shader-color-swatch">
                  <InspectorColorInput
                    label={paletteLabel(index)}
                    value={color}
                    onChange={(value) => {
                      const next = [...palette];
                      next[index] = value;
                      changePalette(next);
                    }}
                  />
                  {palette.length > 1 && (
                    <button
                      type="button"
                      className="node-shader-color-remove nodrag nopan nowheel"
                      aria-label={`Remove color ${paletteLabel(index)}`}
                      title={`Remove color ${paletteLabel(index)}`}
                      onClick={() => changePalette(palette.filter((_, colorIndex) => colorIndex !== index))}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {palette.length < MAX_AI_SHADER_COLORS && (
              <button
                type="button"
                className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
                onClick={() => changePalette([...palette, palette[palette.length - 1] ?? '#ffffff'])}
              >
                Add Color
              </button>
            )}
          </InspectorSection>
          <InspectorSection
            title="Steps"
            summary={`${spec.operations.length} operations`}
            open={stepsOpen}
            onToggle={() => setStepsOpen((open) => !open)}
          >
            <div className="node-shader-operation-list">
              {spec.operations.map((operation, index) => (
                <CustomShaderOperationControls
                  key={`${operation.op}-${index}`}
                  index={index}
                  operation={operation}
                  onChange={changeOperation}
                />
              ))}
            </div>
          </InspectorSection>
        </>
      )}
    </>
  );
}

function CustomShaderOperationControls({
  index,
  operation,
  onChange,
}: {
  index: number;
  operation: CustomShaderOperation;
  onChange: (index: number, patch: Partial<CustomShaderOperation>) => void;
}) {
  return (
    <div className="node-shader-operation">
      <div className="node-shader-operation-header">
        <span className="node-inspector-control-label">{operationLabel(operation)}</span>
        <span className="node-inspector-value">Step {index + 1}</span>
      </div>
      <div className="node-shader-operation-controls">{renderOperationControls(index, operation, onChange)}</div>
    </div>
  );
}

function renderOperationControls(
  index: number,
  operation: CustomShaderOperation,
  onChange: (index: number, patch: Partial<CustomShaderOperation>) => void,
) {
  switch (operation.op) {
    case 'noise':
      return (
        <>
          <PercentSlider
            label="Strength"
            value={operation.amount}
            min={-200}
            max={200}
            onChange={(amount) => onChange(index, { amount })}
          />
          <InspectorSlider
            label="Size"
            value={Math.round(operation.scale * 10)}
            min={1}
            max={400}
            valueLabel={operation.scale.toFixed(1)}
            onChange={(value) => onChange(index, { scale: value / 10 })}
          />
          <InspectorSlider
            label="Detail"
            value={operation.octaves ?? 4}
            min={1}
            max={7}
            onChange={(octaves) => onChange(index, { octaves })}
          />
          <InspectorSlider
            label="Variation"
            value={operation.seedOffset ?? 0}
            min={0}
            max={9999}
            onChange={(seedOffset) => onChange(index, { seedOffset })}
          />
        </>
      );
    case 'wave':
      return (
        <>
          <InspectorSlider
            label="Density"
            value={Math.round(operation.frequency)}
            min={1}
            max={80}
            onChange={(frequency) => onChange(index, { frequency })}
          />
          <PercentSlider
            label="Strength"
            value={operation.amplitude}
            min={-200}
            max={200}
            onChange={(amplitude) => onChange(index, { amplitude })}
          />
          <InspectorSlider
            label="Angle"
            value={Math.round(operation.angle)}
            min={-180}
            max={180}
            valueLabel={`${Math.round(operation.angle)}°`}
            onChange={(angle) => onChange(index, { angle })}
          />
          <InspectorSlider
            label="Phase"
            value={Math.round((operation.phase ?? 0) * 100)}
            min={-800}
            max={800}
            valueLabel={(operation.phase ?? 0).toFixed(2)}
            onChange={(value) => onChange(index, { phase: value / 100 })}
          />
        </>
      );
    case 'rings':
      return (
        <>
          <InspectorSlider
            label="Density"
            value={Math.round(operation.frequency)}
            min={1}
            max={80}
            onChange={(frequency) => onChange(index, { frequency })}
          />
          <PercentSlider
            label="Strength"
            value={operation.amount}
            min={-200}
            max={200}
            onChange={(amount) => onChange(index, { amount })}
          />
          <PercentSlider
            label="Center X"
            value={operation.centerX ?? 0}
            min={-100}
            max={100}
            onChange={(centerX) => onChange(index, { centerX })}
          />
          <PercentSlider
            label="Center Y"
            value={operation.centerY ?? 0}
            min={-100}
            max={100}
            onChange={(centerY) => onChange(index, { centerY })}
          />
        </>
      );
    case 'swirl':
      return (
        <>
          <PercentSlider
            label="Strength"
            value={operation.amount}
            min={-200}
            max={200}
            onChange={(amount) => onChange(index, { amount })}
          />
          <InspectorSlider
            label="Radius"
            value={Math.round((operation.radius ?? 1.1) * 100)}
            min={5}
            max={400}
            valueLabel={(operation.radius ?? 1.1).toFixed(2)}
            onChange={(value) => onChange(index, { radius: value / 100 })}
          />
        </>
      );
    case 'invert':
    case 'sourceLuma':
    case 'gradientMap':
      return (
        <PercentSlider
          label="Strength"
          value={operation.amount}
          min={0}
          max={100}
          onChange={(amount) => onChange(index, { amount })}
        />
      );
    case 'edgeGlow':
      return (
        <>
          <PercentSlider
            label="Strength"
            value={operation.amount}
            min={0}
            max={200}
            onChange={(amount) => onChange(index, { amount })}
          />
          <PercentSlider
            label="Softness"
            value={operation.softness ?? 0.18}
            min={0}
            max={100}
            onChange={(softness) => onChange(index, { softness })}
          />
        </>
      );
    case 'chromaticShift':
      return (
        <>
          <PercentSlider
            label="Strength"
            value={operation.amount}
            min={0}
            max={100}
            onChange={(amount) => onChange(index, { amount })}
          />
          <InspectorSlider
            label="Angle"
            value={Math.round(operation.angle ?? 0)}
            min={-180}
            max={180}
            valueLabel={`${Math.round(operation.angle ?? 0)}°`}
            onChange={(angle) => onChange(index, { angle })}
          />
        </>
      );
    case 'threshold':
      return (
        <>
          <PercentSlider
            label="Cutoff"
            value={operation.value}
            min={0}
            max={100}
            onChange={(value) => onChange(index, { value })}
          />
          <PercentSlider
            label="Edge softness"
            value={operation.softness ?? 0.08}
            min={0}
            max={100}
            onChange={(softness) => onChange(index, { softness })}
          />
        </>
      );
    case 'posterize':
      return (
        <InspectorSlider
          label="Levels"
          value={operation.steps}
          min={2}
          max={16}
          onChange={(steps) => onChange(index, { steps })}
        />
      );
  }
}

function PercentSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <InspectorSlider
      label={label}
      value={Math.round(value * 100)}
      min={min}
      max={max}
      valueLabel={`${Math.round(value * 100)}%`}
      onChange={(next) => onChange(next / 100)}
    />
  );
}

function operationLabel(operation: CustomShaderOperation) {
  const labels: Record<CustomShaderOperation['op'], string> = {
    noise: 'Noise',
    wave: 'Wave',
    rings: 'Rings',
    swirl: 'Swirl',
    threshold: 'Cutoff',
    posterize: 'Color bands',
    invert: 'Invert colors',
    sourceLuma: 'Source light',
    edgeGlow: 'Edge glow',
    chromaticShift: 'Color split',
    gradientMap: 'Gradient map',
  };
  return labels[operation.op];
}

function paletteLabel(index: number) {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}

function customSpecValidationMessage(errors: string[]) {
  const message = errors.join(' ');
  if (message.includes('Palette')) return 'Choose at least one color before using this shader.';
  if (message.includes('operation') || message.includes('Operation')) {
    return 'Some shader settings need to be remade. Try creating the shader again.';
  }
  if (message.includes('version')) return 'This saved shader format is too old for the current editor.';
  return 'This shader needs a small fix before it can render.';
}

function customSpecProvenanceMessage(provenance: CustomShaderSpec['provenance']) {
  if (!provenance) return null;
  if (provenance.source === 'localFallback') return 'This is a local draft because AI creation was unavailable.';
  return 'Created with AI. Tune the controls below.';
}

function customSpecGenerationError(error: unknown, mode: AiShaderSpecRequestMode) {
  if (error instanceof AiGenerationApiError) {
    switch (error.code) {
      case 'unauthenticated':
      case 'unauthorized':
      case 'missing_auth':
        return 'Sign in, then try again.';
      case 'not_enabled':
      case 'ai_disabled':
      case 'provider_disabled':
        return 'AI creation is not available for this account.';
      case 'shader_provider_unavailable':
        return 'AI creation is not connected here. Try again after setup, or make a local version.';
      case 'invalid_prompt':
      case 'prompt_too_short':
        return 'Add a little more detail to the prompt.';
      case 'prompt_too_long':
        return `Shorten the prompt to ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer.`;
      case 'rate_limited':
        return 'Too many requests. Wait a moment, then try again.';
      case 'quota_exceeded':
        return 'The monthly AI creation limit has been reached.';
      case 'shader_provider_timeout':
        return 'Creation took too long. Try again.';
      case 'shader_request_in_progress':
        return 'This shader is already being created. Wait a moment, then try again.';
      case 'invalid_response':
        return 'Creation returned something incomplete. Try again.';
      case 'shader_provider_failed':
      case 'provider_failed':
        return mode === 'openai'
          ? 'Could not create this shader. Try again, or make a local draft from the same prompt.'
          : 'The local version could not be created. Try a simpler prompt.';
      default:
        return error.status >= 500
          ? 'Could not create this shader right now. Try again.'
          : 'Check the prompt and try again.';
    }
  }
  return mode === 'openai'
    ? 'Could not create this shader. Try again, or make a local draft from the same prompt.'
    : 'The local version could not be created. Try again.';
}
