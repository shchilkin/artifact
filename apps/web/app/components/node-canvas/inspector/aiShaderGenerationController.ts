import type { AiShaderGenerationResponse, CreateAiShaderRequest } from '../../../types/aiGeneration';
import { type AiGenerationClientOptions, createAiShader, repairAiShader } from '../../../utils/aiGenerationClient';
import { validateAndCommitAiShaderCandidate } from '../../../utils/aiShaderAcceptance';

export type AiShaderGenerationPhase = 'candidateReceived' | 'repairing' | 'repairReceived';

export type AiShaderGenerationResult =
  | { kind: 'accepted'; candidate: AiShaderGenerationResponse }
  | { kind: 'rejected'; repaired: boolean }
  | { kind: 'repairFailed'; error: unknown }
  | { kind: 'cancelled' };

interface AiShaderGenerationDependencies {
  create?: typeof createAiShader;
  repair?: typeof repairAiShader;
  validate?: typeof validateAndCommitAiShaderCandidate;
}

export async function runAiShaderGeneration({
  request,
  clientOptions,
  commit,
  onPhase,
  dependencies = {},
}: {
  request: CreateAiShaderRequest;
  clientOptions: AiGenerationClientOptions;
  commit: (candidate: AiShaderGenerationResponse) => void;
  onPhase: (phase: AiShaderGenerationPhase) => void;
  dependencies?: AiShaderGenerationDependencies;
}): Promise<AiShaderGenerationResult> {
  const create = dependencies.create ?? createAiShader;
  const repair = dependencies.repair ?? repairAiShader;
  const validate = dependencies.validate ?? validateAndCommitAiShaderCandidate;
  let candidate = await create(request, clientOptions);
  if (clientOptions.signal?.aborted) return { kind: 'cancelled' };
  onPhase('candidateReceived');

  const commitIfActive = (accepted: AiShaderGenerationResponse) => {
    if (!clientOptions.signal?.aborted) commit(accepted);
  };
  let acceptance = await validate(candidate, clientOptions, commitIfActive);
  if (clientOptions.signal?.aborted) return { kind: 'cancelled' };
  if (acceptance.accepted) return { kind: 'accepted', candidate };
  if (!acceptance.repairAvailable || request.mode === 'localFallback') {
    return { kind: 'rejected', repaired: false };
  }

  onPhase('repairing');
  try {
    candidate = await repair(candidate.requestId, clientOptions);
  } catch (error) {
    return { kind: 'repairFailed', error };
  }
  if (clientOptions.signal?.aborted) return { kind: 'cancelled' };
  onPhase('repairReceived');
  acceptance = await validate(candidate, clientOptions, commitIfActive);
  if (clientOptions.signal?.aborted) return { kind: 'cancelled' };
  return acceptance.accepted ? { kind: 'accepted', candidate } : { kind: 'rejected', repaired: true };
}
