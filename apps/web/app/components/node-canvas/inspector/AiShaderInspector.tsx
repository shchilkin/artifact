import { useCallback, useMemo } from 'react';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import type { GraphShaderNode, ShaderPropertyValue } from '../../../types/config';
import { compileCustomCodeShaderForDiagnostics } from '../../../utils/render/customCodeShader';
import { aiShaderInspectorViewModel } from './AiShaderInspectorModel';
import { AiShaderControlsSection, AiShaderPromptSection, AiShaderRefineSection } from './AiShaderInspectorSections';
import { codeShaderUniformControls } from './CodeShaderInspectorModel';
import { useAiShaderGeneration } from './useAiShaderGeneration';

type AiShaderGeneration = ReturnType<typeof useAiShaderGeneration>;

export function AiShaderInspector({
  shaderNode,
  onChange,
  sourceConnected,
}: {
  shaderNode: GraphShaderNode;
  onChange: (patch: Partial<GraphShaderNode>) => void;
  sourceConnected: boolean;
}) {
  const { instance, provenance } = aiShaderParts(shaderNode);
  const prompt = resolveAiShaderPrompt(shaderNode);
  const generation = useAiShaderGeneration({ shaderNode, onChange, prompt, sourceConnected });
  const generationState = generation.state;
  const promptTooLong = prompt.length > AI_SHADER_PROMPT_MAX_LENGTH;
  const hasPrompt = prompt.trim().length >= 3;
  const hasResult = hasAiShaderResult(shaderNode);
  const compileResult = useMemo(() => compileAiShaderDefinition(shaderNode), [shaderNode]);
  const viewModel = aiShaderInspectorViewModel({
    promptTooLong,
    sourceConnected,
    compileFailed: aiShaderCompileFailed(compileResult),
    compileMessage: aiShaderCompileMessage(compileResult),
    generationMessage: generationState.context.message,
    fallbackAvailable: generation.fallbackAvailable,
    blocked: generation.blocked,
    failed: generationState.matches('failed'),
    provenance,
    generating: generation.generating,
    creatingOpenAi: generationState.matches('creatingOpenAi'),
    refining: generation.refining,
    validating: generation.validating,
    repairing: generation.repairing,
    generatingFallback: generation.generatingFallback,
    hasResult,
    hasPrompt,
  });

  const changeProperty = useCallback(
    (key: string, value: ShaderPropertyValue) => {
      if (!instance) return;
      onChange({ shaderInstance: { ...instance, values: { ...instance.values, [key]: value } } });
    },
    [instance, onChange],
  );
  const { cancelAndReset } = generation;
  const onPromptChange = useCallback(
    (value: string) => {
      cancelAndReset();
      onChange({ aiPrompt: value });
    },
    [cancelAndReset, onChange],
  );

  return (
    <>
      <AiShaderPromptSection
        prompt={prompt}
        viewModel={viewModel}
        hasPrompt={hasPrompt}
        hasResult={hasResult}
        sourceConnected={sourceConnected}
        generation={generation}
        onPromptChange={onPromptChange}
      />
      <AiShaderRefineSection available={canRefineAiShader(shaderNode, hasResult)} generation={generation} />
      <AiShaderControlsSection
        available={showAiShaderControls(hasResult, generation)}
        shaderNode={shaderNode}
        builtInControls={aiShaderBuiltInControls(shaderNode)}
        onChange={onChange}
        onPropertyChange={changeProperty}
      />
    </>
  );
}

function aiShaderParts(shaderNode: GraphShaderNode) {
  const instance = shaderNode.shaderInstance;
  return { instance, provenance: instance?.definition.provenance };
}

function aiShaderCompileFailed(result: ReturnType<typeof compileAiShaderDefinition>) {
  return result ? !result.ok : false;
}

function aiShaderCompileMessage(result: ReturnType<typeof compileAiShaderDefinition>) {
  return result?.message;
}

function resolveAiShaderPrompt(shaderNode: GraphShaderNode) {
  const provenancePrompt = shaderNode.shaderInstance?.definition.provenance?.prompt;
  return shaderNode.aiPrompt ?? provenancePrompt ?? '';
}

function hasAiShaderResult(shaderNode: GraphShaderNode) {
  const definition = shaderNode.shaderInstance?.definition;
  if (!definition) return false;
  return Boolean(definition.code.trim() && definition.provenance);
}

function compileAiShaderDefinition(shaderNode: GraphShaderNode) {
  const definition = shaderNode.shaderInstance?.definition;
  if (!definition?.code.trim()) return null;
  return compileCustomCodeShaderForDiagnostics(definition.code, definition.properties, {
    requireBackdrop: true,
    requirePropertyUniforms: true,
    requirePropertyInfluence: true,
    requireVisualVariation: true,
  });
}

function aiShaderBuiltInControls(shaderNode: GraphShaderNode) {
  const code = shaderNode.shaderInstance?.definition.code;
  return code ? codeShaderUniformControls(code) : [];
}

function canRefineAiShader(shaderNode: GraphShaderNode, hasResult: boolean) {
  const requestId = shaderNode.shaderInstance?.definition.provenance?.requestId;
  return Boolean(hasResult && requestId);
}

function showAiShaderControls(hasResult: boolean, generation: AiShaderGeneration) {
  return hasResult && !generation.generating;
}
