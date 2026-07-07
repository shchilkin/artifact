const repoRoot = stripTrailingSlash(fileUrlPath(new URL('../../..', import.meta.url)));
const apiRoot = stripTrailingSlash(fileUrlPath(new URL('..', import.meta.url)));
const watchedDirs = [`${apiRoot}/src`, `${repoRoot}/packages/shared/src`];

let server: Deno.ChildProcess | null = null;
let restarting = false;
let shuttingDown = false;
let restartTimer: ReturnType<typeof setTimeout> | undefined;

console.log('[api:watch] Watching API and shared sources.');
await startServer();

const watcher = Deno.watchFs(watchedDirs, { recursive: true });
void watchForChanges();

Deno.addSignalListener('SIGINT', () => void shutdown(0));
Deno.addSignalListener('SIGTERM', () => void shutdown(0));

await new Promise(() => {
  // Keep the dev watcher alive while child processes and fs events are active.
});

async function watchForChanges() {
  try {
    for await (const event of watcher) {
      if (event.kind === 'access') continue;
      const changedPath = event.paths.find((path) => !path.endsWith('~'));
      if (!changedPath) continue;
      scheduleRestart(relativePath(changedPath));
    }
  } catch (error) {
    if (!shuttingDown) {
      console.error(`[api:watch] File watcher stopped: ${formatError(error)}`);
    }
  }
}

function scheduleRestart(reason: string) {
  if (shuttingDown) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    void restartServer(reason);
  }, 180);
}

async function restartServer(reason: string) {
  if (restarting || shuttingDown) return;
  restarting = true;
  console.log(`[api:watch] Change detected: ${reason}`);
  const built = await buildShared();
  if (!built) {
    console.error('[api:watch] Shared build failed. Keeping the current API process running.');
    restarting = false;
    return;
  }
  await stopServer();
  await startServer({ skipBuild: true });
  restarting = false;
}

async function buildShared() {
  const result = await new Deno.Command('npm', {
    args: ['--workspace', '@artifact/shared', 'run', 'build'],
    cwd: repoRoot,
    env: Deno.env.toObject(),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).output();
  return result.code === 0;
}

async function startServer({ skipBuild = false } = {}) {
  if (!skipBuild && !(await buildShared())) {
    console.error('[api:watch] Initial shared build failed. Waiting for changes.');
    return;
  }

  const child = new Deno.Command('npx', {
    args: ['tsx', 'src/server.ts'],
    cwd: apiRoot,
    env: Deno.env.toObject(),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn();
  server = child;

  child.status.then((status) => {
    if (server === child) server = null;
    if (!shuttingDown && !restarting) {
      console.error(
        `[api:watch] API process exited with ${status.signal ?? status.code}. Waiting for the next file change.`,
      );
    }
  });
}

async function stopServer() {
  if (!server) return;
  const current = server;
  current.kill('SIGTERM');
  const stopped = await Promise.race([current.status.then(() => true), delay(1_000).then(() => false)]);
  if (!stopped) current.kill('SIGKILL');
  if (server === current) server = null;
}

async function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  watcher.close();
  await stopServer();
  Deno.exit(code);
}

function relativePath(path: string) {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}

function stripTrailingSlash(path: string) {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

function fileUrlPath(url: URL) {
  return decodeURIComponent(url.pathname);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
