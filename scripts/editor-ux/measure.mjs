#!/usr/bin/env node
// Measures editor UX on the production web build: layout shift and frame movement per interaction, slider
// input-to-preview latency, and node-preview settle time, for each reference document on desktop and mobile.
//
//   node scripts/editor-ux/measure.mjs                              # print the measurement
//   node scripts/editor-ux/measure.mjs --out apps/web/build/editor-ux.json
//   node scripts/editor-ux/measure.mjs --samples 3                  # latency samples per document (default 5)
//
// Requires a web build first (`npm run ux:gate` builds). The build is served with `vite preview` and measured
// in Chromium with the service worker blocked and reduced motion on. See docs/editor-ux/editor-ux-baseline.md
// for what each metric means.

import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withPreviewServer } from '../preview-server.mjs';
import { REFERENCE_DOCUMENTS } from './documents.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const outPath = option('--out');
const samples = Number(option('--samples') ?? 5);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 375, height: 812, mobile: true },
];
const DRAG_STEPS = 20;
// Runs in the page before any app code. Records layout shifts, preview paints, node-thumbnail renders, and
// the browser timestamps of slider input.
function instrument() {
  const ux = {
    shifts: [],
    paints: [],
    thumbnails: [],
    inputs: [],
  };
  window.__editorUx = ux;
  const shiftObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) ux.shifts.push(entry.value);
  });
  shiftObserver.observe({ type: 'layout-shift', buffered: true });
  ux.takeShifts = () => {
    for (const entry of shiftObserver.takeRecords()) ux.shifts.push(entry.value);
    return ux.shifts.splice(0).reduce((sum, value) => sum + value, 0);
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'artifact:thumbnail-render') ux.thumbnails.push(entry.startTime + entry.duration);
    }
  }).observe({ type: 'measure' });
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(...drawArgs) {
    if (this.canvas?.closest?.('.artifact-canvas-preview__surface')) ux.paints.push(performance.now());
    return drawImage.apply(this, drawArgs);
  };
  // event.timeStamp is when the browser received the input, so it includes time spent waiting for the main thread.
  for (const type of ['keydown', 'pointermove', 'pointerdown']) {
    window.addEventListener(type, (event) => ux.inputs.push(event.timeStamp), { capture: true, passive: true });
  }
  ux.lastActivity = () => Math.max(0, ux.paints.at(-1) ?? 0, ux.thumbnails.at(-1) ?? 0);
  ux.busy = () => Boolean(document.querySelector('.canvas-wrapper [aria-busy="true"]'));
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const round = (value, digits = 1) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

/** Resolves once the preview and node thumbnails have been quiet for `quietMs`. */
async function waitForIdle(page, quietMs = 500) {
  await page.waitForFunction(
    (quiet) => !window.__editorUx.busy() && performance.now() - window.__editorUx.lastActivity() > quiet,
    quietMs,
    { timeout: 30_000, polling: 50 },
  );
}

async function openEditor(browser, origin, viewport, reference) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await context.addInitScript(instrument);
  if (reference.doc) {
    await context.addInitScript((doc) => localStorage.setItem('doc', JSON.stringify(doc)), reference.doc);
  }
  const page = await context.newPage();
  await page.route('**/api/ai/access', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, enabled: false, disabledReason: 'anonymous' }),
    }),
  );
  await page.goto(`${origin}/app`, { waitUntil: 'networkidle' });
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForFunction(() => window.__editorUx.paints.length > 0, null, { timeout: 30_000 });
  await waitForIdle(page, 1_000);
  return { context, page };
}

// Frame anchors: the preview surface and the visible command bar. An interaction should not move either.
const readAnchors = (page) =>
  page.evaluate(() => {
    const box = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect?.width ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    const bars = [...document.querySelectorAll('.editor-command-bar')];
    return {
      preview: box(document.querySelector('.artifact-canvas-preview__surface')),
      commandBar: box(bars.find((bar) => bar.getBoundingClientRect().width > 0)),
    };
  });

