import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

const prBrowserTestPattern = new RegExp(
  [
    'layer canvas survives switching to nodes and back',
    'node visual hierarchy marks selected nodes toolbar actions and graph areas',
    'node graph highlights the active output path and exposes output navigation',
    'default document can export from the browser',
    'dropped artifact files stage a confirmed import and save current work as recovery',
    'new blank canvas action confirms before replacing current work',
    'layer drag reorder uses the final drop row even after stale dragover state',
    'node add menu can drag an effect onto an edge and split it',
    'layer preview display preserves wide document aspect ratio',
    'node previews respect document aspect ratio',
    'image transform gestures stay local to the selected node',
    'public nav Open editor CTA starts a blank editor',
    'blank editor and shared primitive project surfaces open and close',
    'node gallery dialog opens with an accessible title',
    'v0\\.30',
    'v0\\.34 active project save updates the current project after edits',
    'v0\\.33 pwa assets are served for install and app shell support',
    'v0\\.36 3D model scene and retro effect graph renders and exports',
    'mobile ',
  ].join('|'),
);

export default defineConfig({
  ...baseConfig,
  grep: prBrowserTestPattern,
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],
});
