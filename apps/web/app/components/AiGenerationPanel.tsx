import { Button, Field, InlineNotice, NativeSelect, ProgressIndicator, Textarea } from '@artifact/ui';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aiAccessReasonBody,
  aiAccessReasonMessage,
  aiAccessReasonTitle,
  aiAccessUsageLabel,
} from '../features/ai-access/aiAccessPresentation';
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
  isRetryableAiPollingError,
} from '../utils/aiGenerationClient';
import {
  getAiGenerationStatusDetail,
  getAiGenerationStatusLabel,
  getAiGenerationUiState,
} from '../utils/aiGenerationStatus';
import { getArtifactAiApiBaseUrl } from '../utils/apiBaseUrl';
import { getAppBuildInfo } from '../utils/appBuildInfo';

const QUALITY_OPTIONS: AiGenerationQuality[] = ['draft', 'standard', 'high'];
const ASSET_IMPORT_TIMEOUT_MS = 30_000;
const AI_DEBUG_STORAGE_KEY = 'artifact-debug-ai';
const AI_DEBUG_ENABLED_VALUES = new Set(['1', 'true', 'ai', 'all']);
const ACCESS_ACTION_LABELS: Partial<Record<string, string>> = {
  anonymous: 'Create account',
  invalid_session: 'Sign in again',
};

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

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function jobIsActive(job: AiGenerationJob | null) {
  return job?.status === 'queued' || job?.status === 'running';
}

function jobIsTerminal(job: AiGenerationJob | null) {
  return Boolean(job && ['succeeded', 'failed', 'cancelled', 'expired'].includes(job.status));
}

function errorMessage(error: unknown) {
  if (error instanceof AiGenerationApiError) return apiErrorMessage(error);
  if (isFetchFailure(error)) return 'AI API is not reachable. Start the local API server and try again.';
  if (error instanceof Error) return error.message;
  return 'Generation failed.';
}

function apiErrorMessage(error: AiGenerationApiError) {
  if (error.status === 404) return 'AI API route is unavailable. Start the API server and try again.';
  return error.message;
}

function isFetchFailure(error: unknown) {
  return error instanceof TypeError ? error.message === 'Failed to fetch' : false;
}

function disabledReasonMessage(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  return aiAccessReasonMessage(reason);
}

function disabledReasonTitle(reason: AiGenerationAccessState['disabledReason'] | string | null | undefined) {
  return aiAccessReasonTitle(reason);
}

function firstDefined<T>(...values: Array<T | undefined>) {
  return values.find((value): value is T => value !== undefined);
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
    assetId: jobAssetId(job),
    createdAt: jobCreatedAt(job),
    updatedAt: firstDefined(job.completedAt, new Date().toISOString()),
    errorCode: jobErrorCode(job),
    errorMessage,
  };
}

function jobAssetId(job: AiGenerationJob) {
  return job.asset?.id;
}

function jobCreatedAt(job: AiGenerationJob) {
  return firstDefined(job.completedAt, job.asset?.createdAt, job.createdAt);
}

function jobErrorCode(job: AiGenerationJob) {
  return job.error?.code;
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

function aiDebugValueIsEnabled(value: string | boolean | undefined | null) {
  if (value === true) return true;
  return typeof value === 'string' ? AI_DEBUG_ENABLED_VALUES.has(value) : false;
}

function aiDebugStorageValue() {
  try {
    return window.localStorage.getItem(AI_DEBUG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function aiDebugQueryValue() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') ?? params.get('aiDebug') ?? params.get('debugAi');
  } catch {
    return null;
  }
}

function aiGenerationDebugEnabled() {
  const env = (
    import.meta as unknown as {
      env?: Record<string, string | boolean | undefined>;
    }
  ).env;
  return (
    aiDebugValueIsEnabled(env?.VITE_AI_DEBUG) ||
    aiDebugValueIsEnabled(aiDebugQueryValue()) ||
    aiDebugValueIsEnabled(aiDebugStorageValue())
  );
}

function logAiPanelDebug(event: string, fields: Record<string, boolean | number | string | null | undefined> = {}) {
  if (!aiGenerationDebugEnabled()) return;
  const summary = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  console.debug(`[ai-generation] ${event}${summary ? ` ${summary}` : ''}`, fields);
}

function decodeBearerTokenClaims(token: string | undefined) {
  const encodedPayload = encodedBearerPayload(token);
  if (!encodedPayload) return null;
  return decodeBearerPayload(encodedPayload);
}

function encodedBearerPayload(token: string | undefined) {
  if (!token) return null;
  const parts = token.split('.');
  return parts.length >= 3 ? parts[1] : null;
}

function decodeBearerPayload(encodedPayload: string) {
  try {
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
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return debugArrayClaim(value);
}

function debugArrayClaim(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => debugClaim(item) ?? []).join(',') || null;
}

function logBearerTokenClaims(token: string | undefined) {
  if (!aiGenerationDebugEnabled()) return;
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

function shortId(id: string | undefined) {
  if (!id) return null;
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function yesNo(value: boolean | null | undefined) {
  if (value === undefined || value === null) return 'unknown';
  return value ? 'yes' : 'no';
}

function formatGenerationDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function hasGenerationPrompt(
  generation: ImageLayer['aiGeneration'],
): generation is NonNullable<ImageLayer['aiGeneration']> & { prompt: string } {
  return Boolean(generation?.prompt);
}

function provenanceLabel(label: string | null, state: ReturnType<typeof getAiGenerationUiState>) {
  if (!label) return 'Current image prompt';
  return state === 'done' ? 'Current image prompt' : label;
}

function GenerationFailedDetail({
  state,
  detail,
}: {
  state: ReturnType<typeof getAiGenerationUiState>;
  detail: string | null;
}) {
  if (state !== 'failed') return null;
  return detail ? <p>{detail}</p> : null;
}

function GenerationProvenance({ generation }: { generation: ImageLayer['aiGeneration'] }) {
  if (!hasGenerationPrompt(generation)) return null;
  const state = getAiGenerationUiState(generation);
  const label = getAiGenerationStatusLabel(generation);
  const detail = getAiGenerationStatusDetail(generation);
  return (
    <div className={`ai-generation-provenance ai-generation-provenance-${state}`}>
      <span>{provenanceLabel(label, state)}</span>
      <p>{generation.prompt}</p>
      <GenerationFailedDetail state={state} detail={detail} />
    </div>
  );
}

type DiagnosticRow = [string, string];

function diagnosticRow(label: string, value: string | null | undefined): DiagnosticRow | null {
  return value ? [label, value] : null;
}

function compactDiagnosticRows(rows: Array<DiagnosticRow | null>) {
  return rows.filter((row): row is DiagnosticRow => Boolean(row));
}

function formatProviderModel(provider: string | undefined, model: string | undefined) {
  if (!provider) return model;
  return model ? `${provider} / ${model}` : provider;
}

function generationDiagnosticRows(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return compactDiagnosticRows([
    diagnosticRow('status', generationStatus(generation, job)),
    diagnosticRow('job', shortId(generationJobId(generation, job))),
    diagnosticRow('asset', shortId(generationAssetId(generation, job))),
    diagnosticRow('error', generationErrorCode(generation, job)),
    diagnosticRow('provider', generationProviderModel(generation, job)),
    diagnosticRow('updated', formatGenerationDate(generationUpdatedAt(generation, job))),
  ]);
}

function generationStatus(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.status, job?.status);
}

function generationJobId(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.jobId, job?.id);
}

function generationAssetId(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.assetId, job?.asset?.id);
}

function generationErrorCode(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.errorCode, job?.error?.code);
}