function frameMovePx(before, after) {
  let move = 0;
  for (const anchor of Object.keys(before)) {
    if (!before[anchor] || !after[anchor]) continue;
    for (const side of ['x', 'y', 'width', 'height']) {
      move = Math.max(move, Math.abs(before[anchor][side] - after[anchor][side]));
    }
  }
  return round(move);
}

async function measureInteraction(page, action) {
  await page.evaluate(() => window.__editorUx.takeShifts());
  const before = await readAnchors(page);
  await action();
  await page.waitForTimeout(700);
  const after = await readAnchors(page);
  const layoutShift = await page.evaluate(() => window.__editorUx.takeShifts());
  return { layoutShift: round(layoutShift, 3), frameMovePx: frameMovePx(before, after) };
}

const firstSliderWidth = (page) =>
  page.evaluate(() => {
    const slider = [...document.querySelectorAll('input[type="range"]')].find((input) => input.offsetParent);
    return slider ? slider.getBoundingClientRect().width : null;
  });

// Commands in the visible command bar that another element covers, and pairs of commands that overlap.
const readCommandBar = (page) =>
  page.evaluate(() => {
    const bar = [...document.querySelectorAll('.editor-command-bar')].find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    const buttons = [...(bar?.querySelectorAll('button') ?? [])]
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0);
    const name = (button) => button.getAttribute('aria-label') ?? button.textContent.trim();
    const obscured = buttons
      .filter(({ button, rect }) => {
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit !== button && !button.contains(hit);
      })
      .map(({ button }) => name(button));
    const overlapping = [];
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const [a, b] = [buttons[i].rect, buttons[j].rect];
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width > 1 && height > 1) overlapping.push(`${name(buttons[i].button)} / ${name(buttons[j].button)}`);
      }
    }
    return { obscured, overlapping };
  });

const readNodes = (page) =>
  page.evaluate(() => {
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((node) => node.getBoundingClientRect());
    const outside = nodes.filter(
      (rect) =>
        rect.left < pane.left - 1 ||
        rect.top < pane.top - 1 ||
        rect.right > pane.right + 1 ||
        rect.bottom > pane.bottom + 1,
    );
    return { total: nodes.length, outsideViewport: outside.length };
  });

const layerName = (page, layerId) => page.locator(`.layer-row[data-layer-id="${layerId}"] .layer-row-name-button`);
const nodesTab = (page) => page.getByRole('tab', { name: 'Switch to nodes view' });
const layersTab = (page) => page.getByRole('tab', { name: 'Switch to layers view' });

async function switchToNodes(page) {
  await nodesTab(page).click();
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 });
}

async function switchToLayers(page) {
  await layersTab(page).click();
  await page.locator('.artifact-canvas-preview__surface').waitFor({ timeout: 20_000 });
}

/** Layout pass: one run per viewport and document; these values do not depend on machine speed. */
async function measureLayout(browser, origin, viewport, reference) {
  const { context, page } = await openEditor(browser, origin, viewport, reference);
  const commandBar = await readCommandBar(page);
  const interactions = {};
  interactions['select-layer'] = await measureInteraction(page, () => layerName(page, reference.sliderLayerId).click());
  const sliderWidthLayers = await firstSliderWidth(page);
  interactions['switch-to-nodes'] = await measureInteraction(page, () => switchToNodes(page));
  const nodes = await readNodes(page);
  interactions['switch-to-layers'] = await measureInteraction(page, () => switchToLayers(page));
  const sliderWidthAfterNodes = await firstSliderWidth(page);
  interactions['open-add-library'] = await measureInteraction(page, async () => {
    await page.getByRole('button', { name: 'Add layer' }).click();
    await page.getByRole('combobox', { name: 'Search layers and effects' }).waitFor({ timeout: 10_000 });
  });
  await context.close();
  return {
    interactions,
    commandBar,
    nodes,
    inspector: {
      sliderWidthLayers: round(sliderWidthLayers),
      sliderWidthAfterNodes: round(sliderWidthAfterNodes),
      sliderWidthDeltaPx:
        sliderWidthLayers === null || sliderWidthAfterNodes === null
          ? null
          : round(Math.abs(sliderWidthLayers - sliderWidthAfterNodes)),
    },
  };
}

