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
    // App chunks are kept below the default warning threshold. Three.js is
    // isolated as a vendor chunk and sits just over 500 kB minified.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-vendor',
              test: /node_modules[\\/]three[\\/]/,
              priority: 35,
            },
            {
              name: 'pixi-vendor',
              test: /node_modules[\\/](pixi\.js|@pixi)[\\/]/,
              priority: 30,
            },
            {
              name: 'flow-vendor',
              test: /node_modules[\\/](@xyflow|d3-)/,
              priority: 25,
            },
            {
              name: 'motion-vendor',
              test: /node_modules[\\/]framer-motion[\\/]/,
              priority: 20,
            },
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|@react-router)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@xyflow/react', '@xstate/react'],
  },
});
