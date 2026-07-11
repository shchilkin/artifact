const DEFAULT_API_PORT = 4000;
const DEFAULT_WEB_PORT = 5173;
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);
const LOCAL_SECRET = 'artifact-local-dev-secret-please-do-not-use-in-production';

const env = Deno.env.toObject();
const DEV_TOKEN = env.VITE_AI_API_DEV_TOKEN || env.API_DEV_BEARER_TOKEN || 'dev-token';
const args = parseArgs(Deno.args);
const apiPort = await findFreePort(args.apiPort ?? numberEnv('API_PORT', DEFAULT_API_PORT));
const webPort = await findFreePort(args.webPort ?? numberEnv('WEB_PORT', DEFAULT_WEB_PORT));
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const openAiApiKey = env.OPENAI_API_KEY || readOpenAiKeyFromMacKeychain();

const children = new Set<Deno.ChildProcess>();
let shuttingDown = false;

console.log('Artifact local AI dev');
console.log(`- API: ${apiBaseUrl}`);
console.log(`- Web: ${webOrigin}`);
console.log(`- Auth: dev-token (${DEV_TOKEN})`);
console.log('- Database/queue: memory');
console.log('- Watch: API, shared, and web sources');
console.log(`- OpenAI key: ${openAiApiKey ? 'detected' : 'not detected, local shader creation remains available'}`);
console.log('');

startProcess('api', ['--workspace', '@artifact/api', 'run', 'dev'], {
  ...env,
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
  OPENAI_SHADER_MODEL: env.OPENAI_SHADER_MODEL || 'gpt-5.5',
  ...(openAiApiKey ? { OPENAI_API_KEY: openAiApiKey } : {}),
});

try {
  await waitForHttp(`${apiBaseUrl}/api/health`, { label: 'API health' });
  await assertAiAccess(apiBaseUrl);
  await assertShaderRoute(apiBaseUrl);
} catch (error) {
  console.error('');
  console.error(`[local-ai] ${formatError(error)}`);
  await shutdown(1);
}

startProcess(
  'web',
  ['--workspace', '@artifact/web', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(webPort)],
  {
    ...env,
    VITE_AI_API_BASE_URL: apiBaseUrl,
    VITE_AUTH_API_BASE_URL: apiBaseUrl,
    VITE_AI_API_DEV_TOKEN: DEV_TOKEN,
  },
);

console.log('');
console.log(`Ready: open ${webOrigin}/app`);
console.log(`AI Shader uses ${openAiApiKey ? 'AI shader creation' : 'local shader creation only'}.`);
console.log('Press Ctrl+C to stop both dev servers.');

Deno.addSignalListener('SIGINT', () => void shutdown(0));
Deno.addSignalListener('SIGTERM', () => void shutdown(0));

await new Promise(() => {
  // Keep the launcher alive while the dev servers are running.
});

function startProcess(label: string, npmArgs: string[], processEnv: Record<string, string>) {
  const child = new Deno.Command('npm', {
    args: npmArgs,
    cwd: Deno.cwd(),
    env: processEnv,
    stdin: 'null',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();

  children.add(child);
  void prefixStream(label, child.stdout);
  void prefixStream(label, child.stderr);
  child.status.then((status) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[${label}] exited with ${status.signal ?? status.code}`);
      void shutdown(status.code || 1);
    }
  });
  return child;
}

async function prefixStream(label: string, stream: ReadableStream<Uint8Array>) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) console.log(`[${label}] ${line}`);
    }
  }
  if (pending.trim()) console.log(`[${label}] ${pending}`);
}

async function waitForHttp(url: string, { label, timeoutMs = 30_000 }: { label?: string; timeoutMs?: number } = {}) {
  const startedAt = Date.now();
  let lastResult = 'no response yet';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastResult = `HTTP ${response.status}`;
    } catch (error) {
      lastResult = formatError(error);
      // Keep polling while the dev server boots.
    }
    await delay(250);
  }
  throw new Error(`${label ?? url} did not become ready within ${timeoutMs / 1000}s. Last check: ${lastResult}`);
}

async function assertAiAccess(apiBaseUrl: string) {
  const response = await fetch(`${apiBaseUrl}/api/ai/access`, {
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.enabled) {
    throw new Error(`AI access check failed: ${JSON.stringify(body)}`);
  }
}

async function assertShaderRoute(apiBaseUrl: string) {
  const invalidPromptResponse = await fetch(`${apiBaseUrl}/api/ai/shaders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${DEV_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'x' }),
  });
  const invalidPromptBody = await invalidPromptResponse.json().catch(() => null);
  if (invalidPromptResponse.status === 404) {
    throw new Error('AI shader route is missing. Is the API running from the wrong checkout?');
  }
  if (invalidPromptResponse.status !== 400 || invalidPromptBody?.code !== 'invalid_prompt') {
    throw new Error(`AI shader route check failed: ${JSON.stringify(invalidPromptBody)}`);
  }

  const contractResponse = await fetch(`${apiBaseUrl}/api/ai/shaders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${DEV_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'soft water texture',
      mode: 'localFallback',
      idempotencyKey: 'local-ai-startup-contract-check',
    }),
  });
  const contractBody = await contractResponse.json().catch(() => null);
  if (contractResponse.status !== 400 || contractBody?.code !== 'invalid_fallback_reference') {
    throw new Error(
      `AI shader route is running an unexpected response contract. Restart the API. Response: ${JSON.stringify(contractBody)}`,
    );
  }
}

async function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  await delay(1_200);
  for (const child of children) child.kill('SIGKILL');
  Deno.exit(code);
}

async function findFreePort(preferredPort: number) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (FETCH_BLOCKED_PORTS.has(port)) continue;
    if (await canListen(port)) {
      if (port !== preferredPort) {
        console.log(`[local-ai] Port ${preferredPort} is busy; using ${port}.`);
      }
      return port;
    }
  }
  throw new Error(`No free port found near ${preferredPort}.`);
}

function canListen(port: number) {
  try {
    const listener = Deno.listen({ port, hostname: '127.0.0.1' });
    listener.close();
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.PermissionDenied) {
      throw new Error('Deno needs --allow-net to find and use local dev ports.', { cause: error });
    }
    return false;
  }
}

function numberEnv(name: string, fallback: number) {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseArgs(values: string[]) {
  const result: { apiPort?: number; webPort?: number } = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--api-port') result.apiPort = Number(values[++index]);
    if (value === '--web-port') result.webPort = Number(values[++index]);
  }
  return result;
}

function readOpenAiKeyFromMacKeychain() {
  if (Deno.build.os !== 'darwin') return '';
  const result = new Deno.Command('security', {
    args: ['find-generic-password', '-s', 'OpenAI_API_Key', '-w'],
    stdin: 'null',
    stdout: 'piped',
    stderr: 'null',
  }).outputSync();
  return result.success ? new TextDecoder().decode(result.stdout).trim() : '';
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
