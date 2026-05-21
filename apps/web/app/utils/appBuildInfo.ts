declare const __ARTIFACT_APP_VERSION__: string;
declare const __ARTIFACT_COMMIT_HASH__: string;

let logged = false;

export function logAppBuildInfo() {
  if (logged || typeof window === 'undefined') return;
  logged = true;

  console.info(`[artifact] version ${__ARTIFACT_APP_VERSION__} (${__ARTIFACT_COMMIT_HASH__})`);
}
