import { useMachine } from '@xstate/react';
import { useCallback, useMemo, useState } from 'react';
import { useArtifactAuth } from '../../../hooks/useArtifactAuth';
import type { AiShaderSpecRequestMode } from '../../../types/aiGeneration';
import type { CustomShaderOperation, CustomShaderSpec, GraphShaderNode, ShaderKind } from '../../../types/config';
import { AiGenerationApiError, createAiShaderSpec } from '../../../utils/aiGenerationClient';
import { getArtifactAiApiBaseUrl } from '../../../utils/apiBaseUrl';
import { DEFAULT_CUSTOM_SHADER_CODE } from '../../../utils/customShaderCode';
import { cloneDefaultCustomShaderSpec, validateCustomShaderSpec } from '../../../utils/customShaderSpec';
import { BLEND_OPTIONS } from '../constants';
import { useNodeCanvasActions } from '../context';
import {
  BlendModeNote,
  InspectorColorInput,
  InspectorSection,
  InspectorSelect,
  InspectorSlider,
  InspectorTextArea,
  InspectorTextInput,
} from './fields';
import { shaderGenerationMachine } from './shaderGenerationMachine';

const SHADER_KIND_OPTIONS: Array<{ value: ShaderKind; label: string }> = [
  { value: 'paperTexture', label: 'Paper Texture' },
  { value: 'water', label: 'Water' },
  { value: 'waterCaustic', label: 'Water Caustic' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'liquidMetal', label: 'Liquid Metal' },
  { value: 'gemSmoke', label: 'Gem Smoke' },
  { value: 'meshGradient', label: 'Mesh Gradient' },
  { value: 'staticRadialGradient', label: 'Static Radial Gradient' },
  { value: 'grainGradient', label: 'Grain Gradient' },
  { value: 'dotOrbit', label: 'Dot Orbit' },
  { value: 'dotGrid', label: 'Dot Grid' },
  { value: 'moire', label: 'Moire' },
  { value: 'concentricPatterns', label: 'Concentric Patterns' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'swirl', label: 'Swirl' },
  { value: 'waves', label: 'Waves' },
  { value: 'glowingWave', label: 'Glowing Wave' },
  { value: 'neuroNoise', label: 'Neuro Noise' },
  { value: 'perlin', label: 'Perlin' },
  { value: 'simplexNoise', label: 'Simplex Noise' },
  { value: 'voronoi', label: 'Voronoi' },
  { value: 'borderRings', label: 'Border Rings' },
  { value: 'metaballs', label: 'Metaballs' },
  { value: 'colorPanels', label: 'Color Panels' },
  { value: 'smokeRing', label: 'Smoke Ring' },
  { value: 'noiseField', label: 'Noise Field' },
  { value: 'marble', label: 'Marble' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'customSpec', label: 'AI Shader' },
  { value: 'customCode', label: 'Code Shader' },
];