const resetTimeline = (page) =>
  page.evaluate(() => {
    const ux = window.__editorUx;
    ux.paints.length = 0;
    ux.thumbnails.length = 0;
    ux.inputs.length = 0;
  });

async function measureKeypress(page, slider) {
  await waitForIdle(page);
  await resetTimeline(page);
  await slider.press('ArrowRight');
  await page.waitForFunction(() => window.__editorUx.paints.length > 0, null, { timeout: 10_000 });
  return page.evaluate(() => window.__editorUx.paints[0] - window.__editorUx.inputs[0]);
}

async function measureDrag(page, slider) {
  await waitForIdle(page);
  const box = await slider.boundingBox();
  const fraction = await slider.evaluate((input) => (input.value - input.min) / (input.max - input.min));
  const y = box.y + box.height / 2;
  const startX = box.x + box.width * fraction;
  const stepPx = Math.min(3, (box.x + box.width - 4 - startX) / DRAG_STEPS);
  await page.mouse.move(startX, y);
  await resetTimeline(page);
  await page.mouse.down();
  const startedAt = await page.evaluate(() => performance.now());
  for (let step = 1; step <= DRAG_STEPS; step += 1) {
    await page.mouse.move(startX + stepPx * step, y);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  const endedAt = await page.evaluate(() => performance.now());
  await page.mouse.up();
  // A full second of quiet, so the full-quality pass that follows the draft frames is part of the settle time.
  await waitForIdle(page, 1_000);
  const { paints, inputs } = await page.evaluate(() => ({
    paints: window.__editorUx.paints,
    inputs: window.__editorUx.inputs,
  }));
  const lastInput = Math.max(...inputs.filter((time) => time <= endedAt));
  return {
    durationMs: endedAt - startedAt,
    settleMs: paints.length ? Math.max(...paints) - lastInput : null,
    paintsDuringDrag: paints.filter((time) => time <= endedAt).length,
  };
}

async function measureNodeEntry(page) {
  await waitForIdle(page);
  await resetTimeline(page);
  const startedAt = await page.evaluate(() => performance.now());
  await switchToNodes(page);
  await waitForIdle(page, 800);
  const thumbnails = await page.evaluate(() => window.__editorUx.thumbnails);
  return thumbnails.length ? Math.max(...thumbnails) - startedAt : null;
}

async function measureNodeSlider(page) {
  const slider = page.locator('.node-props-panel-open input[type="range"]').first();
  await slider.waitFor({ timeout: 10_000 });
  await waitForIdle(page, 800);
  await resetTimeline(page);
  await slider.press('ArrowRight');
  await page.waitForFunction(() => window.__editorUx.thumbnails.length > 0, null, { timeout: 10_000 });
  await waitForIdle(page, 800);
  return page.evaluate(() => Math.max(...window.__editorUx.thumbnails) - window.__editorUx.inputs[0]);
}

/** Latency pass: desktop only, one fresh page per sample; the reported value is the median. */
async function measureLatency(browser, origin, viewport, reference) {
  const runs = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const { context, page } = await openEditor(browser, origin, viewport, reference);
    await layerName(page, reference.sliderLayerId).click();
    const slider = page.locator('.layer-inspector-drawer input[type="range"]').first();
    await slider.waitFor({ timeout: 10_000 });
    await slider.focus();
    const inputToPreviewMs = await measureKeypress(page, slider);
    const drag = await measureDrag(page, slider);
    const nodeEntrySettleMs = await measureNodeEntry(page);
    const nodeSliderSettleMs = await measureNodeSlider(page);
    runs.push({ inputToPreviewMs, ...drag, nodeEntrySettleMs, nodeSliderSettleMs });
    await context.close();
  }
  const pick = (key) => runs.map((run) => run[key]);
  const medianOf = (key) => (pick(key).includes(null) ? null : round(median(pick(key))));
  return {
    samples,
    'slider-keypress': { inputToPreviewMs: medianOf('inputToPreviewMs') },
    'slider-drag': {
      steps: DRAG_STEPS,
      durationMs: medianOf('durationMs'),
      settleMs: medianOf('settleMs'),
      paintsDuringDrag: median(pick('paintsDuringDrag')),
    },
    'node-preview': {
      entrySettleMs: medianOf('nodeEntrySettleMs'),
      sliderSettleMs: medianOf('nodeSliderSettleMs'),
    },
    runs: runs.map((run) => Object.fromEntries(Object.entries(run).map(([key, value]) => [key, round(value)]))),
  };
}