function generationProviderModel(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return formatProviderModel(generationProvider(generation, job), generationModel(generation, job));
}

function generationProvider(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.provider, job?.provider);
}

function generationModel(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.model, job?.model);
}

function generationUpdatedAt(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(
    generationUpdatedAtValue(generation),
    jobCompletedAt(job),
    jobStartedAt(job),
    jobCreatedAtValue(job),
  );
}

function generationUpdatedAtValue(generation: ImageLayer['aiGeneration']) {
  return generation?.updatedAt;
}

function jobCompletedAt(job: AiGenerationJob | null) {
  return job?.completedAt;
}

function jobStartedAt(job: AiGenerationJob | null) {
  return job?.startedAt;
}

function jobCreatedAtValue(job: AiGenerationJob | null) {
  return job?.createdAt;
}

function GenerationDiagnostics({
  generation,
  job,
}: {
  generation: ImageLayer['aiGeneration'];
  job: AiGenerationJob | null;
}) {
  const rows = generationDiagnosticRows(generation, job);

  if (!rows.length) return null;

  return (
    <div className="ai-generation-diagnostics" aria-label="AI generation diagnostics">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <code>{value}</code>
        </div>
      ))}
    </div>
  );
}

type AccessCheckState = {
  state: 'idle' | 'checking' | 'success' | 'failed';
  checkedAt?: string;
  message?: string;
  hasBearerToken?: boolean;
};

function accessSummaryText(
  access: AiGenerationAccessState | null,
  accessError: string | null,
  accessCheck: AccessCheckState,
) {
  if (accessCheck.state === 'checking') return 'checking';
  if (!access) return accessFallbackSummary(accessError, accessCheck);
  return `${accessEnabledSummary(access)}${accessDisabledReasonSummary(access)}`;
}

function accessFallbackSummary(accessError: string | null, accessCheck: AccessCheckState) {
  return firstDefined(accessError, accessCheck.message, accessCheck.state);
}

function accessEnabledSummary(access: AiGenerationAccessState) {
  return `enabled=${yesNo(access.enabled)} authenticated=${yesNo(access.authenticated)}`;
}

function accessDisabledReasonSummary(access: AiGenerationAccessState) {
  return access.disabledReason ? ` reason=${access.disabledReason}` : '';
}

function authSummaryText({
  authConfigured,
  authLoaded,
  authSignedIn,
  authUserId,
}: {
  authConfigured: boolean;
  authLoaded: boolean;
  authSignedIn: boolean;
  authUserId: string | null;
}) {
  const user = authUserId ? ` user=${shortId(authUserId)}` : '';
  return `configured=${yesNo(authConfigured)} loaded=${yesNo(authLoaded)} signedIn=${yesNo(authSignedIn)}${user}`;
}

function quotaSummary(access: AiGenerationAccessState | null) {
  return access?.quota ? `${quotaAmountLabel(access.quota)} ${access.quota.period}` : null;
}

function quotaAmountLabel(quota: NonNullable<AiGenerationAccessState['quota']>) {
  return quota.limit === null ? `${quota.used} used` : `${quota.remaining}/${quota.limit}`;
}

function AiDeveloperDiagnostics({
  access,
  accessError,
  accessCheck,
  authConfigured,
  authLoaded,
  authSignedIn,
  authUserId,
  baseUrl,
  devToken,
  onRetryAccess,
}: {
  access: AiGenerationAccessState | null;
  accessError: string | null;
  accessCheck: AccessCheckState;
  authConfigured: boolean;
  authLoaded: boolean;
  authSignedIn: boolean;
  authUserId: string | null;
  baseUrl?: string;
  devToken?: string;
  onRetryAccess: () => void;
}) {
  const build = getAppBuildInfo();
  const providers = access?.providers?.join(', ');
  const rows = compactDiagnosticRows([
    diagnosticRow('version', `${build.version} sha:${build.shortCommitHash}`),
    diagnosticRow('api', baseUrl ?? 'same-origin'),
    diagnosticRow('auth', authSummaryText({ authConfigured, authLoaded, authSignedIn, authUserId })),
    diagnosticRow('token', `dev=${yesNo(Boolean(devToken))} bearer=${yesNo(accessCheck.hasBearerToken)}`),
    diagnosticRow('access', accessSummaryText(access, accessError, accessCheck)),
    diagnosticRow('providers', providers),
    diagnosticRow('quota', quotaSummary(access)),
  ]);

  return (
    <div className="ai-generation-dev-diagnostics" aria-label="AI developer diagnostics">
      <div className="ai-generation-dev-diagnostics-header">
        <span>AI diagnostics</span>
        <button type="button" onClick={onRetryAccess} disabled={accessCheck.state === 'checking'}>
          {accessCheck.state === 'checking' ? 'Checking' : 'Retry'}
        </button>
      </div>
      <div className="ai-generation-dev-diagnostics-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <code>{value}</code>
          </div>
        ))}
      </div>
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
  const state = generationHistoryNavigatorState(history, index);
  if (!state) return null;
  return (
    <div className="ai-generation-history-nav" aria-label="Generated image history">
      <GenerationHistoryButton
        direction="previous"
        nextIndex={state.currentIndex - 1}
        disabled={!onSelect || state.currentIndex <= 0}
        onSelect={onSelect}
      />
      <span className="ai-generation-history-count" title={state.title}>
        {state.currentIndex + 1}/{state.count}
      </span>
      <GenerationHistoryButton
        direction="next"
        nextIndex={state.currentIndex + 1}
        disabled={!onSelect || state.currentIndex >= state.count - 1}
        onSelect={onSelect}
      />
    </div>
  );
}

