import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useArtifactAuth } from '../hooks/useArtifactAuth';
import type {
  AiGenerationAccessState,
  AiGenerationJob,
  AiGenerationProvider,
  AiGenerationQuality,
} from '../types/aiGeneration';
import type { AspectRatio, ImageAiGenerationStatus, ImageLayer } from '../types/config';
import { storeAiGeneratedAssetSource } from '../utils/aiGeneratedAssetImport';
import {
  AiGenerationApiError,
  createAiGenerationJob,
  getAiGenerationAccess,
  getAiGenerationJob,
} from '../utils/aiGenerationClient';
import {
  getAiGenerationStatusDetail,
  getAiGenerationStatusLabel,
  getAiGenerationUiState,
} from '../utils/aiGenerationStatus';

const QUALITY_OPTIONS: AiGenerationQuality[] = ['draft', 'standard', 'high'];
const ASSET_IMPORT_TIMEOUT_MS = 30_000;

export interface AiGenerationPanelProps {
  aspect: AspectRatio;
  generation?: ImageLayer['aiGeneration'];
  generationHistory?: ImageLayer['aiGenerationHistory'];
  generationHistoryIndex?: number;
  onGeneratedImageSource: (src: string, generation: NonNullable<ImageLayer['aiGeneration']>) => void;
  onGenerationStateChange?: (generation: NonNullable<ImageLayer['aiGeneration']>) => void;
  onGenerationHistorySelect?: (index: number) => void;
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
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'AI API is not reachable. Start the local API server and try again.';
  }
  if (error instanceof Error) return error.message;
  return 'Generation failed.';
}

function disabledReasonMessage(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  if (reason === 'anonymous') return 'Account required.';
  if (reason === 'invalid_session') return 'Account session could not be verified.';
  if (reason === 'not_enabled') return 'AI access is not enabled for this account.';
  if (reason === 'quota_exhausted') return 'Monthly AI quota used.';
  if (reason === 'maintenance') return 'AI generation is temporarily unavailable.';
  return reason ?? null;
}

function disabledReasonTitle(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  if (reason === 'anonymous') return 'Account required for AI';
  if (reason === 'invalid_session') return 'Account verification failed';
  if (reason === 'not_enabled') return 'AI access is not enabled';
  if (reason === 'quota_exhausted') return 'Monthly AI quota used';
  if (reason === 'maintenance') return 'AI generation is paused';
  return 'AI generation unavailable';
}

function disabledReasonBody(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  if (reason === 'anonymous') return 'This feature uses AI. To use AI features, create an account.';
  if (reason === 'invalid_session')
    return 'The API could not verify this browser session. Sign out, sign in, and try again.';
  if (reason === 'not_enabled') return 'Your account needs AI access before it can create images.';
  if (reason === 'quota_exhausted') return 'Your monthly generation limit is used for this account.';
  if (reason === 'maintenance') return 'Generation is temporarily unavailable while the service is being maintained.';
  return disabledReasonMessage(reason) ?? 'Generation is not available right now.';
}

function generationMetadataFromJob(
  job: AiGenerationJob,
  status: ImageAiGenerationStatus = job.status,
  errorMessage = job.error?.message,
): NonNullable<ImageLayer['aiGeneration']> {
  return {
    prompt: job.prompt,
    provider: job.provider,
    model: job.model,
    quality: job.settings.quality,
    status,
    jobId: job.id,
    assetId: job.asset?.id,
    createdAt: job.completedAt ?? job.asset?.createdAt ?? job.createdAt,
    updatedAt: job.completedAt ?? new Date().toISOString(),
    errorCode: job.error?.code,
    errorMessage,
  };
}

