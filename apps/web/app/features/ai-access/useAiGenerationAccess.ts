import { useCallback, useEffect, useMemo, useState } from 'react';
import { useArtifactAuth } from '../../hooks/useArtifactAuth';
import type { AiGenerationAccessState } from '../../types/aiGeneration';
import { AiGenerationApiError, getAiGenerationAccess } from '../../utils/aiGenerationClient';
import { getArtifactAiApiBaseUrl } from '../../utils/apiBaseUrl';

type AiAccessCheckState =
  | { key: string | null; status: 'checking'; access: null; error: null }
  | { key: string; status: 'ready'; access: AiGenerationAccessState; error: null }
  | { key: string; status: 'error'; access: null; error: string };

const TOKEN_TIMEOUT_MS = 8_000;

export function useAiGenerationAccess() {
  const { configured, loaded, signedIn, userId, getToken, openSignIn } = useArtifactAuth();
  const baseUrl = useMemo(() => getArtifactAiApiBaseUrl(), []);
  const devToken = useMemo(() => getAiApiDevToken(), []);
  const [revision, setRevision] = useState(0);
  const requestKey = `${configured}:${loaded}:${userId ?? 'anonymous'}:${revision}`;
  const [state, setState] = useState<AiAccessCheckState>({
    key: null,
    status: 'checking',
    access: null,
    error: null,
  });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const getBearerToken = useCallback(async () => {
    if (devToken) return devToken;
    if (!signedIn) return undefined;
    return (await withTimeout(getToken(), TOKEN_TIMEOUT_MS)) ?? undefined;
  }, [devToken, getToken, signedIn]);

  useEffect(() => {
    if (configured && !loaded && !devToken) return;
    const controller = new AbortController();
    getBearerToken()
      .then((bearerToken) => getAiGenerationAccess({ baseUrl, bearerToken, signal: controller.signal }))
      .then((access) => {
        if (!controller.signal.aborted) setState({ key: requestKey, status: 'ready', access, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, status: 'error', access: null, error: accessCheckError(error) });
        }
      });
    return () => controller.abort();
  }, [baseUrl, configured, devToken, getBearerToken, loaded, requestKey]);

  const currentState: AiAccessCheckState =
    state.key === requestKey ? state : { key: requestKey, status: 'checking', access: null, error: null };

  return {
    status: currentState.status,
    access: currentState.access,
    error: currentState.error,
    authConfigured: configured,
    openSignIn,
    getBearerToken,
    baseUrl,
    refresh,
  };
}

function getAiApiDevToken() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AI_API_DEV_TOKEN;
}

function accessCheckError(error: unknown) {
  if (error instanceof AiGenerationApiError) return error.message;
  if (error instanceof Error && error.message === 'AI access check timed out.') return error.message;
  return 'AI access could not be checked. Check your connection and try again.';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error('AI access check timed out.')), timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
