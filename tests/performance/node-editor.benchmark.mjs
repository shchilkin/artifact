import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PORT = Number(process.env.PERF_PORT ?? 4174);
const BASE_URL = process.env.PERF_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const OUTPUT_PATH =
  process.env.PERF_OUTPUT ??
  join(dirname(fileURLToPath(import.meta.url)), '../../test-results/performance/node-editor.json');
const VIEWPORT = { width: 1440, height: 960 };
const THUMBNAIL_MEASURE = 'artifact:thumbnail-render';

const EFFECTS = [
  ['bench-bloom', 'Bloom', 'bloom', { bloom: 38 }],
  ['bench-scanlines', 'Scanlines', 'scanlines', { scanlines: 24, scanlineWidth: 2 }],
  ['bench-grain', 'Grain', 'grain', { grain: 34 }],
  ['bench-mirror', 'Mirror', 'mirror', { mirror: 1 }],
  ['bench-rgb', 'RGB Split', 'rgbSplit', { rgbSplit: 8 }],
  ['bench-vignette', 'Vignette', 'vignette', { vignette: 46 }],
  ['bench-halftone', 'Halftone', 'halftone', { halftone: 16 }],
  ['bench-riso', 'Riso Shift', 'risoShift', { risoShift: 16, risoAngle: 22 }],
  ['bench-wave', 'Wave', 'wave', { waveAmt: 22, waveFreq: 7 }],
  ['bench-threshold', 'Threshold', 'threshold', { threshold: 22 }],
  ['bench-edge', 'Edge Detect', 'edgeDetect', { edgeDetect: 38 }],
  ['bench-fog', 'Fog', 'fog', { fog: 24, fogColor: '#9bb6ff' }],
  ['bench-speed', 'Speed Lines', 'speedLines', { speedLines: 35 }],
  ['bench-solarize', 'Solarize', 'solarize', { solarize: 45 }],
  ['bench-cyanotype', 'Cyanotype', 'cyanotype', { cyanotype: 45 }],
  ['bench-bleach', 'Bleach Bypass', 'bleachBypass', { bleachBypass: 45 }],
  ['bench-kaleidoscope', 'Kaleidoscope', 'kaleidoscope', { kaleidoscope: 28 }],
  ['bench-ripple', 'Ripple', 'ripple', { rippleAmt: 28, rippleFreq: 5 }],
];

const server = process.env.PERF_BASE_URL ? null : startServer();

