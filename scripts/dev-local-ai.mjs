#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_API_PORT = 4000;
const DEFAULT_WEB_PORT = 5173;
const DEV_TOKEN = process.env.VITE_AI_API_DEV_TOKEN || process.env.API_DEV_BEARER_TOKEN || 'dev-token';
const LOCAL_SECRET = 'artifact-local-dev-secret-please-do-not-use-in-production';

const args = parseArgs(process.argv.slice(2));
const apiPort = await findFreePort(args.apiPort ?? numberEnv('API_PORT', DEFAULT_API_PORT));
const webPort = await findFreePort(args.webPort ?? numberEnv('WEB_PORT', DEFAULT_WEB_PORT));
const apiBaseUrl = `http://localhost:${apiPort}`;
const webOrigin = `http://localhost:${webPort}`;
const openAiApiKey = process.env.OPENAI_API_KEY || readOpenAiKeyFromMacKeychain();

const children = new Set();
let shuttingDown = false;

console.log(`Artifact local AI dev`);
console.log(`- API: ${apiBaseUrl}`);
console.log(`- Web: ${webOrigin}`);
console.log(`- Auth: dev-token (${DEV_TOKEN})`);
console.log(`- Database/queue: memory`);
console.log(`- Watch: API, shared, and web sources`);
console.log(`- OpenAI key: ${openAiApiKey ? 'detected' : 'not detected, local shader creation remains available'}`);
console.log('');

const api = startProcess('api', ['--workspace', '@artifact/api', 'run', 'dev'], {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(apiPort),
  WEB_ORIGIN: webOrigin,
  WEB_ORIGINS: webOrigin,
  API_DATABASE_DRIVER: 'memory',
  API_QUEUE_DRIVER: 'memory',
  AUTH_JWT_SECRET: LOCAL_SECRET,
  BETTER_AUTH_SECRET: LOCAL_SECRET,
  BETTER_AUTH_URL: `${apiBaseUrl}/api/auth`,
  API_DEV_BEARER_TOKEN: DEV_TOKEN,
  API_BULL_BOARD_ENABLED: 'false',
  PASSWORD_RESET_LOG_URL: 'true',
  ASSET_STORAGE_DRIVER: 'local',
  ASSET_STORAGE_DIR: '../../.local/artifact-api-storage',
  OPENAI_SHADER_MODEL: process.env.OPENAI_SHADER_MODEL || 'gpt-5.5',
  ...(openAiApiKey ? { OPENAI_API_KEY: openAiApiKey } : {}),
});

try {
  await waitForHttp(`${apiBaseUrl}/api/health`, { label: 'API health' });
  await assertAiAccess(apiBaseUrl);
  await assertShaderRoute(apiBaseUrl);
} catch (error) {
  console.error('');
  console.error(`[local-ai] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
}

startProcess('web', ['--workspace', '@artifact/web', 'run', 'dev', '--', '--port', String(webPort)], {
  ...process.env,
  VITE_AI_API_BASE_URL: apiBaseUrl,
  VITE_AUTH_API_BASE_URL: apiBaseUrl,
  VITE_AI_API_DEV_TOKEN: DEV_TOKEN,
});

console.log('');
console.log(`Ready: open ${webOrigin}/app`);
console.log(`AI Shader uses ${openAiApiKey ? 'AI shader creation' : 'local shader creation only'}.`);
console.log('Press Ctrl+C to stop both dev servers.');

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

function startProcess(label, npmArgs, env) {
  const child = spawn('npm', npmArgs, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => prefixLines(label, chunk));
  child.stderr.on('data', (chunk) => prefixLines(label, chunk));
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[${label}] exited with ${signal ?? code}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function prefixLines(label, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line.trim()) console.log(`[${label}] ${line}`);
  }
}

async function waitForHttp(url, { label, timeoutMs = 30_000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Keep polling while the dev server boots.
    }
    await delay(250);
  }
  throw new Error(`${label ?? url} did not become ready within ${timeoutMs / 1000}s.`);
}

async function assertAiAccess(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/api/ai/access`, {
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.enabled) {
    throw new Error(`AI access check failed: ${JSON.stringify(body)}`);
  }
}

async function assertShaderRoute(apiBaseUrl) {
  const invalidPromptResponse = await fetch(`${apiBaseUrl}/api/ai/shader-spec`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${DEV_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'x' }),
  });
  const invalidPromptBody = await invalidPromptResponse.json().catch(() => null);
  if (invalidPromptResponse.status === 404)
    throw new Error('AI shader route is missing. Is the API running from the wrong checkout?');
  if (invalidPromptResponse.status !== 400 || invalidPromptBody?.code !== 'invalid_prompt') {
    throw new Error(`AI shader route check failed: ${JSON.stringify(invalidPromptBody)}`);
  }

  const contractResponse = await fetch(`${apiBaseUrl}/api/ai/shader-spec`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${DEV_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'soft water texture', mode: 'localFallback' }),
  });
  const contractBody = await contractResponse.json().catch(() => null);
  if (!contractResponse.ok || contractBody?.source !== 'localFallback' || !contractBody?.spec?.provenance?.source) {
    throw new Error(
      `AI shader route is running an old response contract. Restart the API. Response: ${JSON.stringify(contractBody)}`,
    );
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 1200).unref();
}

async function findFreePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await canListen(port)) {
      if (port !== preferredPort) console.log(`[local-ai] Port ${preferredPort} is busy; using ${port}.`);
      return port;
    }
  }
  throw new Error(`No free port found near ${preferredPort}.`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--api-port') result.apiPort = Number(values[++index]);
    if (value === '--web-port') result.webPort = Number(values[++index]);
  }
  return result;
}

function readOpenAiKeyFromMacKeychain() {
  if (process.platform !== 'darwin') return '';
  const result = spawnSync('security', ['find-generic-password', '-s', 'OpenAI_API_Key', '-w'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : '';
}
