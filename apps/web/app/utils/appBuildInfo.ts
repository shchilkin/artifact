declare const __ARTIFACT_APP_VERSION__: string;
declare const __ARTIFACT_COMMIT_HASH__: string;

let logged = false;

function displayVersion(version: string) {
  return version.startsWith('v') ? version : `v${version}`;
}

export function getAppBuildInfo() {
  const version = displayVersion(__ARTIFACT_APP_VERSION__);
  const commitHash = __ARTIFACT_COMMIT_HASH__;
  return {
    version,
    rawVersion: __ARTIFACT_APP_VERSION__,
    commitHash,
    shortCommitHash: commitHash.length > 12 ? commitHash.slice(0, 12) : commitHash,
    label: `Artifact ${version} sha:${commitHash}`,
  };
}

export function logAppBuildInfo() {
  if (logged || typeof window === 'undefined') return;
  logged = true;
  const build = getAppBuildInfo();

  console.info(
    '%c Artifact %c %s %c sha:%s ',
    'background:#f46f5e;color:#190906;font-weight:700;padding:2px 6px;border-radius:2px;',
    'background:#1f1714;color:#f0d9bd;padding:2px 6px;border:1px solid #5b3932;border-left:0;',
    build.version,
    'background:#120d0b;color:#d68a78;padding:2px 6px;border:1px solid #5b3932;border-left:0;',
    build.shortCommitHash,
  );
}
