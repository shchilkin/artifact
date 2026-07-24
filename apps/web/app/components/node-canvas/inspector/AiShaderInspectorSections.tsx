import { useState } from 'react';
import {
  aiAccessReasonBody,
  aiAccessReasonTitle,
  aiAccessUsageLabel,
} from '../../../features/ai-access/aiAccessPresentation';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import type { GraphShaderNode, ShaderPropertyValue } from '../../../types/config';
import { InspectorStatus } from '../../inspector-system';
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
      <AiShaderAccessStatus generation={generation} />
      <AiShaderEmptyStatus
        visible={showAiShaderEmptyStatus(
          hasResult,
          generation.generating,
          generation.fallbackAvailable,
          failed,
          generation.blocked,
        )}
        hasPrompt={hasPrompt}
        sourceConnected={sourceConnected}
      />
      <InspectorTextArea
        label="Prompt"
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

function showAiShaderEmptyStatus(
  hasResult: boolean,
  generating: boolean,
  fallbackAvailable: boolean,
  failed: boolean,
  blocked: boolean,
) {
  return !hasResult && !generating && !fallbackAvailable && !failed && !blocked;
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
      disabled={generation.generating || !generation.canCreateWithAi}
      onClick={() => void generation.create('openai')}
    >
      {label}
    </button>
  );
}

function AiShaderAccessStatus({ generation }: { generation: AiShaderGeneration }) {
  const check = generation.aiAccess;
  if (check.status === 'checking') {
    return (
      <ShaderStatusMessage title="Checking AI access" message="Confirming what this account can create." tone="info" />
    );
  }
  if (check.status === 'error') {
    return (
      <>
        <ShaderStatusMessage title="Could not check AI access" message={check.error} tone="warning" />
        <AiShaderAccessAction label="Try Again" onClick={check.refresh} />
      </>
    );
  }
  if (check.access.enabled) {
    return <p className="node-inspector-access-summary">{enabledAccessSummary(check.access)}</p>;
  }
  const reason = check.access.disabledReason;
  return (
    <>
      <ShaderStatusMessage
        title={aiAccessReasonTitle(reason)}
        message={aiAccessReasonBody(reason, check.access)}
        tone="info"
      />
      <AiShaderDisabledAccessAction generation={generation} reason={reason} />
    </>
  );
}

function AiShaderDisabledAccessAction({
  generation,
  reason,
}: {
  generation: AiShaderGeneration;
  reason: string | undefined;
}) {
  if ((reason === 'anonymous' || reason === 'invalid_session') && generation.aiAccess.authConfigured) {
    return <AiShaderAccessAction label="Sign In" onClick={generation.aiAccess.openSignIn} />;
  }
  if (reason === 'operation_in_progress') {
    return <AiShaderAccessAction label="Check Again" onClick={generation.aiAccess.refresh} />;
  }
  return null;
}

function AiShaderAccessAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="node-inspector-action node-inspector-action-secondary nodrag nopan nowheel"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function enabledAccessSummary(access: NonNullable<AiShaderGeneration['aiAccess']['access']>) {
  const tier = access.tier ? `${access.tier[0]?.toUpperCase()}${access.tier.slice(1)}` : 'AI ready';
  const usage = aiAccessUsageLabel(access);
  const capacity = access.operations ? `${access.operations.active} of ${access.operations.limit} active` : null;
  return [tier, usage, capacity].filter(Boolean).join(' · ');
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
      <InspectorStatus loading title={loading.title} tone="info">
        {loading.message}
      </InspectorStatus>
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
        label="Refinement"
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