try {
  if (!process.env.PERF_BASE_URL) await waitForServer(BASE_URL);
  const result = await runBenchmark();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nPerformance report written to ${OUTPUT_PATH}`);
} finally {
  if (server) server.kill('SIGTERM');
}

function startServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: join(dirname(fileURLToPath(import.meta.url)), '../..'),
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[perf-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[perf-server] ${chunk}`));
  return child;
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Dev server is still booting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runBenchmark() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'dark', reducedMotion: 'reduce' });
  const consoleIssues = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleIssues.push(message.text());
  });
  page.on('pageerror', (error) => consoleIssues.push(error.message));
  await page.addInitScript(performanceInitScript);

  const scenarios = [];
  const doc = makeBenchmarkDocument();
  const startedAt = new Date().toISOString();
  await page.addInitScript((benchmarkDoc) => {
    localStorage.setItem('doc', JSON.stringify(benchmarkDoc));
  }, doc);

  await page.evaluate(() => window.__artifactPerf?.reset());
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle' });
  await switchToNodeView(page);
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 20, null, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1_500);
  scenarios.push(await readScenarioMetrics(page, 'initial-node-load'));

  scenarios.push(
    await measureScenario(page, 'drag-visible-effect-node', async () => {
      await dragNodeHeader(page, 'bench-rgb', 220, 40);
    }),
  );

  scenarios.push(
    await measureScenario(page, 'change-effect-slider', async () => {
      await page.locator('[data-node-id="bench-scanlines"] .node-shell-frame').click();
      await page.locator('.node-props-panel-open input[type="range"]').first().waitFor({ timeout: 10_000 });
      const slider = page.locator('.node-props-panel-open input[type="range"]').first();
      for (const value of [8, 16, 24, 32, 40, 28]) {
        await slider.evaluate((input, nextValue) => {
          input.value = String(nextValue);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        await page.waitForTimeout(60);
      }
    }),
  );

  scenarios.push(
    await measureScenario(page, 'pan-large-node-graph', async () => {
      const viewport = page.locator('.react-flow__pane').first();
      const box = await viewport.boundingBox();
      if (!box) throw new Error('React Flow pane is not visible');
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
      await page.mouse.down();
      for (let i = 0; i < 24; i += 1) {
        await page.mouse.move(box.x + box.width * 0.55 - i * 10, box.y + box.height * 0.55 - i * 3);
      }
      await page.mouse.up();
    }),
  );

  const nodeCount = await page.locator('.react-flow__node').count();
  await browser.close();

  return {
    name: 'node-editor-performance',
    startedAt,
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    document: {
      layers: doc.layers.length,
      graphEdges: doc.graph.edges.length,
      renderedNodes: nodeCount,
    },
    budgets: {
      preferredMaxLongTaskCountPerInteraction: 2,
      preferredP95FrameMs: 50,
      preferredMaxFrameMs: 100,
    },
    scenarios,
    consoleIssues,
  };
}

async function measureScenario(page, name, action) {
  await page.evaluate(() => window.__artifactPerf?.reset());
  await page.evaluate(() => window.__artifactPerf?.startFrames());
  const startedAt = await page.evaluate(() => performance.now());
  await action();
  await page.waitForTimeout(500);
  const durationMs = (await page.evaluate(() => performance.now())) - startedAt;
  return readScenarioMetrics(page, name, durationMs);
}

async function readScenarioMetrics(page, name, durationOverride) {
  return page.evaluate(
    ({ scenarioName, durationMs, thumbnailMeasure }) => {
      const perf = window.__artifactPerf;
      perf?.stopFrames();
      const frameDeltas = perf?.frameDeltas ?? [];
      const longTasks = perf?.longTasks ?? [];
      const thumbnailDurations = performance
        .getEntriesByName(thumbnailMeasure)
        .map((entry) => entry.duration)
        .filter((duration) => duration > 0);

      return {
        name: scenarioName,
        durationMs: round(durationMs ?? perf?.elapsedMs() ?? 0),
        frames: summarize(frameDeltas),
        longTasks: {
          count: longTasks.length,
          totalMs: round(longTasks.reduce((total, task) => total + task.duration, 0)),
          maxMs: round(Math.max(0, ...longTasks.map((task) => task.duration))),
        },
        thumbnails: summarize(thumbnailDurations),
      };

      function summarize(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const total = sorted.reduce((sum, value) => sum + value, 0);
        return {
          count: sorted.length,
          totalMs: round(total),
          avgMs: round(sorted.length ? total / sorted.length : 0),
          p95Ms: round(percentile(sorted, 0.95)),
          maxMs: round(sorted.at(-1) ?? 0),
        };
      }

      function percentile(sorted, p) {
        if (!sorted.length) return 0;
        return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
      }

      function round(value) {
        return Math.round(value * 10) / 10;
      }
    },
    { scenarioName: name, durationMs: durationOverride, thumbnailMeasure: THUMBNAIL_MEASURE },
  );
}

async function switchToNodeView(page) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await page.locator('.node-canvas-root').isVisible()) return;
    const nodeButtons = page.getByRole('button', { name: /^nodes$/i });
    const count = await nodeButtons.count();
    for (let index = 0; index < count; index += 1) {
      const button = nodeButtons.nth(index);
      if (!(await button.isVisible())) continue;
      await button.click();
      try {
        await page.locator('.node-canvas-root').waitFor({ timeout: 2_000 });
        return;
      } catch {
        // Vite can reload once after dependency optimization; retry against the fresh page.
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Could not find a visible nodes view toggle');
}

async function dragNodeHeader(page, nodeId, deltaX, deltaY) {
  const header = page.locator(`[data-node-id="${nodeId}"] .node-shell-header`).first();
  await header.waitFor({ timeout: 10_000 });
  const box = await header.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} header is not visible`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) {
    await page.mouse.move(startX + (deltaX * i) / 24, startY + (deltaY * i) / 24);
  }
  await page.mouse.up();
}

function makeBenchmarkDocument() {
  const fill = layer('bench-fill', 'Backdrop', 'fill', { color: '#07050b' });
  const text = layer('bench-title', 'Title', 'text', {
    content: 'PERF',
    font: 'DISPLAY',
    size: 110,
    color: '#f8f1e8',
    x: 0.5,
    y: 0.78,
    align: 'center',
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  });
  const effects = EFFECTS.map(([id, name, preset, props]) => layer(id, name, 'effect', { preset, ...props }));
  const layers = [fill, ...effects.slice(0, 11), text, ...effects.slice(11)];
  const edges = [];
  for (let i = 0; i < layers.length - 1; i += 1) {
    const target = layers[i + 1];
    edges.push({
      id: `e-${layers[i].id}-${layers[i + 1].id}`,
      fromId: layers[i].id,
      fromPort: 'out',
      toId: target.id,
      toPort: target.kind === 'effect' ? 'in' : 'bg',
    });
  }
  edges.push({
    id: `e-${layers.at(-1).id}-export`,
    fromId: layers.at(-1).id,
    fromPort: 'out',
    toId: '__export__',
    toPort: 'in',
  });

  const positions = Object.fromEntries(
    layers.map((item, index) => {
      const row = Math.floor(index / 10);
      const col = index % 10;
      return [item.id, { x: col * 470, y: 80 + row * 460 }];
    }),
  );
  positions.__export__ = { x: 10 * 470, y: 80 + Math.floor(layers.length / 10) * 460 };

  return {
    schemaVersion: 1,
    global: { bg: 'transparent', seed: 4242, aspect: '1:1' },
    layers,
    graph: {
      edges,
      positions,
      mergeNodes: [],
      colorNodes: [],
    },
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function layer(id, name, kind, patch) {
  return {
    id,
    name,
    kind,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    ...patch,
  };
}

function performanceInitScript() {
  const perf = {
    longTasks: [],
    frameDeltas: [],
    frameRequest: 0,
    frameLast: 0,
    startedAt: performance.now(),
    reset() {
      this.longTasks = [];
      this.frameDeltas = [];
      this.startedAt = performance.now();
      performance.clearMeasures('artifact:thumbnail-render');
    },
    startFrames() {
      this.stopFrames();
      this.frameDeltas = [];
      this.frameLast = performance.now();
      const tick = (now) => {
        this.frameDeltas.push(now - this.frameLast);
        this.frameLast = now;
        this.frameRequest = requestAnimationFrame(tick);
      };
      this.frameRequest = requestAnimationFrame(tick);
    },
    stopFrames() {
      if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
    },
    elapsedMs() {
      return performance.now() - this.startedAt;
    },
  };
  window.__artifactPerf = perf;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perf.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // Long Task API is Chromium-only; other browsers still report frame and thumbnail metrics.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
