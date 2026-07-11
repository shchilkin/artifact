import { useState } from 'react';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import type { GraphShaderNode, ShaderPropertyValue } from '../../../types/config';
import type { AiShaderInspectorStatus, AiShaderInspectorViewModel } from './AiShaderInspectorModel';
import { InspectorSection, InspectorSlider, InspectorTextArea } from './fields';
import { aiShaderEmptyStatus } from './ShaderInspectorModel';
import { ShaderPropertyControl } from './ShaderPropertyControl';
import { ShaderStatusMessage } from './ShaderStatusMessage';
import type { useAiShaderGeneration } from './useAiShaderGeneration';

type AiShaderGeneration = ReturnType<typeof useAiShaderGeneration>;
type AiShaderInstance = NonNullable<GraphShaderNode['shaderInstance']>;

export function AiShaderPromptSection({
  prompt,
  viewModel,
  hasPrompt,
  hasResult,
  sourceConnected,
  generation,
  onPromptChange,
}: {
  prompt: string;
  viewModel: AiShaderInspectorViewModel;
  hasPrompt: boolean;
  hasResult: boolean;
  sourceConnected: boolean;
  generation: AiShaderGeneration;
  onPromptChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const failed = generation.state.matches('failed');

  return (
    <InspectorSection
      title="Prompt"
      summary={viewModel.summary}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <AiShaderEmptyStatus
        visible={showAiShaderEmptyStatus(hasResult, generation.generating, generation.fallbackAvailable, failed)}
        hasPrompt={hasPrompt}
        sourceConnected={sourceConnected}
      />
      <InspectorTextArea
        value={prompt}
        placeholder="Describe how this should transform the connected artwork"
        onChange={onPromptChange}
      />
      <CharacterCount value={prompt} />
      <AiShaderPrimaryAction generation={generation} label={viewModel.primaryActionLabel} />
      <AiShaderFallbackAction generation={generation} visible={generation.fallbackAvailable} />
      <AiShaderGenerationFeedback
        generating={generation.generating}
        loading={viewModel.loading}
        status={viewModel.status}
      />
    </InspectorSection>
  );
}

function showAiShaderEmptyStatus(hasResult: boolean, generating: boolean, fallbackAvailable: boolean, failed: boolean) {
  return !hasResult && !generating && !fallbackAvailable && !failed;
}

function AiShaderEmptyStatus({
  visible,
  hasPrompt,
  sourceConnected,
}: {
  visible: boolean;
  hasPrompt: boolean;
  sourceConnected: boolean;
}) {
  if (!visible) return null;
  return <ShaderStatusMessage {...aiShaderEmptyStatus(hasPrompt, sourceConnected)} tone="info" />;
}

function AiShaderPrimaryAction({ generation, label }: { generation: AiShaderGeneration; label: string }) {
  return (
    <button
      type="button"
      className="node-inspector-action nodrag nopan nowheel"
      disabled={generation.generating || !generation.canCreate}
      onClick={() => void generation.create('openai')}
    >
      {label}
    </button>
  );
}

function AiShaderFallbackAction({ generation, visible }: { generation: AiShaderGeneration; visible: boolean }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
      disabled={generation.generating || !generation.canCreate}
      onClick={() => void generation.create('localFallback')}
    >
      Make Local Draft
    </button>
  );
}

function CharacterCount({ value }: { value: string }) {
  const tooLong = value.length > AI_SHADER_PROMPT_MAX_LENGTH;
  return (
    <p
      className={`node-inspector-character-count${tooLong ? ' node-inspector-character-count-warning' : ''}`}
      aria-live="polite"
    >
      {value.length} / {AI_SHADER_PROMPT_MAX_LENGTH}
    </p>
  );
}

function AiShaderGenerationFeedback({
  generating,
  loading,
  status,
}: {
  generating: boolean;
  loading: AiShaderInspectorViewModel['loading'];
  status: AiShaderInspectorStatus | null;
}) {
  if (generating) {
    return (
      <div className="node-inspector-loading" role="status" aria-live="polite">
        <span className="node-inspector-loading-dot" aria-hidden="true" />
        <div>
          <p className="node-inspector-loading-title">{loading.title}</p>
          <p className="node-inspector-loading-copy">{loading.message}</p>
        </div>
      </div>
    );
  }
  return status ? <ShaderStatusMessage {...status} /> : null;
}