export function ShaderInspector({
  shaderNode,
  onChange,
  detached = false,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  detached?: boolean;
}) {
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(true);
  const [compositeOpen, setCompositeOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generationState, sendGeneration] = useMachine(shaderGenerationMachine);
  const auth = useArtifactAuth();
  const { setShaderNodeGenerationStatus } = useNodeCanvasActions();
  const apiBaseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const customSpecErrors =
    shaderNode.shaderKind === 'customSpec' ? validateCustomShaderSpec(shaderNode.customShaderSpec) : [];
  const customPrompt = shaderNode.aiPrompt ?? shaderNode.customShaderSpec?.prompt ?? '';
  const customSpec =
    shaderNode.shaderKind === 'customSpec' ? (shaderNode.customShaderSpec ?? cloneDefaultCustomShaderSpec()) : null;
  const customGenerating = generationState.matches('creatingOpenAi') || generationState.matches('creatingFallback');
  const customGeneratingFallback = generationState.matches('creatingFallback');
  const customFallbackOffered = generationState.matches('fallbackOffered');
  const customMessage = generationState.context.message;
  const customProvenanceMessage = customSpec ? customSpecProvenanceMessage(customSpec.provenance) : null;
  const customStatus =
    customSpecErrors.length > 0
      ? {
          title: 'Needs attention',
          message: customSpecValidationMessage(customSpecErrors),
          tone: 'warning' as const,
        }
      : customMessage
        ? {
            title: customFallbackOffered
              ? 'AI did not finish'
              : generationState.matches('failed')
                ? 'Could not create'
                : 'Shader ready',
            message: customMessage,
            tone:
              customFallbackOffered || generationState.matches('failed') ? ('warning' as const) : ('success' as const),
          }
        : customProvenanceMessage
          ? {
              title: customSpec?.provenance?.source === 'localFallback' ? 'Local version' : 'AI version',
              message: customProvenanceMessage,
              tone: 'info' as const,
            }
          : null;
  const handleKindChange = (value: string) => {
    const shaderKind = value as ShaderKind;
    sendGeneration({ type: 'RESET' });
    setShaderNodeGenerationStatus(shaderNode.id, null);
    onChange({
      shaderKind,
      ...(shaderKind === 'customSpec' && !shaderNode.customShaderSpec
        ? { customShaderSpec: cloneDefaultCustomShaderSpec() }
        : {}),
      ...(shaderKind === 'customCode' && !shaderNode.customShaderCode
        ? { customShaderCode: DEFAULT_CUSTOM_SHADER_CODE }
        : {}),
    });
  };
  const handleGenerateCustomSpec = useCallback(
    async (mode: AiShaderSpecRequestMode = 'openai') => {
      const prompt = customPrompt.trim();
      if (!prompt || customGenerating) return;
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
          { prompt, mode },
          {
            baseUrl: apiBaseUrl,
            bearerToken,
          },
        );
        onChange({
          shaderKind: 'customSpec',
          aiPrompt: result.prompt,
          name: result.spec.label ?? shaderNode.name,
          customShaderSpec: result.spec,
        });
        const message =
          result.warnings?.join(' ') ??
          (result.source === 'localFallback'
            ? 'Made a simple local version from this prompt. It stays labeled as local.'
            : 'Made an editable shader from this prompt. You can tune it below.');
        if (mode === 'localFallback') {
          sendGeneration({ type: 'FALLBACK_DONE', message, source: result.source, model: result.model });
        } else {
          sendGeneration({ type: 'OPENAI_DONE', message, source: result.source, model: result.model });
        }
        setShaderNodeGenerationStatus(shaderNode.id, null);
      } catch (error) {
        const message = customSpecGenerationError(error, mode);
        if (mode === 'localFallback') {
          sendGeneration({ type: 'FALLBACK_FAILED', message });
        } else {
          sendGeneration({ type: 'OPENAI_FAILED', message });
        }
        setShaderNodeGenerationStatus(shaderNode.id, 'failed');
      }
    },
    [
      apiBaseUrl,
      auth,
      customGenerating,
      customPrompt,
      devToken,
      onChange,
      sendGeneration,
      setShaderNodeGenerationStatus,
      shaderNode.id,
      shaderNode.name,
    ],
  );
  const handleCustomSpecChange = useCallback(
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
  const handleCustomPaletteChange = useCallback(
    (index: number, color: string) => {
      const palette = [...(customSpec?.palette ?? cloneDefaultCustomShaderSpec().palette ?? [])];
      palette[index] = color;
      handleCustomSpecChange({ palette });
    },
    [customSpec?.palette, handleCustomSpecChange],
  );
  const handleCustomOperationChange = useCallback(
    (index: number, patch: Partial<CustomShaderOperation>) => {
      const operations = [...(customSpec?.operations ?? [])];
      const current = operations[index];
      if (!current) return;
      operations[index] = { ...current, ...patch } as CustomShaderOperation;
      handleCustomSpecChange({ operations });
    },
    [customSpec?.operations, handleCustomSpecChange],
  );

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={shaderNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect
        label="Shader"
        value={shaderNode.shaderKind}
        options={SHADER_KIND_OPTIONS}
        onChange={handleKindChange}
      />
      {shaderNode.shaderKind === 'customSpec' && (
        <InspectorSection
          title="Prompt"
          summary={
            customGenerating
              ? 'working'
              : customFallbackOffered
                ? 'choose next'
                : customSpecErrors.length
                  ? 'needs attention'
                  : 'ready'
          }
          open={customOpen}
          onToggle={() => setCustomOpen((open) => !open)}
        >
          <InspectorTextArea
            value={customPrompt}
            placeholder="Describe a texture, material, or visual effect"
            onChange={(value) => {
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
          <button
            type="button"
            className="node-inspector-action nodrag nopan nowheel"
            disabled={customGenerating || customPrompt.trim().length < 3}
            onClick={() => void handleGenerateCustomSpec('openai')}
          >
            {generationState.matches('creatingOpenAi') ? 'Creating...' : 'Create with AI'}
          </button>
          {customFallbackOffered && (
            <button
              type="button"
              className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
              disabled={customGenerating || customPrompt.trim().length < 3}
              onClick={() => void handleGenerateCustomSpec('localFallback')}
            >
              Use Local Version
            </button>
          )}
          {customGenerating && (
            <div className="node-inspector-loading" role="status" aria-live="polite">
              <span className="node-inspector-loading-dot" aria-hidden="true" />
              <div>
                <p className="node-inspector-loading-title">
                  {customGeneratingFallback ? 'Creating local version' : 'Creating shader'}
                </p>
                <p className="node-inspector-loading-copy">
                  {customGeneratingFallback
                    ? 'Making a simple editable shader from this prompt. It will be labeled as local.'
                    : 'Building an editable shader from this prompt. This usually takes a few seconds.'}
                </p>
              </div>
            </div>
          )}
          {!customGenerating && customStatus ? <CustomShaderStatusMessage {...customStatus} /> : null}
          {customSpec && !customGenerating && (
            <>
              <InspectorSlider
                label="Base tone"
                value={Math.round((customSpec.base ?? 0.46) * 100)}
                min={0}
                max={100}
                valueLabel={`${Math.round((customSpec.base ?? 0.46) * 100)}%`}
                onChange={(value) => handleCustomSpecChange({ base: value / 100 })}
              />
              <InspectorSlider
                label="Contrast"
                value={Math.round((customSpec.contrast ?? 1.18) * 100)}
                min={10}
                max={400}
                valueLabel={`${Math.round((customSpec.contrast ?? 1.18) * 100)}%`}
                onChange={(value) => handleCustomSpecChange({ contrast: value / 100 })}
              />
              {(customSpec.palette ?? cloneDefaultCustomShaderSpec().palette ?? []).slice(0, 4).map((color, index) => (
                <InspectorColorInput
                  key={`custom-palette-${index}`}
                  label={`Color ${index + 1}`}
                  value={color}
                  onChange={(value) => handleCustomPaletteChange(index, value)}
                />
              ))}
              {customSpec.operations.map((operation, index) => (
                <CustomShaderOperationControls
                  key={`${operation.op}-${index}`}
                  index={index}
                  operation={operation}
                  onChange={handleCustomOperationChange}
                />
              ))}
            </>
          )}
          {!customStatus && !customGenerating ? (
            <p className="node-inspector-note">Describe the look, create the shader, then tune colors and detail.</p>
          ) : null}
        </InspectorSection>
      )}
      {shaderNode.shaderKind === 'customCode' && (
        <InspectorSection title="Code" summary="glsl" open={customOpen} onToggle={() => setCustomOpen((open) => !open)}>
          <InspectorTextArea
            value={shaderNode.customShaderCode?.code ?? DEFAULT_CUSTOM_SHADER_CODE.code}
            rows={12}
            placeholder="vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }"
            onChange={(value) =>
              onChange({
                customShaderCode: {
                  version: 1,
                  language: 'glsl-fragment',
                  code: value,
                },
              })
            }
          />
          <p className="node-inspector-note">
            Write GLSL for <code>mainImage(uv)</code>. Use <code>u_backdrop</code> for the incoming image,{' '}
            <code>u_has_backdrop</code> to detect a connected input, plus <code>u_resolution</code>, <code>u_seed</code>
            , and <code>u_strength</code>.
          </p>
        </InspectorSection>
      )}
      <InspectorSection
        title="Palette"
        summary="2 main colors"
        open={paletteOpen}
        onToggle={() => setPaletteOpen((open) => !open)}
      >
        <InspectorColorInput
          label="Color A"
          value={shaderNode.colorA}
          onChange={(value) => onChange({ colorA: value })}
        />
        <InspectorColorInput
          label="Color B"
          value={shaderNode.colorB}
          onChange={(value) => onChange({ colorB: value })}
        />
      </InspectorSection>
      <InspectorSection
        title="Detail"
        summary="distortion / grain"
        open={detailOpen}
        onToggle={() => setDetailOpen((open) => !open)}
      >
        <InspectorSlider
          label="Distortion"
          value={shaderNode.distortion}
          min={0}
          max={100}
          onChange={(value) => onChange({ distortion: value })}
        />
        <InspectorSlider
          label="Grain"
          value={shaderNode.grain}
          min={0}
          max={100}
          onChange={(value) => onChange({ grain: value })}
        />
      </InspectorSection>
      <InspectorSection
        title="Composite"
        summary={`${shaderNode.blendMode} / ${shaderNode.opacity}%`}
        open={compositeOpen}
        onToggle={() => setCompositeOpen((open) => !open)}
      >
        <InspectorSelect
          label="Blend"
          value={shaderNode.blendMode}
          options={BLEND_OPTIONS}
          onChange={(value) => onChange({ blendMode: value })}
        />
        <BlendModeNote value={shaderNode.blendMode} />
        <InspectorSlider
          label="Opacity"
          value={shaderNode.opacity}
          min={0}
          max={100}
          onChange={(value) => onChange({ opacity: value })}
        />
      </InspectorSection>
      <InspectorSection
        title="Advanced"
        summary="secondary colors / placement"
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((open) => !open)}
      >
        <InspectorColorInput
          label="Color C"
          value={shaderNode.colorC}
          onChange={(value) => onChange({ colorC: value })}
        />
        <InspectorColorInput
          label="Color D"
          value={shaderNode.colorD}
          onChange={(value) => onChange({ colorD: value })}
        />
        <InspectorSlider
          label="Swirl"
          value={shaderNode.swirl}
          min={0}
          max={100}
          onChange={(value) => onChange({ swirl: value })}
        />
        <InspectorSlider
          label="Scale"
          value={shaderNode.scale}
          min={20}
          max={300}
          onChange={(value) => onChange({ scale: value })}
        />
        <InspectorSlider
          label="Rotation"
          value={shaderNode.rotation}
          min={0}
          max={360}
          onChange={(value) => onChange({ rotation: value })}
        />
        <InspectorSlider
          label="Offset X"
          value={shaderNode.offsetX}
          min={-100}
          max={100}
          onChange={(value) => onChange({ offsetX: value })}
        />
        <InspectorSlider
          label="Offset Y"
          value={shaderNode.offsetY}
          min={-100}
          max={100}
          onChange={(value) => onChange({ offsetY: value })}
        />
        <InspectorSlider
          label="Variation"
          value={shaderNode.seedOffset}
          min={0}
          max={9999}
          onChange={(value) => onChange({ seedOffset: value })}
        />
      </InspectorSection>
      <p className="node-inspector-note">Use as a fill, place it over a backdrop, or send it into a material.</p>
    </div>
  );
}

function CustomShaderStatusMessage({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
}) {
  return (
    <div className={`node-inspector-status node-inspector-status-${tone}`} role="status" aria-live="polite">
      <p className="node-inspector-status-title">{title}</p>
      <p className="node-inspector-status-copy">{message}</p>
    </div>
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
    <div className="node-inspector-control">
      <div className="node-inspector-control-header">
        <span className="node-inspector-control-label">{operationLabel(operation)}</span>
        <span className="node-inspector-value">Step {index + 1}</span>
      </div>
      {renderOperationControls(index, operation, onChange)}
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
          <InspectorSlider
            label="Strength"
            value={Math.round(operation.amount * 100)}
            min={-200}
            max={200}
            valueLabel={`${Math.round(operation.amount * 100)}%`}
            onChange={(value) => onChange(index, { amount: value / 100 })}
          />
          <InspectorSlider
            label="Size"
            value={Math.round(operation.scale * 10)}
            min={1}
            max={400}
            valueLabel={operation.scale.toFixed(1)}
            onChange={(value) => onChange(index, { scale: value / 10 })}
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
            onChange={(value) => onChange(index, { frequency: value })}
          />
          <InspectorSlider
            label="Strength"
            value={Math.round(operation.amplitude * 100)}
            min={-200}
            max={200}
            valueLabel={`${Math.round(operation.amplitude * 100)}%`}
            onChange={(value) => onChange(index, { amplitude: value / 100 })}
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
            onChange={(value) => onChange(index, { frequency: value })}
          />
          <InspectorSlider
            label="Strength"
            value={Math.round(operation.amount * 100)}
            min={-200}
            max={200}
            valueLabel={`${Math.round(operation.amount * 100)}%`}
            onChange={(value) => onChange(index, { amount: value / 100 })}
          />
        </>
      );
    case 'swirl':
    case 'invert':
      return (
        <InspectorSlider
          label="Strength"
          value={Math.round(operation.amount * 100)}
          min={operation.op === 'invert' ? 0 : -200}
          max={operation.op === 'invert' ? 100 : 200}
          valueLabel={`${Math.round(operation.amount * 100)}%`}
          onChange={(value) => onChange(index, { amount: value / 100 })}
        />
      );
    case 'threshold':
      return (
        <>
          <InspectorSlider
            label="Cutoff"
            value={Math.round(operation.value * 100)}
            min={0}
            max={100}
            valueLabel={`${Math.round(operation.value * 100)}%`}
            onChange={(value) => onChange(index, { value: value / 100 })}
          />
          <InspectorSlider
            label="Edge softness"
            value={Math.round((operation.softness ?? 0.08) * 100)}
            min={0}
            max={100}
            valueLabel={`${Math.round((operation.softness ?? 0.08) * 100)}%`}
            onChange={(value) => onChange(index, { softness: value / 100 })}
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
          onChange={(value) => onChange(index, { steps: value })}
        />
      );
  }
}

