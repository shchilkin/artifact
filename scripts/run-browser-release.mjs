import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const forwardedArgs = process.argv.slice(2);
const browserBuildEnv = {
  ...process.env,
  VITE_AI_API_BASE_URL: 'http://127.0.0.1:4173',
  VITE_AUTH_API_BASE_URL: '',
};

const releaseSegments = [
  {
    label: 'Chromium shader runtime',
    script: 'test:browser:chromium',
    args: ['ai-shader-refine.spec.ts', 'code-shader-runtime.spec.ts'],
    serverMode: 'dev',
  },
  {
    label: 'Chromium editor workflows',
    script: 'test:browser:chromium',
    args: ['generator.spec.ts'],
    serverMode: 'dev',
  },
  {
    label: 'Chromium storage, public surfaces, visual, and 3D',
    script: 'test:browser:chromium',
    args: ['projects-storage.spec.ts', 'v029-smoke.spec.ts', 'v030-visual.spec.ts', 'v036-3d-model-retro.spec.ts'],
    serverMode: 'dev',
  },
  { label: 'Firefox', script: 'test:browser:firefox', args: [], serverMode: 'dev' },
  {
    label: 'WebKit',
    script: 'test:browser:webkit',
    args: ['--grep-invert', 'showcase loads the project wall and opens a tile in the editor'],
    serverMode: 'dev',
  },
  {
    label: 'WebKit production navigation',
    script: 'test:browser',
    args: [
      '--project=webkit',
      'v029-smoke.spec.ts',
      '--grep',
      'showcase loads the project wall and opens a tile in the editor',
    ],
    serverMode: 'preview',
  },
  { label: 'Mobile Chromium and WebKit', script: 'test:browser:mobile', args: [], serverMode: 'dev' },
];

const segments = forwardedArgs.length
  ? [{ label: 'Focused browser release check', script: 'test:browser', args: forwardedArgs, serverMode: 'preview' }]
  : releaseSegments;

console.log('\n=== Production browser build ===\n');
const build = spawnSync(npm, ['run', 'build', '--workspace', '@artifact/web'], {
  cwd: process.cwd(),
  env: browserBuildEnv,
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

for (const segment of segments) {
  console.log(`\n=== ${segment.label} ===\n`);
  const result = spawnSync(npm, ['run', segment.script, '--', '--retries=1', ...segment.args], {
    cwd: process.cwd(),
    env: {
      ...browserBuildEnv,
      PLAYWRIGHT_REUSE_SERVER: '0',
      PLAYWRIGHT_WEB_SERVER_MODE: segment.serverMode,
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
