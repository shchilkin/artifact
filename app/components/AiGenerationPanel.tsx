import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiGenerationAccessState,
  AiGenerationJob,
  AiGenerationProvider,
  AiGenerationQuality,
} from '../types/aiGeneration';
import type { AspectRatio } from '../types/config';
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
  onGeneratedImageSource: (src: string) => void;
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

export function AiGenerationPanel({ aspect, onGeneratedImageSource }: AiGenerationPanelProps) {
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
        onGeneratedImageSource(src);
        setMessage('Added image layer.');
      })
      .catch((error) => {
        importedJobIds.current.delete(job.id);
        setMessage(errorMessage(error));
      })
      .finally(() => setBusy(false));
  }, [baseUrl, devToken, job, onGeneratedImageSource]);

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

  const disabledReason = accessError ?? (access && !access.enabled ? access.disabledReason : null);
  const status = job?.error?.message ?? message ?? (job ? job.status : disabledReason);

  return (
    <div className="ai-generation-panel">
      <textarea
        data-ai-generation-prompt
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Prompt"
        rows={3}
        disabled={!access?.enabled || busy}
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
        {busy || jobIsActive(job) ? '...' : 'Generate'}
      </button>
      <div className="ai-generation-meta">
        <span>{access?.quota ? `${access.quota.remaining}/${access.quota.limit}` : 'AI'}</span>
        <span>{status}</span>
      </div>
    </div>
  );
}
