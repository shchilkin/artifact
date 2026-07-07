#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = resolve(import.meta.dirname, '../../..');
const apiRoot = resolve(import.meta.dirname, '..');
const watchedDirs = [resolve(apiRoot, 'src'), resolve(repoRoot, 'packages/shared/src')];

let server = null;
let restarting = false;
let shuttingDown = false;
let restartTimer = null;

console.log('[api:watch] Watching API and shared sources.');
await startServer();

for (const dir of watchedDirs) {
  watch(dir, { recursive: true }, (_eventType, filename) => {
    if (!filename || filename.endsWith('~')) return;
    scheduleRestart(`${dir.replace(`${repoRoot}/`, '')}/${filename}`);
  });
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

function scheduleRestart(reason) {
  if (shuttingDown) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    void restartServer(reason);
  }, 180);
}

async function restartServer(reason) {
  if (restarting || shuttingDown) return;
  restarting = true;
  console.log(`[api:watch] Change detected: ${reason}`);
  const built = buildShared();
  if (!built) {
    console.error('[api:watch] Shared build failed. Keeping the current API process running.');
    restarting = false;
    return;
  }
  await stopServer();
  await startServer({ skipBuild: true });
  restarting = false;
}

function buildShared() {
  const result = spawnSync('npm', ['--workspace', '@artifact/shared', 'run', 'build'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  return result.status === 0;
}

async function startServer({ skipBuild = false } = {}) {
  if (!skipBuild && !buildShared()) {
    console.error('[api:watch] Initial shared build failed. Waiting for changes.');
    return;
  }

  server = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  });

  server.on('exit', (code, signal) => {
    server = null;
    if (!shuttingDown && !restarting) {
      console.error(`[api:watch] API process exited with ${signal ?? code}. Waiting for the next file change.`);
    }
  });
}

async function stopServer() {
  if (!server) return;
  const current = server;
  current.kill('SIGTERM');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!server || server !== current) return;
    await delay(50);
  }
  current.kill('SIGKILL');
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  await stopServer();
  process.exit(code);
}