export function AiShaderRefineSection({
  available,
  generation,
}: {
  available: boolean;
  generation: AiShaderGeneration;
}) {
  if (!available) return null;
  return <AiShaderRefineContent generation={generation} />;
}

function AiShaderRefineContent({ generation }: { generation: AiShaderGeneration }) {
  const [open, setOpen] = useState(true);
  const [instruction, setInstruction] = useState('');
  const canRefine = generation.canRefine(instruction);

  const refine = async () => {
    const accepted = await generation.refine(instruction);
    if (accepted) setInstruction('');
  };

  return (
    <InspectorSection
      title="Refine"
      summary={refineSummary(generation.refining, instruction)}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <InspectorTextArea
        value={instruction}
        placeholder="Describe what to change while keeping the current effect"
        onChange={setInstruction}
      />
      <CharacterCount value={instruction} />
      <button
        type="button"
        className="node-inspector-action nodrag nopan nowheel"
        disabled={!canRefine}
        onClick={() => void refine()}
      >
        {refineActionLabel(generation.refining)}
      </button>
    </InspectorSection>
  );
}

function refineSummary(refining: boolean, instruction: string) {
  if (refining) return 'refining';
  return instruction.trim() ? 'ready' : 'optional';
}

function refineActionLabel(refining: boolean) {
  return refining ? 'Refining...' : 'Refine with AI';
}

export function AiShaderControlsSection({
  available,
  shaderNode,
  builtInControls,
  onChange,
  onPropertyChange,
}: {
  available: boolean;
  shaderNode: GraphShaderNode;
  builtInControls: Array<'strength' | 'variation'>;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  onPropertyChange: (key: string, value: ShaderPropertyValue) => void;
}) {
  const instance = shaderNode.shaderInstance;
  if (!available) return null;
  if (!instance) return null;
  return (
    <AiShaderControlsContent
      shaderNode={shaderNode}
      instance={instance}
      builtInControls={builtInControls}
      onChange={onChange}
      onPropertyChange={onPropertyChange}
    />
  );
}

function AiShaderControlsContent({
  shaderNode,
  instance,
  builtInControls,
  onChange,
  onPropertyChange,
}: {
  shaderNode: GraphShaderNode;
  instance: AiShaderInstance;
  builtInControls: Array<'strength' | 'variation'>;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  onPropertyChange: (key: string, value: ShaderPropertyValue) => void;
}) {
  const [open, setOpen] = useState(true);
  const definition = instance.definition;

  return (
    <InspectorSection
      title="Controls"
      summary={`${definition.properties.length + builtInControls.length} controls`}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <div className="node-shader-flat-controls">
        <AiShaderStrengthControl
          visible={builtInControls.includes('strength')}
          shaderNode={shaderNode}
          onChange={onChange}
        />
        <AiShaderVariationControl
          visible={builtInControls.includes('variation')}
          shaderNode={shaderNode}
          onChange={onChange}
        />
        {definition.properties.map((property) => (
          <ShaderPropertyControl
            key={property.key}
            property={property}
            value={instance.values[property.key] ?? property.default}
            showUniformName={false}
            onChange={(value) => onPropertyChange(property.key, value)}
          />
        ))}
      </div>
    </InspectorSection>
  );
}

function AiShaderStrengthControl({
  visible,
  shaderNode,
  onChange,
}: {
  visible: boolean;
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  if (!visible) return null;
  return (
    <InspectorSlider
      label="Strength"
      value={shaderNode.distortion}
      min={0}
      max={100}
      onChange={(value) => onChange({ distortion: value })}
    />
  );
}

function AiShaderVariationControl({
  visible,
  shaderNode,
  onChange,
}: {
  visible: boolean;
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
}) {
  if (!visible) return null;
  return (
    <InspectorSlider
      label="Variation"
      value={shaderNode.seedOffset}
      min={0}
      max={9999}
      onChange={(value) => onChange({ seedOffset: value })}
    />
  );
}
