import type { AiShaderGenerationResponse, AiShaderValidationResponse } from '../types/aiGeneration';
import { type AiGenerationClientOptions, validateAiShader } from './aiGenerationClient';
import { compileCustomCodeShaderForDiagnostics } from './render/customCodeShader';

interface AiShaderAcceptanceDependencies {
  compile?: typeof compileCustomCodeShaderForDiagnostics;
  report?: typeof validateAiShader;
  browser?: string;
}

export type AiShaderAcceptanceResult =
  | { accepted: true }
  | { accepted: false; repairAvailable: boolean; message: string | null };

export async function validateAndCommitAiShaderCandidate(
  candidate: AiShaderGenerationResponse,
  options: AiGenerationClientOptions,
  commit: (candidate: AiShaderGenerationResponse) => void,
  dependencies: AiShaderAcceptanceDependencies = {},
): Promise<AiShaderAcceptanceResult> {
  const compile = dependencies.compile ?? compileCustomCodeShaderForDiagnostics;
  const report = dependencies.report ?? validateAiShader;
  const prepared = compile(candidate.instance.definition.code, candidate.instance.definition.properties, {
    requireBackdrop: true,
    requirePropertyUniforms: true,
    requirePropertyInfluence: true,
    requireVisualVariation: true,
  });
  if (!prepared.ok) {
    const validation = await report(
      candidate.requestId,
      candidate.candidateRevision,
      'rejected',
      {
        stage: prepared.stage ?? 'compile',
        message: prepared.message ?? 'Shader validation failed.',
        browser: dependencies.browser ?? browserIdentity(),
      },
      options,
    );
    return {
      accepted: false,
      repairAvailable: validation.repairAvailable,
      message: prepared.message,
    };
  }

  const validation = await report(candidate.requestId, candidate.candidateRevision, 'accepted', undefined, options);
  assertAccepted(validation, candidate.candidateRevision);
  commit(candidate);
  return { accepted: true };
}

function assertAccepted(validation: AiShaderValidationResponse, candidateRevision: 0 | 1) {
  if (validation.status !== 'accepted' || validation.candidateRevision !== candidateRevision) {
    throw new Error('Shader acceptance was not confirmed for this candidate.');
  }
}

function browserIdentity() {
  return typeof navigator === 'undefined' ? undefined : navigator.userAgent.slice(0, 160);
}
