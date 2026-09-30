import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-plugin-tsconfig-paths';

function readGitValue(command: string, fallback: string) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : null;
  } catch {
    return null;
  }
}

const appVersion =
  process.env.VITE_APP_VERSION ??
  readPackageVersion() ??
  readGitValue('git describe --tags --always --dirty', 'local-development');
const appCommit =
  process.env.VITE_APP_COMMIT ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.GITHUB_SHA?.slice(0, 12) ??
  readGitValue('git rev-parse --short=12 HEAD', 'unknown');

export default defineConfig({
  envDir: '../..',
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  define: {
    __ARTIFACT_APP_VERSION__: JSON.stringify(appVersion),
    __ARTIFACT_COMMIT_HASH__: JSON.stringify(appCommit),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // No manual vendor groups: chunks follow the real import graph, so React Flow, PixiJS, and Three.js
    // load only with the surfaces that need them. The Three.js chunk still exceeds this limit, but it
    // loads only on 3D activation (see docs/loading/route-loading-matrix.md).
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    // Dependencies reached only through lazy imports are otherwise discovered mid-session, which makes
    // Vite reload the page in development.
    include: [
      '@xyflow/react',
      '@xstate/react',
      'better-auth/react',
      'clsx',
      'framer-motion',
      'pixi.js',
      'radix-ui',
      'tailwind-merge',
      'three',
      'xstate',
    ],
  },
});
