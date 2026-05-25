import { clerkJSScriptUrl } from '@clerk/react/internal';

function getClerkFrontendApi(publishableKey: string) {
  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) return null;
  const payload = publishableKey.split('_')[2];
  if (!payload) return null;

  try {
    const decoded = globalThis.atob(payload);
    if (!decoded.endsWith('$')) return null;
    const frontendApi = decoded.slice(0, -1);
    return frontendApi.includes('.') ? frontendApi : null;
  } catch {
    return null;
  }
}

export function getClerkBrowserScriptUrl(publishableKey: string) {
  if (!getClerkFrontendApi(publishableKey)) return null;

  try {
    const src = clerkJSScriptUrl({ publishableKey });
    const url = new URL(src);
    return url.hostname.includes('.') ? src : null;
  } catch {
    return null;
  }
}
