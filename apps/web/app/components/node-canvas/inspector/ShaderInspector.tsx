import { useMachine } from '@xstate/react';
import { useCallback, useMemo, useState } from 'react';
import { useArtifactAuth } from '../../../hooks/useArtifactAuth';
import type { AiShaderSpecRequestMode } from '../../../types/aiGeneration';
import type { CustomShaderOperation, CustomShaderSpec, GraphShaderNode, ShaderKind } from '../../../types/config';
import { AiGenerationApiError, createAiIdempotencyKey, createAiShaderSpec } from '../../../utils/aiGenerationClient';
import { getArtifactAiApiBaseUrl } from '../../../utils/apiBaseUrl';
import { DEFAULT_CUSTOM_SHADER_CODE, validateCustomShaderCode } from '../../../utils/customShaderCode';
import { cloneDefaultCustomShaderSpec, validateCustomShaderSpec } from '../../../utils/customShaderSpec';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { defaultShaderPalette, normalizeShaderPalette, shaderPaletteConfig } from '../../../utils/shaderPalette';
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
import {
  aiShaderPassEmptyStatus,
  canCreateAiShaderPass,
  shaderInspectorRoleNote,
  shaderInspectorRoleStatus,
  showsPresetShaderControls,
} from './ShaderInspectorModel';
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
];

const SHADER_MODE_OPTIONS: Array<{ value: ShaderMode; label: string }> = [
  { value: 'preset', label: 'Shader Fill / Pass' },
  { value: 'ai', label: 'AI Shader Pass' },
  { value: 'code', label: 'Code Shader' },
];

type ShaderMode = 'preset' | 'ai' | 'code';

