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
    since: 0,
    shifts: [],
    paints: [],
    thumbnails: [],
    renders: [],
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
      // Render phases, kept for the keypress trace in the measurement details.
      if (/^artifact:(document-render|gpu-render|gpu-filter-extract|layer-render:)/.test(entry.name)) {
        ux.renders.push([entry.name.replace('artifact:', ''), entry.startTime, entry.duration]);
      }
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
  // Quiet is measured from the last reset at the earliest, so an interaction that has not produced its first paint or
  // thumbnail yet does not count as idle.
  ux.lastActivity = () => Math.max(ux.since, ux.paints.at(-1) ?? 0, ux.thumbnails.at(-1) ?? 0);
  ux.busy = () => Boolean(document.querySelector('.canvas-wrapper [aria-busy="true"]'));
}

// Fixed Canvas 2D workload that runs in a blank page. Its duration says how fast this machine is, independent
// of the app, so latency values can be compared between machines.
function calibrationWorkload() {
  const size = 540;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const scratch = document.createElement('canvas');
  scratch.width = size;
  scratch.height = size;
  const scratchContext = scratch.getContext('2d');
  const startedAt = performance.now();
  for (let pass = 0; pass < 6; pass += 1) {
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, `hsl(${pass * 40} 80% 50%)`);
    gradient.addColorStop(1, `hsl(${pass * 40 + 120} 80% 30%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    for (let blit = 0; blit < 12; blit += 1) {
      scratchContext.globalAlpha = 0.6;
      scratchContext.drawImage(canvas, blit, blit, size - blit * 2, size - blit * 2);
      context.drawImage(scratch, -blit, -blit, size + blit * 2, size + blit * 2);
    }
    const image = context.getImageData(0, 0, size, size);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
      pixels[index] = (pixels[index] + luminance) >> 1;
      pixels[index + 1] = (pixels[index + 1] * 3 + luminance) >> 2;
      pixels[index + 2] = 255 - pixels[index + 2];
    }
    context.putImageData(image, 0, 0);
  }
  return performance.now() - startedAt;
}

/**
 * The slider-drag loop against a bare range input in a blank page: the time the harness itself needs to deliver 20
 * steps, one per animation frame, with nothing else on the main thread. It depends on the platform's frame pacing,
 * not on CPU speed.
 */
async function measureDragFloor(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent('<input type="range" min="0" max="100" value="20" style="width: 600px; margin: 100px">');
  const box = await page.locator('input').boundingBox();
  const y = box.y + box.height / 2;
  const startX = box.x + box.width * 0.2;
  const runs = [];
  for (let run = 0; run < 6; run += 1) {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    const startedAt = await page.evaluate(() => performance.now());
    for (let step = 1; step <= DRAG_STEPS; step += 1) {
      await page.mouse.move(startX + step * 3, y);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    }
    runs.push((await page.evaluate(() => performance.now())) - startedAt);
    await page.mouse.up();
  }
  await page.close();
  return median(runs.slice(1));
}

/** Median duration of the calibration workload on this machine, after a warm-up run. */
async function calibrate(browser) {
  const page = await browser.newPage();
  await page.goto('about:blank');
  const runs = [];
  for (let run = 0; run < 8; run += 1) runs.push(await page.evaluate(calibrationWorkload));
  await page.close();
  return median(runs.slice(1));
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
    ux.since = performance.now();
    ux.paints.length = 0;
    ux.thumbnails.length = 0;
    ux.renders.length = 0;
    ux.inputs.length = 0;
  });

async function measureKeypress(page, slider) {
  await waitForIdle(page);
  await resetTimeline(page);
  await slider.press('ArrowRight');
  await page.waitForFunction(() => window.__editorUx.paints.length > 0, null, { timeout: 10_000 });
  return page.evaluate(() => {
    const ux = window.__editorUx;
    const [input] = ux.inputs;
    const [paint] = ux.paints;
    // Render phases that started before the first paint, as `name@start+duration` relative to the input.
    const trace = ux.renders
      .filter(([, start]) => start < paint)
      .map(([name, start, duration]) => `${name}@${Math.round(start - input)}+${Math.round(duration)}`);
    return { inputToPreviewMs: paint - input, trace };
  });
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
  await page.waitForFunction(() => window.__editorUx.thumbnails.length > 0, null, { timeout: 10_000 });
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
  const keypressTraces = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const { context, page } = await openEditor(browser, origin, viewport, reference);
    await layerName(page, reference.sliderLayerId).click();
    const slider = page.locator('.layer-inspector-drawer input[type="range"]').first();
    await slider.waitFor({ timeout: 10_000 });
    await slider.focus();
    const { inputToPreviewMs, trace: keypressTrace } = await measureKeypress(page, slider);
    const drag = await measureDrag(page, slider);
    const nodeEntrySettleMs = await measureNodeEntry(page);
    const nodeSliderSettleMs = await measureNodeSlider(page);
    runs.push({ inputToPreviewMs, ...drag, nodeEntrySettleMs, nodeSliderSettleMs });
    keypressTraces.push(keypressTrace);
    await context.close();
  }
  const pick = (key) => runs.map((run) => run[key]);
  const medianOf = (key) => (pick(key).includes(null) ? null : round(median(pick(key))));
  return {
    samples,
    'slider-keypress': { inputToPreviewMs: medianOf('inputToPreviewMs'), traces: keypressTraces },
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

/**
 * Flat `viewport/document/subject/metric` keys: the form the contract budgets and exceptions refer to. Latency
 * values are scaled by `speed` into reference-machine milliseconds; `details` keeps the raw values.
 */
function flatten(results, speed) {
  const metrics = {};
  const reference = (value) => (value === null ? null : round(value * speed));
  // The drag loop cannot run faster than the platform's frame pacing (environment.dragFloorMs). Only the time above
  // that floor depends on the app and the CPU, so only that part is scaled, on top of the reference floor.
  const dragReference = (value) =>
    value === null
      ? null
      : round(contract.calibration.dragFloorMs + Math.max(0, value - environment.dragFloorMs) * speed);
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
      metrics[`${prefix}/slider-keypress/inputToPreviewMs`] = reference(
        result.latency['slider-keypress'].inputToPreviewMs,
      );
      metrics[`${prefix}/slider-drag/durationMs`] = dragReference(result.latency['slider-drag'].durationMs);
      metrics[`${prefix}/slider-drag/settleMs`] = reference(result.latency['slider-drag'].settleMs);
      metrics[`${prefix}/node-preview/entrySettleMs`] = reference(result.latency['node-preview'].entrySettleMs);
      metrics[`${prefix}/node-preview/sliderSettleMs`] = reference(result.latency['node-preview'].sliderSettleMs);
    }
  }
  return metrics;
}

async function measure(origin) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  environment.chromium = browser.version();
  const calibrations = [await calibrate(browser)];
  environment.dragFloorMs = round(await measureDragFloor(browser));
  const results = {};
  for (const viewport of VIEWPORTS) {
    results[viewport.name] = {};
    for (const reference of REFERENCE_DOCUMENTS) {
      const layout = await measureLayout(browser, origin, viewport, reference);
      const latency = viewport.mobile ? null : await measureLatency(browser, origin, viewport, reference);
      results[viewport.name][reference.name] = { layout, ...(latency ? { latency } : {}) };
      if (latency) calibrations.push(await calibrate(browser));
    }
  }
  await browser.close();
  environment.calibrationMs = round(median(calibrations));
  environment.calibrationRuns = calibrations.map((value) => round(value));
  return results;
}

// Latency values depend on the machine; the environment says where a measurement was taken and how fast it was.
const environment = {
  ci: Boolean(process.env.CI),
  platform: `${process.platform}/${process.arch}`,
  cpus: os.cpus().length,
};
const contract = JSON.parse(readFileSync(path.join(ROOT, 'docs/editor-ux/editor-ux-contract.json'), 'utf8'));
const results = await withPreviewServer(measure);
// Reference-machine milliseconds = measured milliseconds x (reference calibration / this machine's calibration).
environment.speed = round(contract.calibration.referenceMs / environment.calibrationMs, 3);
const result = {
  version: JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
  generatedBy: 'scripts/editor-ux/measure.mjs',
  environment,
  viewports: Object.fromEntries(VIEWPORTS.map(({ name, width, height }) => [name, { width, height }])),
  documents: REFERENCE_DOCUMENTS.map(({ name }) => name),
  metrics: flatten(results, environment.speed),
  details: results,
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (outPath) writeFileSync(path.resolve(ROOT, outPath), json);
else process.stdout.write(json);
