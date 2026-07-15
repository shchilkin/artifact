import { AI_API_PATHS, type AiProvider, type ApiHealthResponse, ARTIFACT_API_CONTRACT_VERSION } from '../contracts.js';
import { type JsonResponse, json } from '../http.js';

export interface HealthRouteDeps {
  buildSha: string;
  databaseDriver: ApiHealthResponse['databaseDriver'];
  queueDriver: ApiHealthResponse['queueDriver'];
  storageDriver: ApiHealthResponse['storageDriver'];
  providers: AiProvider[];
  bullBoardEnabled: boolean;
}

export function handleHealthRequest(
  request: { method?: string; url?: string },
  deps: HealthRouteDeps,
): JsonResponse<ApiHealthResponse> | null {
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;
  if (request.method !== 'GET' || pathname !== AI_API_PATHS.health) return null;

  return json(200, {
    ok: true,
    service: 'artifact-api',
    buildSha: deps.buildSha,
    contractVersion: ARTIFACT_API_CONTRACT_VERSION,
    databaseDriver: deps.databaseDriver,
    queueDriver: deps.queueDriver,
    storageDriver: deps.storageDriver,
    providers: deps.providers,
    bullBoardEnabled: deps.bullBoardEnabled,
  });
}