function generationHistoryNavigatorState(history: ImageLayer['aiGenerationHistory'], index: number | undefined) {
  const count = generationHistoryCount(history);
  if (count <= 1) return null;
  const currentIndex = generationHistoryCurrentIndex(index, count);
  return {
    count,
    currentIndex,
    title: generationHistoryTitle(historyEntryAt(history, currentIndex)),
  };
}

function generationHistoryCount(history: ImageLayer['aiGenerationHistory']) {
  return history?.length ?? 0;
}

function generationHistoryCurrentIndex(index: number | undefined, count: number) {
  return Math.min(Math.max(index ?? count - 1, 0), count - 1);
}

function historyEntryAt(history: ImageLayer['aiGenerationHistory'], index: number) {
  return history?.[index];
}

function generationHistoryTitle(item: NonNullable<ImageLayer['aiGenerationHistory']>[number] | undefined) {
  return item?.aiGeneration.prompt ? `Image prompt: ${item.aiGeneration.prompt}` : 'Generated image history';
}

function GenerationHistoryButton({
  direction,
  nextIndex,
  disabled,
  onSelect,
}: {
  direction: 'previous' | 'next';
  nextIndex: number;
  disabled: boolean;
  onSelect?: (index: number) => void;
}) {
  return (
    <button
      type="button"
      className="ai-generation-history-button"
      onClick={() => onSelect?.(nextIndex)}
      disabled={disabled}
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} generated image`}
    >
      {direction === 'previous' ? '‹' : '›'}
    </button>
  );
}

function DeveloperDiagnosticsPanel({
  enabled,
  access,
  accessError,
  accessCheck,
  authConfigured,
  authLoaded,
  authSignedIn,
  authUserId,
  baseUrl,
  devToken,
  onRetryAccess,
}: {
  enabled: boolean;
  access: AiGenerationAccessState | null;
  accessError: string | null;
  accessCheck: AccessCheckState;
  authConfigured: boolean;
  authLoaded: boolean;
  authSignedIn: boolean;
  authUserId: string | null;
  baseUrl?: string;
  devToken?: string;
  onRetryAccess: () => void;
}) {
  if (!enabled) return null;
  return (
    <AiDeveloperDiagnostics
      access={access}
      accessError={accessError}
      accessCheck={accessCheck}
      authConfigured={authConfigured}
      authLoaded={authLoaded}
      authSignedIn={authSignedIn}
      authUserId={authUserId}
      baseUrl={baseUrl}
      devToken={devToken}
      onRetryAccess={onRetryAccess}
    />
  );
}

function GenerationContextPanels({
  generationHistory,
  generationHistoryIndex,
  onGenerationHistorySelect,
  generation,
  job,
}: Pick<
  AiGenerationPanelProps,
  'generationHistory' | 'generationHistoryIndex' | 'onGenerationHistorySelect' | 'generation'
> & {
  job: AiGenerationJob | null;
}) {
  return (
    <>
      <GenerationHistoryNavigator
        history={generationHistory}
        index={generationHistoryIndex}
        onSelect={onGenerationHistorySelect}
      />
      <GenerationProvenance generation={generation} />
      <GenerationDiagnostics generation={generation} job={job} />
    </>
  );
}

function AccessBanner({
  access,
  accessBlockReason,
  accessCheck,
  authSignedIn,
}: {
  access: AiGenerationAccessState | null;
  accessBlockReason: string | null | undefined;
  accessCheck: AccessCheckState;
  authSignedIn: boolean;
}) {
  return (
    <div className={accessBannerClassName(accessCheck)} role="status" id="ai-generation-status">
      <span>{accessBannerTitle(access, accessBlockReason, accessCheck)}</span>
      <p>{accessBannerBody(access, accessBlockReason, accessCheck, authSignedIn)}</p>
    </div>
  );
}

function accessBannerClassName(accessCheck: AccessCheckState) {
  return accessCheck.state === 'failed'
    ? 'ai-generation-access-banner ai-generation-access-banner--failed'
    : 'ai-generation-access-banner';
}

function accessBannerTitle(
  access: AiGenerationAccessState | null,
  accessBlockReason: string | null | undefined,
  accessCheck: AccessCheckState,
) {
  if (access) return disabledReasonTitle(accessBlockReason);
  return accessCheck.state === 'failed' ? 'AI API unavailable' : 'Checking AI access';
}

function accessBannerBody(
  access: AiGenerationAccessState | null,
  accessBlockReason: string | null | undefined,
  accessCheck: AccessCheckState,
  authSignedIn: boolean,
) {
  if (access) return aiAccessReasonBody(accessBlockReason, access);
  return accessCheck.state === 'failed'
    ? failedAccessCheckMessage(accessBlockReason, accessCheck.message)
    : checkingAccessMessage(authSignedIn);
}

function failedAccessCheckMessage(
  accessBlockReason: string | null | undefined,
  accessCheckMessage: string | null | undefined,
) {
  return firstDefined(accessBlockReason, accessCheckMessage) ?? 'AI access could not be checked. Try again.';
}

function checkingAccessMessage(authSignedIn: boolean) {
  return authSignedIn
    ? 'Signed in. Checking the AI API and account access.'
    : 'Generation controls will appear when this browser has AI access.';
}

function AccessActionButton({
  accessBlockReason,
  accessCheck,
  authConfigured,
  openSignIn,
  onRetryAccess,
}: {
  accessBlockReason: string | null | undefined;
  accessCheck: AccessCheckState;
  authConfigured: boolean;
  openSignIn: () => void;
  onRetryAccess: () => void;
}) {
  const action = accessActionModel(accessBlockReason, accessCheck, authConfigured);
  if (!action) return null;
  const onClick = action.kind === 'retry' ? onRetryAccess : openSignIn;
  return (
    <button type="button" className="ai-generation-access-action" onClick={onClick}>
      {action.label}
    </button>
  );
}

function accessActionModel(
  accessBlockReason: string | null | undefined,
  accessCheck: AccessCheckState,
  authConfigured: boolean,
): { kind: 'retry' | 'sign-in'; label: string } | null {
  if (accessCheck.state === 'failed') return { kind: 'retry', label: 'Retry access' };
  if (!authConfigured) return null;
  return accessReasonAction(accessBlockReason);
}

function accessReasonAction(reason: string | null | undefined): { kind: 'sign-in'; label: string } | null {
  const label = reason ? ACCESS_ACTION_LABELS[reason] : undefined;
  return label ? { kind: 'sign-in', label } : null;
}

function GenerationRecoveryActions({
  canRetryGeneration,
  canRecoverGeneration,
  onRetryGeneration,
  onRecoverGeneration,
}: {
  canRetryGeneration: boolean;
  canRecoverGeneration: boolean;
  onRetryGeneration: () => void;
  onRecoverGeneration: () => void;
}) {
  if (!hasGenerationRecoveryAction(canRetryGeneration, canRecoverGeneration)) return null;
  return (
    <div className="ai-generation-actions">
      <RetryGenerationButton enabled={canRetryGeneration} onRetryGeneration={onRetryGeneration} />
      <RecoverGenerationButton enabled={canRecoverGeneration} onRecoverGeneration={onRecoverGeneration} />
    </div>
  );
}

function hasGenerationRecoveryAction(canRetryGeneration: boolean, canRecoverGeneration: boolean) {
  return canRetryGeneration || canRecoverGeneration;
}

function RetryGenerationButton({ enabled, onRetryGeneration }: { enabled: boolean; onRetryGeneration: () => void }) {
  if (!enabled) return null;
  return (
    <Button size="compact" className="ai-generation-action" onClick={onRetryGeneration}>
      Retry Prompt
    </Button>
  );
}

function RecoverGenerationButton({
  enabled,
  onRecoverGeneration,
}: {
  enabled: boolean;
  onRecoverGeneration: () => void;
}) {
  if (!enabled) return null;
  return (
    <Button size="compact" className="ai-generation-action" onClick={onRecoverGeneration}>
      Recover Asset
    </Button>
  );
}

function GenerationControls({
  prompt,
  setPrompt,
  provider,
  setProvider,
  providers,
  quality,
  setQuality,
  accessEnabled,
  busy,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  provider: AiGenerationProvider;
  setProvider: (value: AiGenerationProvider) => void;
  providers: AiGenerationProvider[];
  quality: AiGenerationQuality;
  setQuality: (value: AiGenerationQuality) => void;
  accessEnabled: boolean;
  busy: boolean;
}) {
  return (
    <>
      <Field className="ai-generation-prompt-field" label="Prompt">
        <Textarea
          data-ai-generation-prompt
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the image to create"
          rows={3}
          disabled={!accessEnabled || busy}
          aria-describedby={!accessEnabled ? 'ai-generation-status' : undefined}
        />
      </Field>
      <div className="ai-generation-grid">
        <Field label="Provider">
          <NativeSelect value={provider} onChange={(event) => setProvider(event.target.value as AiGenerationProvider)}>
            {providers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Quality">
          <NativeSelect value={quality} onChange={(event) => setQuality(event.target.value as AiGenerationQuality)}>
            {QUALITY_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </>
  );
}

function GenerationSubmitButton({
  busy,
  job,
  submitLabel,
  canGenerate,
  onGenerate,
}: {
  busy: boolean;
  job: AiGenerationJob | null;
  submitLabel: string;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const loading = busy || jobIsActive(job);
  return (
    <Button
      className="ai-generation-submit"
      onClick={onGenerate}
      disabled={!canGenerate}
      loading={loading}
      variant="primary"
    >
      {submitLabel}
    </Button>
  );
}

function GenerationFeedback({
  busy,
  job,
  status,
}: {
  busy: boolean;
  job: AiGenerationJob | null;
  status: string | null;
}) {
  if (!status) return null;
  const loading = busy || jobIsActive(job);
  return (
    <InlineNotice className="ai-generation-feedback" variant={generationFeedbackVariant(job, loading)}>
      <span>{status}</span>
      {loading ? <ProgressIndicator label={status} /> : null}
    </InlineNotice>
  );
}

function generationFeedbackVariant(job: AiGenerationJob | null, loading: boolean) {
  if (job?.status === 'failed' || (!job && !loading)) return 'danger' as const;
  if (job?.status === 'succeeded') return 'success' as const;
  return 'info' as const;
}

function GenerationMeta({ access }: { access: AiGenerationAccessState | null }) {
  return (
    <div className="ai-generation-meta" id="ai-generation-status">
      <span>{aiAccessUsageLabel(access) ?? 'AI'}</span>
    </div>
  );
}

function availableAiProviders(access: AiGenerationAccessState | null): AiGenerationProvider[] {
  if (access?.providers?.length) return access.providers;
  return ['openai'];
}

function canSubmitGeneration(
  access: AiGenerationAccessState | null,
  prompt: string,
  busy: boolean,
  job: AiGenerationJob | null,
) {
  return aiAccessEnabled(access) && promptIsReady(prompt) && generationIsIdle(busy, job);
}

function aiAccessEnabled(access: AiGenerationAccessState | null) {
  return Boolean(access?.enabled);
}

function promptIsReady(prompt: string) {
  return Boolean(prompt.trim());
}

function generationIsIdle(busy: boolean, job: AiGenerationJob | null) {
  return !busy && !jobIsActive(job);
}

function activeJobState(job: AiGenerationJob | null) {
  if (!jobIsActive(job)) return { id: null, status: null };
  return { id: job.id, status: job.status };
}

function latestGenerationState(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return {
    prompt: latestGenerationPrompt(generation, job),
    jobId: latestGenerationJobId(generation, job),
    errorCode: latestGenerationErrorCode(generation, job),
    failed: hasFailedGeneration(generation, job),
  };
}

function latestGenerationPrompt(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.prompt, job?.prompt);
}

function latestGenerationJobId(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.jobId, job?.id);
}

function latestGenerationErrorCode(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return firstDefined(generation?.errorCode, job?.error?.code);
}

function hasFailedGeneration(generation: ImageLayer['aiGeneration'], job: AiGenerationJob | null) {
  return generationFailed(generation) || jobFailed(job) || Boolean(latestGenerationErrorCode(generation, job));
}

function generationFailed(generation: ImageLayer['aiGeneration']) {
  return generation?.status === 'failed';
}

function jobFailed(job: AiGenerationJob | null) {
  return job?.status === 'failed';
}

function canRetryGenerationState(
  access: AiGenerationAccessState | null,
  latest: ReturnType<typeof latestGenerationState>,
  busy: boolean,
  job: AiGenerationJob | null,
) {
  if (!aiAccessEnabled(access)) return false;
  return latestCanRetry(latest) && generationIsIdle(busy, job);
}

function latestCanRetry(latest: ReturnType<typeof latestGenerationState>) {
  return Boolean(latest.failed && latest.prompt);
}

function canRecoverGenerationState(
  access: AiGenerationAccessState | null,
  latest: ReturnType<typeof latestGenerationState>,
  busy: boolean,
  job: AiGenerationJob | null,
) {
  if (!aiAccessEnabled(access)) return false;
  return latestCanRecover(latest) && generationIsIdle(busy, job);
}

function latestCanRecover(latest: ReturnType<typeof latestGenerationState>) {
  return latest.errorCode === 'asset_import_failed' && Boolean(latest.jobId);
}

type AccessCheckRunnerArgs = {
  authConfigured: boolean;
  authLoaded: boolean;
  authSignedIn: boolean;
  authUserId: string | null;
  baseUrl?: string;
  devToken?: string;
  getBearerToken: () => Promise<string | undefined>;
  setAccess: Dispatch<SetStateAction<AiGenerationAccessState | null>>;
  setAccessError: Dispatch<SetStateAction<string | null>>;
  setAccessCheck: Dispatch<SetStateAction<AccessCheckState>>;
  setProvider: Dispatch<SetStateAction<AiGenerationProvider>>;
};

function runAccessCheck(args: AccessCheckRunnerArgs) {
  if (shouldWaitForAuthLoad(args)) return undefined;
  const controller = new AbortController();
  logAccessCheckStart(args);
  args
    .getBearerToken()
    .then((bearerToken) => handleAccessBearerToken(bearerToken, controller, args))
    .then((next) => handleAccessCheckSuccess(next, controller, args))
    .catch((error) => handleAccessCheckFailure(error, controller, args));
  return () => controller.abort();
}

function shouldWaitForAuthLoad({ authConfigured, authLoaded, devToken }: AccessCheckRunnerArgs) {
  return authConfigured && !authLoaded && !devToken;
}

function logAccessCheckStart({
  authConfigured,
  authLoaded,
  authSignedIn,
  authUserId,
  devToken,
  baseUrl,
}: AccessCheckRunnerArgs) {
  logAiPanelDebug('access_check.start', {
    authConfigured,
    authLoaded,
    authSignedIn,
    authUserId,
    hasDevToken: Boolean(devToken),
    baseUrl: baseUrl ?? null,
  });
}

function handleAccessBearerToken(
  bearerToken: string | undefined,
  controller: AbortController,
  args: AccessCheckRunnerArgs,
) {
  markAccessChecking(bearerToken, controller, args);
  logAiPanelDebug('access_check.token', {
    authSignedIn: args.authSignedIn,
    authUserId: args.authUserId,
    hasBearerToken: Boolean(bearerToken),
  });
  logBearerTokenClaims(bearerToken);
  return getAiGenerationAccess({
    baseUrl: args.baseUrl,
    bearerToken,
    signal: controller.signal,
  });
}

function markAccessChecking(
  bearerToken: string | undefined,
  controller: AbortController,
  { setAccessCheck }: AccessCheckRunnerArgs,
) {
  if (controller.signal.aborted) return;
  setAccessCheck({
    state: 'checking',
    checkedAt: new Date().toISOString(),
    message: 'Checking AI access.',
    hasBearerToken: Boolean(bearerToken),
  });
}

function handleAccessCheckSuccess(
  next: AiGenerationAccessState,
  controller: AbortController,
  { setAccess, setAccessError, setAccessCheck, setProvider }: AccessCheckRunnerArgs,
) {
  if (controller.signal.aborted) return;
  logAiPanelDebug('access_check.success', {
    authenticated: next.authenticated,
    enabled: next.enabled,
    disabledReason: next.disabledReason ?? null,
  });
  setAccess(next);
  setAccessError(null);
  setAccessCheck((current) => ({
    ...current,
    state: 'success',
    checkedAt: new Date().toISOString(),
    message: accessEnabledMessage(next),
  }));
  applyPreferredProvider(next, setProvider);
}

function accessEnabledMessage(next: AiGenerationAccessState) {
  return next.enabled ? 'AI access enabled.' : disabledReasonMessage(next.disabledReason);
}

function applyPreferredProvider(
  next: AiGenerationAccessState,
  setProvider: Dispatch<SetStateAction<AiGenerationProvider>>,
) {
  const provider = next.providers?.[0];
  if (provider) setProvider(provider);
}

function handleAccessCheckFailure(
  error: unknown,
  controller: AbortController,
  { setAccessError, setAccessCheck }: AccessCheckRunnerArgs,
) {
  if (controller.signal.aborted) return;
  const message = errorMessage(error);
  logAiPanelDebug('access_check.failed', { message });
  setAccessError(message);
  setAccessCheck((current) => ({
    ...current,
    state: 'failed',
    checkedAt: new Date().toISOString(),
    message,
  }));
}

type JobPollingRunnerArgs = {
  activeJobId: string | null;
  activeJobStatus: AiGenerationJob['status'] | null;
  baseUrl?: string;
  getBearerTokenRef: { current: () => Promise<string | undefined> };
  onGenerationStateChangeRef: {
    current: AiGenerationPanelProps['onGenerationStateChange'];
  };
  onJobTerminal: () => void;
  setJob: Dispatch<SetStateAction<AiGenerationJob | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
};

type JobPollingState = {
  stopped: boolean;
  timeout: number | undefined;
  controller: AbortController | null;
  retryCount: number;
};

function runJobPolling(args: JobPollingRunnerArgs) {
  if (!args.activeJobId || !args.activeJobStatus) return undefined;
  const state: JobPollingState = {
    stopped: false,
    timeout: undefined,
    controller: null,
    retryCount: 0,
  };
  logAiPanelDebug('job_poll.start', {
    jobId: args.activeJobId,
    status: args.activeJobStatus,
  });
  scheduleJobPoll(state, args);
  return () => stopJobPolling(state);
}

function scheduleJobPoll(state: JobPollingState, args: JobPollingRunnerArgs) {
  const retryDelay = Math.min(1500 * 2 ** Math.max(0, state.retryCount - 1), 10_000);
  state.timeout = window.setTimeout(() => pollActiveJob(state, args), retryDelay);
}

function pollActiveJob(state: JobPollingState, args: JobPollingRunnerArgs) {
  state.controller = new AbortController();
  args.getBearerTokenRef
    .current()
    .then((bearerToken) => fetchPolledJob(bearerToken, state, args))
    .then((nextJob) => handlePolledJob(nextJob, state, args))
    .catch((error) => handleJobPollError(error, state, args));
}

function fetchPolledJob(
  bearerToken: string | undefined,
  state: JobPollingState,
  { activeJobId, baseUrl }: JobPollingRunnerArgs,
) {
  return getAiGenerationJob(activeJobId as string, {
    baseUrl,
    bearerToken,
    signal: state.controller?.signal,
  });
}

function handlePolledJob(nextJob: AiGenerationJob, state: JobPollingState, args: JobPollingRunnerArgs) {
  if (state.stopped) return;
  state.retryCount = 0;
  logAiPanelDebug('job_poll.result', {
    jobId: nextJob.id,
    status: nextJob.status,
    hasAsset: jobHasAssetUri(nextJob),
  });
  args.onGenerationStateChangeRef.current?.(generationMetadataFromJob(nextJob));
  args.setJob(nextJob);
  if (jobIsTerminal(nextJob)) args.onJobTerminal();
  scheduleNextPollIfActive(nextJob, state, args);
}

function jobHasAssetUri(job: AiGenerationJob) {
  return Boolean(job.asset?.uri);
}

function scheduleNextPollIfActive(nextJob: AiGenerationJob, state: JobPollingState, args: JobPollingRunnerArgs) {
  if (jobIsActive(nextJob)) scheduleJobPoll(state, args);
}

function handleJobPollError(error: unknown, state: JobPollingState, args: JobPollingRunnerArgs) {
  if (state.stopped) return;
  if (state.controller?.signal.aborted) return;
  if (isRetryableAiPollingError(error)) {
    state.retryCount += 1;
    logAiPanelDebug('job_poll.retry', {
      jobId: args.activeJobId,
      attempt: state.retryCount,
    });
    scheduleJobPoll(state, args);
    return;
  }
  args.setMessage(errorMessage(error));
}

function stopJobPolling(state: JobPollingState) {
  state.stopped = true;
  if (state.timeout !== undefined) window.clearTimeout(state.timeout);
  state.controller?.abort();
}

type AssetImportRunnerArgs = {
  baseUrl?: string;
  getBearerToken: () => Promise<string | undefined>;
  importedJobIds: { current: Set<string> };
  job: AiGenerationJob | null;
  onGeneratedImageSourceRef: {
    current: AiGenerationPanelProps['onGeneratedImageSource'];
  };
  onGenerationStateChangeRef: {
    current: AiGenerationPanelProps['onGenerationStateChange'];
  };
  setBusy: Dispatch<SetStateAction<boolean>>;
  setJob: Dispatch<SetStateAction<AiGenerationJob | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  successMessage: string;
};

function runAssetImport(args: AssetImportRunnerArgs) {
  const job = args.job;
  if (!shouldImportGeneratedAsset(job, args.importedJobIds)) return undefined;
  markAssetImportStarted(job, args);
  const controller = new AbortController();
  args
    .getBearerToken()
    .then((bearerToken) => storeGeneratedAsset(job, bearerToken, controller, args))
    .then((src) => handleAssetImportSuccess(src, job, args))
    .catch((error) => handleAssetImportFailure(error, job, args))
    .finally(() => finishAssetImport(controller, args));
  return () => controller.abort();
}

function shouldImportGeneratedAsset(
  job: AiGenerationJob | null,
  importedJobIds: { current: Set<string> },
): job is AiGenerationJob {
  if (job?.status !== 'succeeded') return false;
  return !importedJobIds.current.has(job.id);
}

function markAssetImportStarted(job: AiGenerationJob, args: AssetImportRunnerArgs) {
  args.importedJobIds.current.add(job.id);
  args.setBusy(true);
  args.onGenerationStateChangeRef.current?.(generationMetadataFromJob(job, 'importing'));
  logAiPanelDebug('asset_import.start', {
    jobId: job.id,
    assetId: job.asset?.id ?? null,
    hasAssetUri: jobHasAssetUri(job),
  });
}

function storeGeneratedAsset(
  job: AiGenerationJob,
  bearerToken: string | undefined,
  controller: AbortController,
  { baseUrl }: AssetImportRunnerArgs,
) {
  return withTimeout(
    storeAiGeneratedAssetSource(job, {
      baseUrl,
      devToken: bearerToken,
      signal: controller.signal,
    }),
    ASSET_IMPORT_TIMEOUT_MS,
    () => new Error('Generated image import timed out.'),
  );
}

function handleAssetImportSuccess(src: string, job: AiGenerationJob, args: AssetImportRunnerArgs) {
  logAiPanelDebug('asset_import.success', { jobId: job.id });
  args.onGeneratedImageSourceRef.current(src, generationMetadataFromJob(job));
  args.setMessage(args.successMessage);
}

function handleAssetImportFailure(error: unknown, job: AiGenerationJob, args: AssetImportRunnerArgs) {
  args.importedJobIds.current.delete(job.id);
  const message = errorMessage(error);
  logAiPanelDebug('asset_import.failed', { jobId: job.id, message });
  args.onGenerationStateChangeRef.current?.(generationMetadataFromJob(job, 'failed', message));
  args.setJob(failedAssetImportJob(job, message));
  args.setMessage(message);
}

function failedAssetImportJob(job: AiGenerationJob, message: string): AiGenerationJob {
  return {
    ...job,
    status: 'failed',
    error: { code: 'asset_import_failed', message, retryable: true },
    completedAt: job.completedAt ?? new Date().toISOString(),
  };
}

function finishAssetImport(controller: AbortController, { setBusy }: AssetImportRunnerArgs) {
  controller.abort();
  setBusy(false);
}

type SubmitGenerationArgs = {
  access: AiGenerationAccessState | null;
  aspect: AspectRatio;
  baseUrl?: string;
  getBearerToken: () => Promise<string | undefined>;
  onGenerationStateChange?: AiGenerationPanelProps['onGenerationStateChange'];
  provider: AiGenerationProvider;
  quality: AiGenerationQuality;
  rawPrompt: string;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setJob: Dispatch<SetStateAction<AiGenerationJob | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
};

function submitAiGeneration(args: SubmitGenerationArgs) {
  const trimmed = args.rawPrompt.trim();
  if (!canStartGenerationSubmission(trimmed, args.access)) return;
  args.setBusy(true);
  args.setMessage(null);
  args
    .getBearerToken()
    .then((bearerToken) => createSubmittedGenerationJob(trimmed, bearerToken, args))
    .then((nextJob) => handleSubmitGenerationSuccess(nextJob, args))
    .catch((error) => handleSubmitGenerationFailure(error, trimmed, args))
    .finally(() => args.setBusy(false));
}

function canStartGenerationSubmission(prompt: string, access: AiGenerationAccessState | null) {
  return Boolean(prompt && access?.enabled);
}

function createSubmittedGenerationJob(
  prompt: string,
  bearerToken: string | undefined,
  { aspect, baseUrl, provider, quality }: SubmitGenerationArgs,
) {
  return createAiGenerationJob(
    {
      prompt,
      provider,
      settings: { aspect, quality },
      idempotencyKey: createIdempotencyKey(),
    },
    { baseUrl, bearerToken },
  );
}

function handleSubmitGenerationSuccess(
  nextJob: AiGenerationJob,
  { onGenerationStateChange, setJob }: SubmitGenerationArgs,
) {
  onGenerationStateChange?.(generationMetadataFromJob(nextJob));
  setJob(nextJob);
}

function handleSubmitGenerationFailure(error: unknown, prompt: string, args: SubmitGenerationArgs) {
  const message = errorMessage(error);
  args.onGenerationStateChange?.({
    prompt,
    provider: args.provider,
    quality: args.quality,
    status: 'failed',
    updatedAt: new Date().toISOString(),
    errorMessage: message,
  });
  args.setMessage(message);
}

type RecoverGenerationArgs = {
  access: AiGenerationAccessState | null;
  baseUrl?: string;
  getBearerToken: () => Promise<string | undefined>;
  importedJobIds: { current: Set<string> };
  jobId: string | undefined;
  onGenerationStateChange?: AiGenerationPanelProps['onGenerationStateChange'];
  setBusy: Dispatch<SetStateAction<boolean>>;
  setJob: Dispatch<SetStateAction<AiGenerationJob | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
};

function recoverAiGeneration(args: RecoverGenerationArgs) {
  const jobId = recoverableJobId(args);
  if (!jobId) return;
  let handedToImport = false;
  markRecoverGenerationStarted(jobId, args);
  args
    .getBearerToken()
    .then((bearerToken) => getAiGenerationJob(jobId, { baseUrl: args.baseUrl, bearerToken }))
    .then((nextJob) => {
      handedToImport = handleRecoverGenerationJob(nextJob, args);
    })
    .catch((error) => args.setMessage(errorMessage(error)))
    .finally(() => {
      if (!handedToImport) args.setBusy(false);
    });
}

function recoverableJobId({ access, jobId }: RecoverGenerationArgs) {
  if (!jobId) return null;
  return access?.enabled ? jobId : null;
}

function markRecoverGenerationStarted(jobId: string, { importedJobIds, setBusy, setMessage }: RecoverGenerationArgs) {
  setBusy(true);
  setMessage('Checking generated asset.');
  importedJobIds.current.delete(jobId);
}

function handleRecoverGenerationJob(nextJob: AiGenerationJob, args: RecoverGenerationArgs) {
  args.onGenerationStateChange?.(generationMetadataFromJob(nextJob));
  args.setJob(nextJob);
  if (nextJob.status !== 'succeeded') {
    args.setMessage(recoverGenerationStatusMessage(nextJob));
    return false;
  }
  args.setMessage('Recovering generated asset.');
  return true;
}

function recoverGenerationStatusMessage(nextJob: AiGenerationJob) {
  return nextJob.error?.message ?? `Generation job is ${nextJob.status}.`;
}

function panelDisabledReason(access: AiGenerationAccessState | null, accessError: string | null) {
  return accessError ?? disabledReasonMessage(access && !access.enabled ? access.disabledReason : null);
}

function panelStatus(job: AiGenerationJob | null, message: string | null, disabledReason: string | null) {
  return firstDefined(jobErrorMessage(job), message, jobStatusFallback(job, disabledReason));
}

function jobErrorMessage(job: AiGenerationJob | null) {
  return job?.error?.message;
}

function jobStatusFallback(job: AiGenerationJob | null, disabledReason: string | null) {
  return job ? job.status : disabledReason;
}

function panelAccessBlockReason(
  access: AiGenerationAccessState | null,
  accessError: string | null,
  authSignedIn: boolean,
) {
  const explicitReason = explicitAccessBlockReason(access, accessError);
  if (explicitReason !== undefined) return explicitReason;
  return fallbackAccessBlockReason(access, authSignedIn);
}

function explicitAccessBlockReason(access: AiGenerationAccessState | null, accessError: string | null) {
  if (accessError) return accessError;
  return aiAccessEnabled(access) ? null : undefined;
}

function fallbackAccessBlockReason(access: AiGenerationAccessState | null, authSignedIn: boolean) {
  return invalidSessionBlockReason(access, authSignedIn) ?? access?.disabledReason;
}

function invalidSessionBlockReason(access: AiGenerationAccessState | null, authSignedIn: boolean) {
  if (!authSignedIn) return null;
  return access?.authenticated === false ? 'invalid_session' : null;
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
  const [accessCheckNonce, setAccessCheckNonce] = useState(0);
  const [accessCheck, setAccessCheck] = useState<AccessCheckState>({
    state: 'checking',
  });
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
  const baseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const diagnosticsEnabled = useMemo(() => aiGenerationDebugEnabled(), []);
  const providers = availableAiProviders(access);
  const canGenerate = canSubmitGeneration(access, prompt, busy, job);
  const activeJob = activeJobState(job);
  const latestGeneration = latestGenerationState(generation, job);
  const canRetryGeneration = canRetryGenerationState(access, latestGeneration, busy, job);
  const canRecoverGeneration = canRecoverGenerationState(access, latestGeneration, busy, job);
  const getBearerToken = useCallback(async () => {
    if (devToken) return devToken;
    if (!authSignedIn) return undefined;
    return (await withTimeout(getAuthToken(), 8_000, tokenTimeoutError)) ?? undefined;
  }, [authSignedIn, devToken, getAuthToken]);
  const handleJobTerminal = useCallback(() => setAccessCheckNonce((current) => current + 1), []);

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
    return runAccessCheck({
      authConfigured,
      authLoaded,
      authSignedIn,
      authUserId,
      baseUrl,
      devToken,
      getBearerToken,
      setAccess,
      setAccessError,
      setAccessCheck,
      setProvider,
    });
  }, [accessCheckNonce, authConfigured, authLoaded, authSignedIn, authUserId, baseUrl, devToken, getBearerToken]);

  useEffect(() => {
    return runJobPolling({
      activeJobId: activeJob.id,
      activeJobStatus: activeJob.status,
      baseUrl,
      getBearerTokenRef,
      onJobTerminal: handleJobTerminal,
      onGenerationStateChangeRef,
      setJob,
      setMessage,
    });
  }, [activeJob.id, activeJob.status, baseUrl, handleJobTerminal]);

  useEffect(() => {
    return runAssetImport({
      baseUrl,
      getBearerToken,
      importedJobIds,
      job,
      onGeneratedImageSourceRef,
      onGenerationStateChangeRef,
      setBusy,
      setJob,
      setMessage,
      successMessage,
    });
  }, [baseUrl, getBearerToken, job, successMessage]);

  const submitGeneration = useCallback(
    (rawPrompt: string) => {
      submitAiGeneration({
        access,
        aspect,
        baseUrl,
        getBearerToken,
        onGenerationStateChange,
        provider,
        quality,
        rawPrompt,
        setBusy,
        setJob,
        setMessage,
      });
    },
    [access, aspect, baseUrl, getBearerToken, onGenerationStateChange, provider, quality],
  );

  const handleGenerate = useCallback(() => submitGeneration(prompt), [prompt, submitGeneration]);
  const handleRetryAccessCheck = useCallback(() => {
    setAccessCheck({
      state: 'checking',
      checkedAt: new Date().toISOString(),
      message: 'Checking AI access.',
    });
    setAccessCheckNonce((current) => current + 1);
  }, []);

  const handleRetryGeneration = useCallback(() => {
    if (!latestGeneration.prompt) return;
    setPrompt(latestGeneration.prompt);
    submitGeneration(latestGeneration.prompt);
  }, [latestGeneration.prompt, submitGeneration]);

  const handleRecoverGeneration = useCallback(() => {
    recoverAiGeneration({
      access,
      baseUrl,
      getBearerToken,
      importedJobIds,
      jobId: latestGeneration.jobId,
      onGenerationStateChange,
      setBusy,
      setJob,
      setMessage,
    });
  }, [access, baseUrl, getBearerToken, importedJobIds, latestGeneration.jobId, onGenerationStateChange]);

  const disabledReason = panelDisabledReason(access, accessError);
  const status = panelStatus(job, message, disabledReason);
  const accessBlockReason = panelAccessBlockReason(access, accessError, authSignedIn);

  if (!aiAccessEnabled(access)) {
    return (
      <div className="ai-generation-panel">
        <AccessBanner
          access={access}
          accessBlockReason={accessBlockReason}
          accessCheck={accessCheck}
          authSignedIn={authSignedIn}
        />
        <AccessActionButton
          accessBlockReason={accessBlockReason}
          accessCheck={accessCheck}
          authConfigured={authConfigured}
          openSignIn={openSignIn}
          onRetryAccess={handleRetryAccessCheck}
        />
        <DeveloperDiagnosticsPanel
          enabled={diagnosticsEnabled}
          access={access}
          accessError={accessError}
          accessCheck={accessCheck}
          authConfigured={authConfigured}
          authLoaded={authLoaded}
          authSignedIn={authSignedIn}
          authUserId={authUserId}
          baseUrl={baseUrl}
          devToken={devToken}
          onRetryAccess={handleRetryAccessCheck}
        />
        <GenerationContextPanels
          generationHistory={generationHistory}
          generationHistoryIndex={generationHistoryIndex}
          onGenerationHistorySelect={onGenerationHistorySelect}
          generation={generation}
          job={job}
        />
      </div>
    );
  }

  return (
    <div className="ai-generation-panel">
      <GenerationContextPanels
        generationHistory={generationHistory}
        generationHistoryIndex={generationHistoryIndex}
        onGenerationHistorySelect={onGenerationHistorySelect}
        generation={generation}
        job={job}
      />
      <DeveloperDiagnosticsPanel
        enabled={diagnosticsEnabled}
        access={access}
        accessError={accessError}
        accessCheck={accessCheck}
        authConfigured={authConfigured}
        authLoaded={authLoaded}
        authSignedIn={authSignedIn}
        authUserId={authUserId}
        baseUrl={baseUrl}
        devToken={devToken}
        onRetryAccess={handleRetryAccessCheck}
      />
      <GenerationRecoveryActions
        canRetryGeneration={canRetryGeneration}
        canRecoverGeneration={canRecoverGeneration}
        onRetryGeneration={handleRetryGeneration}
        onRecoverGeneration={handleRecoverGeneration}
      />
      <GenerationControls
        prompt={prompt}
        setPrompt={setPrompt}
        provider={provider}
        setProvider={setProvider}
        providers={providers}
        quality={quality}
        setQuality={setQuality}
        accessEnabled={Boolean(access?.enabled)}
        busy={busy}
      />
      <GenerationSubmitButton
        busy={busy}
        job={job}
        submitLabel={submitLabel}
        canGenerate={canGenerate}
        onGenerate={handleGenerate}
      />
      <GenerationFeedback busy={busy} job={job} status={status} />
      <GenerationMeta access={access} />
    </div>
  );
}