function operationLabel(operation: CustomShaderOperation) {
  switch (operation.op) {
    case 'noise':
      return 'Noise';
    case 'wave':
      return 'Wave';
    case 'rings':
      return 'Rings';
    case 'swirl':
      return 'Swirl';
    case 'threshold':
      return 'Cutoff';
    case 'posterize':
      return 'Color bands';
    case 'invert':
      return 'Invert colors';
  }
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
  if (provenance.source === 'localFallback') return 'This shader was made locally after AI creation was unavailable.';
  return 'This shader was made with AI.';
}

function customSpecGenerationError(error: unknown, mode: AiShaderSpecRequestMode) {
  if (mode === 'openai') {
    const fallbackPrompt = 'AI did not finish this shader. Try again, or make a local version from the same prompt.';
    if (error instanceof AiGenerationApiError) {
      switch (error.code) {
        case 'unauthorized':
        case 'missing_auth':
          return 'Sign in, then try again. If you are testing locally, start the AI service first.';
        case 'ai_disabled':
        case 'provider_disabled':
          return 'AI creation is not available for this account.';
        case 'shader_provider_unavailable':
          return 'AI creation is not connected here. Try again after setup, or make a local version.';
        case 'invalid_prompt':
        case 'prompt_too_short':
          return 'Add a little more detail to the prompt.';
        case 'rate_limited':
          return 'Too many AI requests. Wait a moment, then try again.';
        case 'invalid_response':
          return 'AI service needs a restart. Restart it, then try again.';
        case 'shader_provider_failed':
        case 'provider_failed':
          return fallbackPrompt;
        default:
          return error.status >= 500 ? fallbackPrompt : 'Check the prompt and try again.';
      }
    }
    return fallbackPrompt;
  }
  if (error instanceof AiGenerationApiError) {
    switch (error.code) {
      case 'unauthorized':
      case 'missing_auth':
        return 'Sign in, then try again.';
      case 'ai_disabled':
      case 'provider_disabled':
        return 'AI creation is not available for this account.';
      case 'shader_provider_unavailable':
        return 'Local creation is not available here.';
      case 'invalid_prompt':
      case 'prompt_too_short':
        return 'Add a little more detail to the prompt.';
      case 'rate_limited':
        return 'Too many requests. Wait a moment, then try again.';
      case 'shader_provider_failed':
      case 'provider_failed':
        return 'The local version could not be created. Try a simpler prompt.';
      default:
        return error.status >= 500
          ? 'The local version could not be created right now. Try again in a moment.'
          : 'The local version could not be created. Check the prompt and try again.';
    }
  }
  return 'The local version could not be created. Try again.';
}
