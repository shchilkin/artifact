// Serves the production web build (apps/web/build/client) with `vite preview` for measurement scripts:
// prerendered paths plus the SPA fallback, like the production host. A free port is chosen per run.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

const WEB = path.join(process.cwd(), 'apps/web');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Waits until the preview serves this build's SPA shell, not just any server on the port.
async function waitForBuild(origin, child, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`vite preview exited with code ${child.exitCode}`);
    try {
      const html = await (await fetch(`${origin}/app`)).text();
      if (html.includes('/assets/entry.client-')) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not serve the build at ${origin}`);
}

/** Runs `task(origin)` against a preview of the production build and always stops the server afterwards. */
export async function withPreviewServer(task) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    'npx',
    ['vite', 'preview', '--outDir', 'build/client', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: WEB, stdio: 'ignore', detached: true },
  );
  try {
    await waitForBuild(origin, server);
    return await task(origin);
  } finally {
    // npx starts vite as a child process; stop the whole group so no preview server is left running.
    process.kill(-server.pid, 'SIGTERM');
  }
}