export function ShaderInspector({
  shaderNode,
  onChange,
  sourceConnected = false,
  detached = false,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  sourceConnected?: boolean;
  detached?: boolean;
}) {
  const [colorsOpen, setColorsOpen] = useState(true);
  const [patternOpen, setPatternOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(true);
  const [compositeOpen, setCompositeOpen] = useState(false);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [generationState, sendGeneration] = useMachine(shaderGenerationMachine);
  const auth = useArtifactAuth();
  const { setShaderNodeGenerationStatus } = useNodeCanvasActions();
  const apiBaseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const customPrompt = shaderNode.aiPrompt ?? shaderNode.customShaderSpec?.prompt ?? '';
  const customSpec =
    shaderNode.shaderKind === 'customSpec' ? (shaderNode.customShaderSpec ?? cloneDefaultCustomShaderSpec()) : null;
  const customSpecErrors = customSpec ? validateCustomShaderSpec(customSpec) : [];
  const customCode = shaderNode.customShaderCode?.code ?? DEFAULT_CUSTOM_SHADER_CODE.code;
  const customCodeIssues = useMemo(
    () => (shaderNode.shaderKind === 'customCode' ? validateCustomShaderCode(customCode) : []),
    [customCode, shaderNode.shaderKind],
  );
  const customCodeCompileResult = useMemo(() => {
    if (shaderNode.shaderKind !== 'customCode') return null;
    if (customCodeIssues.some((issue) => issue.severity === 'error')) return null;
    return compileCustomCodeShaderForDiagnostics(customCode);
  }, [customCode, customCodeIssues, shaderNode.shaderKind]);
  const customCodeBlockingIssue = customCodeIssues.find((issue) => issue.severity === 'error') ?? null;
  const customCodeEmpty = shaderNode.shaderKind === 'customCode' && customCode.trim().length === 0;
  const customCodeStatus =
    shaderNode.shaderKind !== 'customCode'
      ? null
      : customCodeEmpty
        ? {
            title: 'Start with code',
            message: 'Add mainImage(uv). The preview will stay on a safe placeholder until the shader is ready.',
            tone: 'info' as const,
          }
        : customCodeBlockingIssue
          ? {
              title: 'Code needs a fix',
              message: customCodeBlockingIssue.message,
              tone: 'warning' as const,
            }
          : customCodeCompileResult && !customCodeCompileResult.ok
            ? {
                title: 'Could not compile',
                message: customCodeCompileResult.message ?? 'Check the shader code and try again.',
                tone: 'warning' as const,
              }
            : customCodeCompileResult?.ok
              ? {
                  title: 'Shader ready',
                  message: 'The code compiles and can render in the preview.',
                  tone: 'success' as const,
                }
              : null;
  const customCodeSummary = customCodeEmpty
    ? 'empty'
    : customCodeBlockingIssue
      ? 'needs attention'
      : customCodeCompileResult && !customCodeCompileResult.ok
        ? 'compile error'
        : customCodeCompileResult?.ok
          ? 'ready'
          : 'checking';
  const shaderMode = shaderModeForKind(shaderNode.shaderKind);
  const customHasResult = Boolean(customSpec?.provenance);
  const customHasPrompt = customPrompt.trim().length >= 3;
  const customNeedsSource = shaderNode.shaderKind === 'customSpec' && !sourceConnected;
  const customGenerating = generationState.matches('creatingOpenAi') || generationState.matches('creatingFallback');
  const customCanCreate = canCreateAiShaderPass(customPrompt, sourceConnected, customGenerating);
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
      : customNeedsSource
        ? {
            title: 'Connect source',
            message: 'Connect an image or source node before creating this pass. Until then, the output stays empty.',
            tone: 'info' as const,
          }
        : customMessage
          ? {
              title: customFallbackOffered
                ? 'Could not create'
                : generationState.matches('failed')
                  ? 'Could not create'
                  : 'Shader ready',
              message: customMessage,
              tone:
                customFallbackOffered || generationState.matches('failed')
                  ? ('warning' as const)
                  : ('success' as const),
            }
          : customProvenanceMessage
            ? {
                title: customSpec?.provenance?.source === 'localFallback' ? 'Local draft' : 'AI version',
                message: customProvenanceMessage,
                tone: 'info' as const,
              }
            : null;
  const customSummary = customGenerating
    ? 'creating'
    : customFallbackOffered
      ? 'choose next'
      : generationState.matches('failed')
        ? 'try again'
        : customSpecErrors.length
          ? 'needs attention'
          : customNeedsSource
            ? 'needs source'
            : customHasResult
              ? 'ready'
              : customHasPrompt
                ? 'ready to create'
                : 'empty';
  const customPrimaryActionLabel = generationState.matches('creatingOpenAi')
    ? 'Creating...'
    : customFallbackOffered || generationState.matches('failed')
      ? 'Try Again'
      : customNeedsSource
        ? 'Connect Source First'
        : customHasResult
          ? 'Create New Version'
          : 'Create with AI';
  const showPresetShaderControls = showsPresetShaderControls(shaderNode.shaderKind);
  const roleStatus = shaderInspectorRoleStatus(shaderNode.shaderKind, sourceConnected);
  const presetPalette = normalizeShaderPalette(shaderNode.shaderKind, shaderNode.palette);
  const showCompositeControls = sourceConnected;
  const handleKindChange = (value: string) => {
    const shaderKind = value as ShaderKind;
    sendGeneration({ type: 'RESET' });
    setShaderNodeGenerationStatus(shaderNode.id, null);
    onChange({
      shaderKind,
      palette: defaultShaderPalette(shaderKind),
      ...(shaderKind === 'customSpec' && !shaderNode.customShaderSpec
        ? { customShaderSpec: cloneDefaultCustomShaderSpec() }
        : {}),
      ...(shaderKind === 'customCode' && !shaderNode.customShaderCode
        ? { customShaderCode: DEFAULT_CUSTOM_SHADER_CODE }
        : {}),
    });
  };
  const handleModeChange = (value: string) => {
    const mode = value as ShaderMode;
    if (mode === 'ai') {
      handleKindChange('customSpec');
      return;
    }
    if (mode === 'code') {
      handleKindChange('customCode');
      return;
    }
    if (shaderNode.shaderKind === 'customSpec' || shaderNode.shaderKind === 'customCode') {
      handleKindChange('meshGradient');
    }
  };
  const handleGenerateCustomSpec = useCallback(
    async (mode: AiShaderSpecRequestMode = 'openai') => {
      const prompt = customPrompt.trim();
      if (!prompt || customGenerating || customNeedsSource) return;
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
          { prompt, mode, idempotencyKey: createAiIdempotencyKey('shader') },
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
      customNeedsSource,
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
        label="Shader type"
        value={shaderMode}
        options={SHADER_MODE_OPTIONS}
        onChange={handleModeChange}
      />
      {shaderMode === 'preset' && (
        <InspectorSelect
          label="Preset"
          value={shaderNode.shaderKind}
          options={SHADER_KIND_OPTIONS}
          onChange={handleKindChange}
        />
      )}
      <ShaderRoleStatus status={roleStatus} />
      {shaderNode.shaderKind === 'customSpec' && (
        <InspectorSection
          title="AI Shader Pass"
          summary={customSummary}
          open={customOpen}
          onToggle={() => setCustomOpen((open) => !open)}
        >
          {!customHasResult && !customGenerating && !customFallbackOffered && !generationState.matches('failed') ? (
            <CustomShaderStatusMessage {...aiShaderPassEmptyStatus(customHasPrompt, sourceConnected)} tone="info" />
          ) : null}
          <InspectorTextArea
            value={customPrompt}
            placeholder="Describe how this should process the connected source"
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
            disabled={customGenerating || !customCanCreate}
            onClick={() => void handleGenerateCustomSpec('openai')}
          >
            {customPrimaryActionLabel}
          </button>
          {customFallbackOffered && (
            <button
              type="button"
              className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
              disabled={customGenerating || !customCanCreate}
              onClick={() => void handleGenerateCustomSpec('localFallback')}
            >
              Make Local Draft
            </button>
          )}
          {customGenerating && (
            <div className="node-inspector-loading" role="status" aria-live="polite">
              <span className="node-inspector-loading-dot" aria-hidden="true" />
              <div>
                <p className="node-inspector-loading-title">
                  {customGeneratingFallback ? 'Making local draft' : 'Creating shader'}
                </p>
                <p className="node-inspector-loading-copy">
                  {customGeneratingFallback
                    ? 'Making an editable draft from this prompt. It will be labeled as local.'
                    : 'Building an editable shader from this prompt. This usually takes a few seconds.'}
                </p>
              </div>
            </div>
          )}
          {!customGenerating && customStatus ? <CustomShaderStatusMessage {...customStatus} /> : null}
          {customSpec && customHasResult && !customGenerating && (
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
              {(customSpec.palette ?? cloneDefaultCustomShaderSpec().palette ?? []).map((color, index) => (
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
        </InspectorSection>
      )}
      {shaderNode.shaderKind === 'customCode' && (
        <InspectorSection
          title="Code Shader"
          summary={customCodeSummary}
          open={customOpen}
          onToggle={() => setCustomOpen((open) => !open)}
        >
          {customCodeStatus ? <CustomShaderStatusMessage {...customCodeStatus} /> : null}
          <InspectorTextArea
            value={customCode}
            rows={12}
            placeholder="vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }"
            onChange={(value) =>
              onChange({
                customShaderCode: {
                  version: 2,
                  language: 'glsl-fragment',
                  code: value,
                },
              })
            }
          />
          <p className="node-inspector-note">
            Write GLSL for <code>mainImage(uv)</code>. Use <code>u_backdrop</code> for the incoming image,{' '}
            <code>u_has_backdrop</code> to detect a connected input, plus <code>u_resolution</code>, <code>u_seed</code>
            , and <code>u_strength</code>. Preview uses a safe placeholder when code is empty or cannot compile.
          </p>
        </InspectorSection>
      )}
      {showPresetShaderControls && (
        <>
          <InspectorSection
            title="Colors"
            summary={`${presetPalette.length} colors`}
            open={colorsOpen}
            onToggle={() => setColorsOpen((open) => !open)}
          >
            <ShaderColorGrid shaderNode={shaderNode} onChange={onChange} />
          </InspectorSection>
          <InspectorSection
            title="Pattern"
            summary="shape / texture"
            open={patternOpen}
            onToggle={() => setPatternOpen((open) => !open)}
          >
            <div className="node-shader-flat-controls">
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
                label="Variation"
                value={shaderNode.seedOffset}
                min={0}
                max={9999}
                onChange={(value) => onChange({ seedOffset: value })}
              />
            </div>
          </InspectorSection>
        </>
      )}
      {showCompositeControls && (
        <InspectorSection
          title="Composite"
          summary={`${shaderNode.blendMode} / ${shaderNode.opacity}%`}
          open={compositeOpen}
          onToggle={() => setCompositeOpen((open) => !open)}
        >
          <div className="node-shader-flat-controls">
            <InspectorSelect
              label="Blend"
              value={shaderNode.blendMode}
              options={BLEND_OPTIONS}
              onChange={(value) => onChange({ blendMode: value })}
            />
            <InspectorSlider
              label="Opacity"
              value={shaderNode.opacity}
              min={0}
              max={100}
              onChange={(value) => onChange({ opacity: value })}
            />
          </div>
          <BlendModeNote value={shaderNode.blendMode} />
        </InspectorSection>
      )}
      {showPresetShaderControls && (
        <InspectorSection
          title="Placement"
          summary="rotation / offset"
          open={placementOpen}
          onToggle={() => setPlacementOpen((open) => !open)}
        >
          <div className="node-shader-flat-controls">
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
          </div>
        </InspectorSection>
      )}
      <p className="node-inspector-note">{shaderInspectorRoleNote(shaderNode.shaderKind)}</p>
    </div>
  );
}

function ShaderRoleStatus({ status }: { status: ReturnType<typeof shaderInspectorRoleStatus> }) {
  return (
    <div className={`node-shader-role-status node-shader-role-status-${status.mode}`}>
      <span>Role</span>
      <strong>{status.label}</strong>
      <p>{status.message}</p>
    </div>
  );
}

function ShaderColorGrid({
  shaderNode,
  onChange,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  const config = shaderPaletteConfig(shaderNode.shaderKind);
  const palette = normalizeShaderPalette(shaderNode.shaderKind, shaderNode.palette);
  const updatePalette = (nextPalette: string[]) => {
    onChange({ palette: normalizeShaderPalette(shaderNode.shaderKind, nextPalette) });
  };

  return (
    <>
      <div className="node-shader-color-grid">
        {palette.map((color, index) => (
          <div key={`shader-palette-${index}`} className="node-shader-color-swatch">
            <InspectorColorInput
              label={paletteLabel(index)}
              value={color}
              onChange={(value) => {
                const nextPalette = [...palette];
                nextPalette[index] = value;
                updatePalette(nextPalette);
              }}
            />
            {palette.length > config.min && (
              <button
                type="button"
                className="node-shader-color-remove nodrag nopan nowheel"
                onClick={() => updatePalette(palette.filter((_, colorIndex) => colorIndex !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {config.addable && palette.length < config.max && (
        <button
          type="button"
          className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
          onClick={() =>
            updatePalette([...palette, config.defaults[palette.length % config.defaults.length] ?? '#ffffff'])
          }
        >
          Add Color
        </button>
      )}
    </>
  );
}

function paletteLabel(index: number) {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
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
    case 'sourceLuma':
    case 'gradientMap':
      return (
        <InspectorSlider
          label="Strength"
          value={Math.round(operation.amount * 100)}
          min={operation.op === 'swirl' ? -200 : 0}
          max={operation.op === 'swirl' ? 200 : 100}
          valueLabel={`${Math.round(operation.amount * 100)}%`}
          onChange={(value) => onChange(index, { amount: value / 100 })}
        />
      );
    case 'edgeGlow':
      return (
        <>
          <InspectorSlider
            label="Strength"
            value={Math.round(operation.amount * 100)}
            min={0}
            max={200}
            valueLabel={`${Math.round(operation.amount * 100)}%`}
            onChange={(value) => onChange(index, { amount: value / 100 })}
          />
          <InspectorSlider
            label="Softness"
            value={Math.round((operation.softness ?? 0.18) * 100)}
            min={0}
            max={100}
            valueLabel={`${Math.round((operation.softness ?? 0.18) * 100)}%`}
            onChange={(value) => onChange(index, { softness: value / 100 })}
          />
        </>
      );
    case 'chromaticShift':
      return (
        <>
          <InspectorSlider
            label="Strength"
            value={Math.round(operation.amount * 100)}
            min={0}
            max={100}
            valueLabel={`${Math.round(operation.amount * 100)}%`}
            onChange={(value) => onChange(index, { amount: value / 100 })}
          />
          <InspectorSlider
            label="Angle"
            value={Math.round(operation.angle ?? 0)}
            min={-180}
            max={180}
            valueLabel={`${Math.round(operation.angle ?? 0)}°`}
            onChange={(value) => onChange(index, { angle: value })}
          />
        </>
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
    case 'sourceLuma':
      return 'Source light';
    case 'edgeGlow':
      return 'Edge glow';
    case 'chromaticShift':
      return 'Color split';
    case 'gradientMap':
      return 'Gradient map';
  }
}

function shaderModeForKind(shaderKind: ShaderKind): ShaderMode {
  if (shaderKind === 'customSpec') return 'ai';
  if (shaderKind === 'customCode') return 'code';
  return 'preset';
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
  if (mode === 'openai') {
    const fallbackPrompt = 'Could not create this shader. Try again, or make a local draft from the same prompt.';
    if (error instanceof AiGenerationApiError) {
      switch (error.code) {
        case 'unauthorized':
        case 'missing_auth':
          return 'Sign in, then try again. For local testing, make sure the app service is running.';
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
          return 'Creation returned something incomplete. Try again.';
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
