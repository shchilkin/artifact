import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiGenerationAccessState,
  AiGenerationJob,
  AiGenerationProvider,
  AiGenerationQuality,
} from '../types/aiGeneration';
import type { AspectRatio, ImageLayer } from '../types/config';
import { storeAiGeneratedAssetSource } from '../utils/aiGeneratedAssetImport';
import {
  AiGenerationApiError,
  createAiGenerationJob,
  getAiGenerationAccess,
  getAiGenerationJob,
} from '../utils/aiGenerationClient';

const QUALITY_OPTIONS: AiGenerationQuality[] = ['draft', 'standard', 'high'];

export interface AiGenerationPanelProps {
  aspect: AspectRatio;
  generation?: ImageLayer['aiGeneration'];
  onGeneratedImageSource: (src: string, generation: NonNullable<ImageLayer['aiGeneration']>) => void;
  submitLabel?: string;
  successMessage?: string;
}

function getAiApiBaseUrl() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_BASE_URL;
}

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function jobIsActive(job: AiGenerationJob | null) {
  return job?.status === 'queued' || job?.status === 'running';
}

function errorMessage(error: unknown) {
  if (error instanceof AiGenerationApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Generation failed.';
}

function disabledReasonMessage(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  if (reason === 'anonymous') return 'Account required.';
  if (reason === 'not_enabled') return 'AI access is not enabled for this account.';
  if (reason === 'quota_exhausted') return 'Monthly AI quota used.';
  if (reason === 'maintenance') return 'AI generation is temporarily unavailable.';
  return reason ?? null;
}

function disabledReasonTitle(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  if (reason === 'anonymous') return 'Account required for AI';
  if (reason === 'not_enabled') return 'AI access is not enabled';
  if (reason === 'quota_exhausted') return 'Monthly AI quota used';
  if (reason === 'maintenance') return 'AI generation is paused';
  return 'AI generation unavailable';
}

function disabledReasonBody(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  if (reason === 'anonymous') return 'This feature uses AI. To use AI features, create an account.';
  if (reason === 'not_enabled') return 'Your account needs AI access before it can create images.';
  if (reason === 'quota_exhausted') return 'Your monthly generation limit is used for this account.';
  if (reason === 'maintenance') return 'Generation is temporarily unavailable while the service is being maintained.';
  return disabledReasonMessage(reason) ?? 'Generation is not available right now.';
}

function generationMetadataFromJob(job: AiGenerationJob): NonNullable<ImageLayer['aiGeneration']> {
  return {
    prompt: job.prompt,
    provider: job.provider,
    model: job.model,
    quality: job.settings.quality,
    jobId: job.id,
    assetId: job.asset?.id,
    createdAt: job.completedAt ?? job.asset?.createdAt ?? job.createdAt,
  };
}

function GenerationProvenance({ generation }: { generation: ImageLayer['aiGeneration'] }) {
  if (!generation?.prompt) return null;
  return (
    <div className="ai-generation-provenance">
      <span>Current image prompt</span>
      <p>{generation.prompt}</p>
    </div>
  );
}

export function AiGenerationPanel({
  aspect,
  generation,
  onGeneratedImageSource,
  submitLabel = 'Generate',
  successMessage = 'Added image layer.',
}: AiGenerationPanelProps) {
  const [access, setAccess] = useState<AiGenerationAccessState | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<AiGenerationQuality>('standard');
  const [provider, setProvider] = useState<AiGenerationProvider>('openai');
  const [job, setJob] = useState<AiGenerationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const importedJobIds = useRef(new Set<string>());
  const baseUrl = useMemo(() => getAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const providers = access?.providers?.length ? access.providers : (['openai'] as AiGenerationProvider[]);
  const canGenerate = Boolean(access?.enabled && prompt.trim() && !busy && !jobIsActive(job));

  useEffect(() => {
    const controller = new AbortController();
    getAiGenerationAccess({ baseUrl, devToken, signal: controller.signal })
      .then((next) => {
        setAccess(next);
        setAccessError(null);
        if (next.providers?.[0]) setProvider(next.providers[0]);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAccessError(errorMessage(error));
      });
    return () => controller.abort();
  }, [baseUrl, devToken]);

  useEffect(() => {
    if (!jobIsActive(job)) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      getAiGenerationJob(job.id, { baseUrl, devToken, signal: controller.signal })
        .then(setJob)
        .catch((error) => {
          if (!controller.signal.aborted) setMessage(errorMessage(error));
        });
    }, 1500);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [baseUrl, devToken, job]);

  useEffect(() => {
    if (job?.status !== 'succeeded' || importedJobIds.current.has(job.id)) return;
    importedJobIds.current.add(job.id);
    setBusy(true);
    storeAiGeneratedAssetSource(job, { baseUrl, devToken })
      .then((src) => {
        onGeneratedImageSource(src, generationMetadataFromJob(job));
        setMessage(successMessage);
      })
      .catch((error) => {
        importedJobIds.current.delete(job.id);
        setMessage(errorMessage(error));
      })
      .finally(() => setBusy(false));
  }, [baseUrl, devToken, job, onGeneratedImageSource, successMessage]);

  const handleGenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || !access?.enabled) return;
    setBusy(true);
    setMessage(null);
    createAiGenerationJob(
      {
        prompt: trimmed,
        provider,
        settings: { aspect, quality },
        idempotencyKey: createIdempotencyKey(),
      },
      { baseUrl, devToken },
    )
      .then(setJob)
      .catch((error) => setMessage(errorMessage(error)))
      .finally(() => setBusy(false));
  }, [access?.enabled, aspect, baseUrl, devToken, prompt, provider, quality]);

  const disabledReason = accessError ?? disabledReasonMessage(access && !access.enabled ? access.disabledReason : null);
  const status = job?.error?.message ?? message ?? (job ? job.status : disabledReason);
  const accessBlockReason = accessError ? accessError : access?.enabled ? null : access?.disabledReason;

  if (!access?.enabled) {
    return (
      <div className="ai-generation-panel">
        <div className="ai-generation-access-banner" role="status" id="ai-generation-status">
          <span>{access ? disabledReasonTitle(accessBlockReason) : 'Checking AI access'}</span>
          <p>
            {access
              ? disabledReasonBody(accessBlockReason)
              : 'Generation controls will appear when this browser has AI access.'}
          </p>
        </div>
        <GenerationProvenance generation={generation} />
      </div>
    );
  }

  return (
    <div className="ai-generation-panel">
      <GenerationProvenance generation={generation} />
      <textarea
        data-ai-generation-prompt
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Prompt"
        rows={3}
        disabled={!access?.enabled || busy}
        aria-describedby={!access?.enabled ? 'ai-generation-status' : undefined}
      />
      <div className="ai-generation-grid">
        <select value={provider} onChange={(event) => setProvider(event.target.value as AiGenerationProvider)}>
          {providers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={quality} onChange={(event) => setQuality(event.target.value as AiGenerationQuality)}>
          {QUALITY_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-primary ai-generation-submit"
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {busy || jobIsActive(job) ? '...' : submitLabel}
      </button>
      <div className="ai-generation-meta" id="ai-generation-status">
        <span>{access?.quota ? `${access.quota.remaining}/${access.quota.limit}` : 'AI'}</span>
        <span>{status}</span>
      </div>
    </div>
  );
}