/** Flat `viewport/document/subject/metric` keys: the form the contract budgets and exceptions refer to. */
function flatten(results) {
  const metrics = {};
  for (const [viewport, documents] of Object.entries(results)) {
    for (const [document, result] of Object.entries(documents)) {
      const prefix = `${viewport}/${document}`;
      for (const [interaction, values] of Object.entries(result.layout.interactions)) {
        metrics[`${prefix}/${interaction}/layoutShift`] = values.layoutShift;
        metrics[`${prefix}/${interaction}/frameMovePx`] = values.frameMovePx;
      }
      metrics[`${prefix}/command-bar/obscuredCommands`] = result.layout.commandBar.obscured.length;
      metrics[`${prefix}/command-bar/overlappingCommands`] = result.layout.commandBar.overlapping.length;
      metrics[`${prefix}/inspector/sliderWidthDeltaPx`] = result.layout.inspector.sliderWidthDeltaPx;
      if (!result.latency) continue;
      metrics[`${prefix}/nodes-entry/nodesOutsideViewport`] = result.layout.nodes.outsideViewport;
      metrics[`${prefix}/slider-keypress/inputToPreviewMs`] = result.latency['slider-keypress'].inputToPreviewMs;
      metrics[`${prefix}/slider-drag/durationMs`] = result.latency['slider-drag'].durationMs;
      metrics[`${prefix}/slider-drag/settleMs`] = result.latency['slider-drag'].settleMs;
      metrics[`${prefix}/node-preview/entrySettleMs`] = result.latency['node-preview'].entrySettleMs;
      metrics[`${prefix}/node-preview/sliderSettleMs`] = result.latency['node-preview'].sliderSettleMs;
    }
  }
  return metrics;
}

async function measure(origin) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  environment.chromium = browser.version();
  const results = {};
  for (const viewport of VIEWPORTS) {
    results[viewport.name] = {};
    for (const reference of REFERENCE_DOCUMENTS) {
      const layout = await measureLayout(browser, origin, viewport, reference);
      const latency = viewport.mobile ? null : await measureLatency(browser, origin, viewport, reference);
      results[viewport.name][reference.name] = { layout, ...(latency ? { latency } : {}) };
    }
  }
  await browser.close();
  return results;
}

// Latency values depend on the machine; the environment says where a measurement was taken.
const environment = {
  ci: Boolean(process.env.CI),
  platform: `${process.platform}/${process.arch}`,
  cpus: os.cpus().length,
};
const results = await withPreviewServer(measure);
const result = {
  version: JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
  generatedBy: 'scripts/editor-ux/measure.mjs',
  environment,
  viewports: Object.fromEntries(VIEWPORTS.map(({ name, width, height }) => [name, { width, height }])),
  documents: REFERENCE_DOCUMENTS.map(({ name }) => name),
  metrics: flatten(results),
  details: results,
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (outPath) writeFileSync(path.resolve(ROOT, outPath), json);
else process.stdout.write(json);
