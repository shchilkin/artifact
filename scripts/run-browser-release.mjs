import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const forwardedArgs = process.argv.slice(2);

const releaseSegments = [
  {
    label: 'Chromium shader runtime',
    script: 'test:browser:chromium',
    args: ['ai-shader-refine.spec.ts', 'code-shader-runtime.spec.ts'],
  },
  {
    label: 'Chromium editor workflows',
    script: 'test:browser:chromium',
    args: ['generator.spec.ts'],
  },
  {
    label: 'Chromium storage, public surfaces, visual, and 3D',
    script: 'test:browser:chromium',
    args: ['projects-storage.spec.ts', 'v029-smoke.spec.ts', 'v030-visual.spec.ts', 'v036-3d-model-retro.spec.ts'],
  },
  { label: 'Firefox', script: 'test:browser:firefox', args: [] },
  { label: 'WebKit', script: 'test:browser:webkit', args: [] },
  { label: 'Mobile Chromium and WebKit', script: 'test:browser:mobile', args: [] },
];

const segments = forwardedArgs.length
  ? [{ label: 'Focused browser release check', script: 'test:browser', args: forwardedArgs }]
  : releaseSegments;

for (const segment of segments) {
  console.log(`\n=== ${segment.label} ===\n`);
  const result = spawnSync(npm, ['run', segment.script, '--', '--retries=1', ...segment.args], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_REUSE_SERVER: '0' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