function tokenTimeoutError() {
  return new AiGenerationApiError(
    'Could not read account session token. Refresh and sign in again.',
    0,
    'token_timeout',
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, createError: () => Error): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(createError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

function logAiPanelDebug(event: string, fields: Record<string, boolean | number | string | null | undefined> = {}) {
  const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  if (!env?.DEV) return;
  const summary = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  console.info(`[ai-generation] ${event}${summary ? ` ${summary}` : ''}`, fields);
}

function decodeBearerTokenClaims(token: string | undefined) {
  if (!token || token.split('.').length < 3) return null;
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return null;
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function debugClaim(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(debugClaim).filter(Boolean).join(',');
  return null;
}

function logBearerTokenClaims(token: string | undefined) {
  const claims = decodeBearerTokenClaims(token);
  if (!claims) return;
  logAiPanelDebug('access_check.token_claims', {
    sub: debugClaim(claims.sub),
    iss: debugClaim(claims.iss),
    aud: debugClaim(claims.aud),
    azp: debugClaim(claims.azp),
    sid: debugClaim(claims.sid),
  });
}

function GenerationProvenance({ generation }: { generation: ImageLayer['aiGeneration'] }) {
  if (!generation?.prompt) return null;
  const state = getAiGenerationUiState(generation);
  const label = getAiGenerationStatusLabel(generation);
  const detail = getAiGenerationStatusDetail(generation);
  return (
    <div className={`ai-generation-provenance ai-generation-provenance-${state}`}>
      <span>{label && state !== 'done' ? label : 'Current image prompt'}</span>
      <p>{generation.prompt}</p>
      {state === 'failed' && detail && <p>{detail}</p>}
    </div>
  );
}

function GenerationHistoryNavigator({
  history,
  index,
  onSelect,
}: {
  history: ImageLayer['aiGenerationHistory'];
  index?: number;
  onSelect?: (index: number) => void;
}) {
  const count = history?.length ?? 0;
  if (count <= 1) return null;
  const currentIndex = Math.min(Math.max(index ?? count - 1, 0), count - 1);
  const current = history?.[currentIndex];
  const title = current?.aiGeneration.prompt
    ? `Image prompt: ${current.aiGeneration.prompt}`
    : 'Generated image history';
  return (
    <div className="ai-generation-history-nav" aria-label="Generated image history">
      <button
        type="button"
        className="ai-generation-history-button"
        onClick={() => onSelect?.(currentIndex - 1)}
        disabled={!onSelect || currentIndex <= 0}
        aria-label="Previous generated image"
      >
        ‹
      </button>
      <span className="ai-generation-history-count" title={title}>
        {currentIndex + 1}/{count}
      </span>
      <button
        type="button"
        className="ai-generation-history-button"
        onClick={() => onSelect?.(currentIndex + 1)}
        disabled={!onSelect || currentIndex >= count - 1}
        aria-label="Next generated image"
      >
        ›
      </button>
    </div>
  );
}

export function AiGenerationPanel({
  aspect,
  generation,
  generationHistory,
  generationHistoryIndex,
  onGeneratedImageSource,
  onGenerationStateChange,
  onGenerationHistorySelect,
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
  const getBearerTokenRef = useRef<() => Promise<string | undefined>>(async () => undefined);
  const onGeneratedImageSourceRef = useRef<AiGenerationPanelProps['onGeneratedImageSource']>(onGeneratedImageSource);
  const onGenerationStateChangeRef = useRef<AiGenerationPanelProps['onGenerationStateChange']>(undefined);
  const auth = useArtifactAuth();
  const {
    configured: authConfigured,
    loaded: authLoaded,
    signedIn: authSignedIn,
    userId: authUserId,
    getToken: getAuthToken,
    openSignIn,
  } = auth;
  const baseUrl = useMemo(() => getAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const providers = access?.providers?.length ? access.providers : (['openai'] as AiGenerationProvider[]);
  const canGenerate = Boolean(access?.enabled && prompt.trim() && !busy && !jobIsActive(job));
  const activeJobId = jobIsActive(job) ? job.id : null;
  const activeJobStatus = jobIsActive(job) ? job.status : null;
  const getBearerToken = useCallback(async () => {
    if (devToken) return devToken;
    if (!authSignedIn) return undefined;
    return (await withTimeout(getAuthToken(), 8_000, tokenTimeoutError)) ?? undefined;
  }, [authSignedIn, devToken, getAuthToken]);

  useEffect(() => {
    getBearerTokenRef.current = getBearerToken;
  }, [getBearerToken]);

  useEffect(() => {
    onGeneratedImageSourceRef.current = onGeneratedImageSource;
  }, [onGeneratedImageSource]);

  useEffect(() => {
    onGenerationStateChangeRef.current = onGenerationStateChange;
  }, [onGenerationStateChange]);

  useEffect(() => {
    if (authConfigured && !authLoaded && !devToken) return;
    const controller = new AbortController();
    logAiPanelDebug('access_check.start', {
      authConfigured,
      authLoaded,
      authSignedIn,
      authUserId,
      hasDevToken: Boolean(devToken),
      baseUrl: baseUrl ?? null,
    });
    getBearerToken()
      .then((bearerToken) => {
        logAiPanelDebug('access_check.token', {
          authSignedIn,
          authUserId,
          hasBearerToken: Boolean(bearerToken),
        });
        logBearerTokenClaims(bearerToken);
        return getAiGenerationAccess({ baseUrl, bearerToken, signal: controller.signal });
      })
      .then((next) => {
        if (!controller.signal.aborted) {
          logAiPanelDebug('access_check.success', {
            authenticated: next.authenticated,
            enabled: next.enabled,
            disabledReason: next.disabledReason ?? null,
          });
          setAccess(next);
          setAccessError(null);
          if (next.providers?.[0]) setProvider(next.providers[0]);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          const message = errorMessage(error);
          logAiPanelDebug('access_check.failed', { message });
          setAccessError(message);
        }
      });
    return () => controller.abort();
  }, [authConfigured, authLoaded, authSignedIn, authUserId, baseUrl, devToken, getBearerToken]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus) return;
    let stopped = false;
    let timeout: number | undefined;
    let controller: AbortController | null = null;

    const schedulePoll = () => {
      timeout = window.setTimeout(() => {
        controller = new AbortController();
        getBearerTokenRef
          .current()
          .then((bearerToken) => getAiGenerationJob(activeJobId, { baseUrl, bearerToken, signal: controller?.signal }))
          .then((nextJob) => {
            if (stopped) return;
            logAiPanelDebug('job_poll.result', {
              jobId: nextJob.id,
              status: nextJob.status,
              hasAsset: Boolean(nextJob.asset?.uri),
            });
            onGenerationStateChangeRef.current?.(generationMetadataFromJob(nextJob));
            setJob(nextJob);
            if (jobIsActive(nextJob)) schedulePoll();
          })
          .catch((error) => {
            if (!stopped && !controller?.signal.aborted) setMessage(errorMessage(error));
          });
      }, 1500);
    };

    logAiPanelDebug('job_poll.start', { jobId: activeJobId, status: activeJobStatus });
    schedulePoll();

    return () => {
      stopped = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      controller?.abort();
    };
  }, [activeJobId, activeJobStatus, baseUrl]);

  useEffect(() => {
    if (job?.status !== 'succeeded' || importedJobIds.current.has(job.id)) return;
    importedJobIds.current.add(job.id);
    setBusy(true);
    onGenerationStateChangeRef.current?.(generationMetadataFromJob(job, 'importing'));
    logAiPanelDebug('asset_import.start', {
      jobId: job.id,
      assetId: job.asset?.id ?? null,
      hasAssetUri: Boolean(job.asset?.uri),
    });
    const controller = new AbortController();
    getBearerToken()
      .then((bearerToken) =>
        withTimeout(
          storeAiGeneratedAssetSource(job, { baseUrl, devToken: bearerToken, signal: controller.signal }),
          ASSET_IMPORT_TIMEOUT_MS,
          () => new Error('Generated image import timed out.'),
        ),
      )
      .then((src) => {
        logAiPanelDebug('asset_import.success', { jobId: job.id });
        onGeneratedImageSourceRef.current(src, generationMetadataFromJob(job));
        setMessage(successMessage);
      })
      .catch((error) => {
        importedJobIds.current.delete(job.id);
        const message = errorMessage(error);
        logAiPanelDebug('asset_import.failed', { jobId: job.id, message });
        onGenerationStateChangeRef.current?.(generationMetadataFromJob(job, 'failed', message));
        setJob({
          ...job,
          status: 'failed',
          error: { code: 'asset_import_failed', message, retryable: true },
          completedAt: job.completedAt ?? new Date().toISOString(),
        });
        setMessage(message);
      })
      .finally(() => {
        controller.abort();
        setBusy(false);
      });
  }, [baseUrl, getBearerToken, job, successMessage]);

  const handleGenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || !access?.enabled) return;
    setBusy(true);
    setMessage(null);
    getBearerToken()
      .then((bearerToken) =>
        createAiGenerationJob(
          {
            prompt: trimmed,
            provider,
            settings: { aspect, quality },
            idempotencyKey: createIdempotencyKey(),
          },
          { baseUrl, bearerToken },
        ),
      )
      .then((nextJob) => {
        onGenerationStateChange?.(generationMetadataFromJob(nextJob));
        setJob(nextJob);
      })
      .catch((error) => {
        const message = errorMessage(error);
        onGenerationStateChange?.({
          prompt: trimmed,
          provider,
          quality,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          errorMessage: message,
        });
        setMessage(message);
      })
      .finally(() => setBusy(false));
  }, [access?.enabled, aspect, baseUrl, getBearerToken, onGenerationStateChange, prompt, provider, quality]);

  const disabledReason = accessError ?? disabledReasonMessage(access && !access.enabled ? access.disabledReason : null);
  const status = job?.error?.message ?? message ?? (job ? job.status : disabledReason);
  const accessBlockReason = accessError
    ? accessError
    : access?.enabled
      ? null
      : authSignedIn && access?.authenticated === false
        ? 'invalid_session'
        : access?.disabledReason;

  if (!access?.enabled) {
    return (
      <div className="ai-generation-panel">
        <div className="ai-generation-access-banner" role="status" id="ai-generation-status">
          <span>{access ? disabledReasonTitle(accessBlockReason) : 'Checking AI access'}</span>
          <p>
            {access
              ? disabledReasonBody(accessBlockReason)
              : authSignedIn
                ? 'Signed in. Checking the AI API and account access.'
                : 'Generation controls will appear when this browser has AI access.'}
          </p>
        </div>
        {accessBlockReason === 'anonymous' && authConfigured && (
          <button type="button" className="ai-generation-access-action" onClick={openSignIn}>
            Create Account
          </button>
        )}
        <GenerationHistoryNavigator
          history={generationHistory}
          index={generationHistoryIndex}
          onSelect={onGenerationHistorySelect}
        />
        <GenerationProvenance generation={generation} />
      </div>
    );
  }

  return (
    <div className="ai-generation-panel">
      <GenerationHistoryNavigator
        history={generationHistory}
        index={generationHistoryIndex}
        onSelect={onGenerationHistorySelect}
      />
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
