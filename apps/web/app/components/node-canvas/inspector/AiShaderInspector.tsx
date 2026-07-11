import { useCallback, useMemo, useState } from 'react';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import type { GraphShaderNode, ShaderPropertyValue } from '../../../types/config';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { codeShaderUniformControls } from './CodeShaderInspectorModel';
import { InspectorSection, InspectorSlider, InspectorTextArea } from './fields';
import { aiShaderEmptyStatus } from './ShaderInspectorModel';
import { ShaderPropertyControl } from './ShaderPropertyControl';
import { ShaderStatusMessage } from './ShaderStatusMessage';
import { useAiShaderGeneration } from './useAiShaderGeneration';

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
  const instance = shaderNode.shaderInstance;
  const definition = instance?.definition;
  const provenance = definition?.provenance;
  const prompt = shaderNode.aiPrompt ?? provenance?.prompt ?? '';
  const generation = useAiShaderGeneration({ shaderNode, onChange, prompt, sourceConnected });
  const generationState = generation.state;
  const promptTooLong = prompt.length > AI_SHADER_PROMPT_MAX_LENGTH;
  const hasPrompt = prompt.trim().length >= 3;
  const hasResult = Boolean(definition?.code.trim() && provenance);
  const { validating, repairing, refining, generating, fallbackAvailable, generatingFallback, canCreate } = generation;
  const cleanRefineInstruction = refineInstruction.trim();
  const canRefine = generation.canRefine(refineInstruction);
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
            generation.cancelAndReset();
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
          onClick={() => void generation.create('openai')}
        >
          {primaryActionLabel}
        </button>
        {fallbackAvailable ? (
          <button
            type="button"
            className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
            disabled={generating || !canCreate}
            onClick={() => void generation.create('localFallback')}
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
              void generation.refine(refineInstruction).then((accepted) => accepted && setRefineInstruction(''))
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
