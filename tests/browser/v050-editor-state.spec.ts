import { expect, type Page, test } from '@playwright/test';
import {
  clickEditorControl,
  editorDocumentFixture,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  pressForwardTab,
  setupBrowserTestPage,
  switchToNodeView,
  textLayerFixture,
} from './helpers';

// v0.50 U5: replacing and destructive actions confirm in-app, rows show whether a layer reaches Output,
// row controls keep one accessible name, and Add Library opens as an opaque surface with one filter axis.
const stateDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'state-fill', name: 'Backdrop', color: '#2255cc' }),
  textLayerFixture({ id: 'state-title', name: 'Title', content: 'STATE' }),
]);

const graphDocument = {
  ...editorDocumentFixture([
    fillLayerFixture({ id: 'graph-fill', name: 'Connected fill', color: '#2255cc' }),
    textLayerFixture({ id: 'graph-title', name: 'Connected title', content: 'GRAPH' }),
    fillLayerFixture({ id: 'graph-loose', name: 'Loose fill', color: '#dd3322' }),
  ]),
  graph: {
    edges: [
      { id: 'e1', fromId: 'graph-fill', fromPort: 'out', toId: 'graph-title', toPort: 'bg' },
      { id: 'e2', fromId: 'graph-title', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'graph-fill': { x: 0, y: 0 },
      'graph-title': { x: 240, y: 0 },
      'graph-loose': { x: 0, y: 200 },
      __export__: { x: 480, y: 0 },
    },
    mergeNodes: [],
    colorNodes: [],
  },
};

/** WebKit moves focus between buttons with Alt+Tab, like Safari's Option+Tab. */
async function pressBackwardTab(page: Page) {
  const shortcut = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
  await page.keyboard.press(shortcut);
}

async function renameLayer(page: Page, layerId: string, name: string) {
  const row = page.locator(`.layer-row[data-layer-id="${layerId}"]`);
  await row.locator('.layer-row-name-button').dblclick();
  const input = row.getByRole('textbox');
  await input.fill(name);
  await input.press('Enter');
  await expect(row.locator('.layer-row-name-button')).toHaveText(name);
}

// setupBrowserTestPage fails any test that opens a native confirm, alert or prompt (see helpers.ts).
test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('New confirms in an accessible dialog that traps focus and cancels with Escape', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);

  const newProject = page.getByRole('button', { name: 'Create new project' }).first();
  await newProject.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('alertdialog', { name: 'Create a new project?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/recovery copy/);
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  const confirm = dialog.getByRole('button', { name: 'Create new project' });
  // The replacing action is never the initial focus.
  await expect(cancel).toBeFocused();

  await pressForwardTab(page);
  await expect(confirm).toBeFocused();
  await pressForwardTab(page);
  await expect(cancel).toBeFocused();
  await pressBackwardTab(page);
  await expect(confirm).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(newProject).toBeFocused();
  await expect(page.locator('.layer-row')).toHaveCount(2);

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create new project' }).click();
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
});

test('Randomize replaces an unedited shared document without asking', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);
  await page.getByRole('button', { name: 'Randomize document' }).first().click();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('Randomize asks first only when it would replace edited work', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);
  const randomize = page.getByRole('button', { name: 'Randomize document' }).first();
  const dialog = page.getByRole('alertdialog', { name: 'Replace with a random cover?' });

  await renameLayer(page, 'state-title', 'Edited title');
  await randomize.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toContainText('Edited title');

  await randomize.click();
  await dialog.getByRole('button', { name: 'Randomize' }).click();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(0);

  // A random document nobody edited is not work to lose.
  const layerIds = () =>
    page.locator('.layer-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-layer-id')));
  const idsBefore = await layerIds();
  await randomize.click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(layerIds).not.toEqual(idsBefore);
});

test('opening an artifact file confirms in the same dialog and returns focus on cancel', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);

  await page.evaluate((doc) => {
    const file = new File([JSON.stringify(doc)], 'state.artifact.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document
      .querySelector('main')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, graphDocument);

  const dialog = page.getByRole('alertdialog', { name: 'Open artifact file' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.layer-row[data-layer-id="graph-loose"]')).toHaveCount(0);
});

test('Layers rows show whether each layer reaches Output', async ({ page }) => {
  await gotoDocument(page, graphDocument);
  await expectLayerCanvasToHavePixels(page);

  const loose = page.locator('.layer-row[data-layer-id="graph-loose"]');
  await expect(loose).toHaveAttribute('data-layer-output', 'unreached');
  await expect(loose).toContainText('not in output');
  for (const id of ['graph-fill', 'graph-title']) {
    const row = page.locator(`.layer-row[data-layer-id="${id}"]`);
    await expect(row).toHaveAttribute('data-layer-output', 'reached');
    await expect(row).not.toContainText('not in output');
  }
});

test('a layer stack without a graph shows every row in Output', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expect(page.locator('.layer-row[data-layer-output="reached"]')).toHaveCount(2);
  await expect(page.locator('.layer-row[data-layer-output="unreached"]')).toHaveCount(0);
});

test('layer row controls keep one accessible name through selection', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  const row = page.locator('.layer-row[data-layer-id="state-title"]');
  const nameButton = row.locator('.layer-row-name-button');
  const more = row.getByRole('button', { name: 'Open actions for layer Title' });

  const describe = () =>
    nameButton.evaluate((element) => ({ name: element.textContent, title: element.getAttribute('title') }));
  const before = await describe();
  await nameButton.click();
  await expect(row).toHaveAttribute('class', /layer-row-selected/);
  expect(await describe()).toEqual(before);
  await expect(nameButton).toHaveAccessibleName('Title');
  await expect(more).toHaveAttribute('title', 'Open actions for layer Title');
  await expect(row.locator('.layer-row-actions')).not.toHaveAttribute('aria-label', /.+/);
});

test('Add Library opens opaque, without layout shift, and filters on one axis', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);

  await page.evaluate(() => {
    const shifts = { value: 0 };
    Object.defineProperty(window, '__addLibraryShift', { value: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        shifts.value += entry.value;
      }
    }).observe({ type: 'layout-shift' });
  });

  await page.getByRole('button', { name: 'Add layer' }).click();
  const surface = page.locator('.add-library-layer-menu');
  await expect(surface).toBeVisible();
  const look = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.fillStyle = style.backgroundColor;
    probe.fillRect(0, 0, 1, 1);
    return { opacity: style.opacity, animation: style.animationName, alpha: probe.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(look).toEqual({ opacity: '1', animation: 'none', alpha: 255 });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as unknown as { __addLibraryShift: { value: number } }).__addLibraryShift.value),
  ).toBeLessThanOrEqual(0.05);

  const filters = surface.getByRole('group', { name: 'Filter library' });
  await expect(filters.getByRole('button')).toHaveText(['All', 'Sources', 'Effects', 'Structure', 'Color', '3D']);
  await expect(surface.locator('.add-library-browse, .add-library-recipes')).toHaveCount(0);

  await filters.getByRole('button', { name: 'Effects' }).click();
  await expect(filters.getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-pressed', 'true');
  await expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  await expect(surface.locator('.add-library-row', { hasText: 'Pixelate' })).toBeVisible();
  await expect(surface.locator('.add-library-row-label', { hasText: /^Fill$/ })).toHaveCount(0);
});

test('node Add Library lists recipes as one more filter', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  const surface = page.locator('.add-library-node-menu');
  const filters = surface.getByRole('group', { name: 'Filter library' });
  await filters.getByRole('button', { name: 'Recipes' }).click();
  await expect(surface.getByRole('group', { name: 'Print Damage' })).toBeVisible();
  await expect(surface.getByRole('group', { name: 'Photo + Type' })).toBeVisible();
  const ids = await surface.locator('[role="option"]').evaluateAll((options) => options.map((option) => option.id));
  expect(new Set(ids).size).toBe(ids.length);
});

const effectDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'progress-base', name: 'Base plate', color: '#243b66' }),
  {
    id: 'progress-scanlines',
    name: 'Scanlines',
    kind: 'effect',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    preset: 'scanlines',
    scanlines: 24,
    scanlineWidth: 2,
  },
]);

test('preview progress shows while an edit renders and clears once the full-quality frame paints', async ({ page }) => {
  await gotoDocument(page, effectDocument);
  await expectLayerCanvasToHavePixels(page);
  const surface = page.locator('.artifact-canvas-preview__surface');
  const bar = page.locator('.preview-progress');
  await expect(surface).toHaveAttribute('data-preview-pending', 'false', { timeout: 15_000 });
  await expect(bar).toHaveCSS('opacity', '0');

  await page.locator('.layer-row[data-layer-id="progress-scanlines"] .layer-row-name-button').click();
  const slider = page.locator('.layer-inspector-drawer input[type="range"]').first();
  await expect(slider).toBeVisible();
  await expect(surface).toHaveAttribute('data-preview-pending', 'false', { timeout: 15_000 });

  // Sample the signal and the bar's rendered opacity every frame, plus any layout shift, while edits render.
  await page.evaluate(() => {
    const record = { samples: [] as Array<{ pending: string; opacity: number }>, shift: 0, running: true };
    Object.defineProperty(window, '__previewProgress', { value: record });
    const target = document.querySelector<HTMLElement>('.artifact-canvas-preview__surface')!;
    const indicator = document.querySelector<HTMLElement>('.preview-progress')!;
    const sample = () => {
      if (!record.running) return;
      record.samples.push({
        pending: target.dataset.previewPending ?? '',
        opacity: Number(getComputedStyle(indicator).opacity),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number }>) record.shift += entry.value;
    }).observe({ type: 'layout-shift' });
  });

  // Keep editing for longer than the indicator's show delay, so the bar has time to appear.
  await slider.focus();
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
  }
  await expect(surface).toHaveAttribute('data-preview-pending', 'true');
  await expect(bar).toHaveCSS('opacity', '1');

  await expect(surface).toHaveAttribute('data-preview-pending', 'false', { timeout: 15_000 });
  await expect(bar).toHaveCSS('opacity', '0');

  const record = await page.evaluate(() => {
    const progress = (
      window as unknown as {
        __previewProgress: { samples: Array<{ pending: string; opacity: number }>; shift: number; running: boolean };
      }
    ).__previewProgress;
    progress.running = false;
    return progress;
  });
  expect(record.samples.some((entry) => entry.pending === 'true' && entry.opacity === 1)).toBe(true);
  expect(record.shift).toBeLessThanOrEqual(0.05);
});

async function openProjectsPanel(page: Page) {
  await clickEditorControl(page.locator('.project-workspace-button').first());
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await expect(projects).toBeVisible({ timeout: 15_000 });
  return projects;
}

async function saveProject(page: Page, name: string) {
  const projects = await openProjectsPanel(page);
  await projects.getByLabel('Project name').fill(name);
  await projects.getByRole('button', { name: 'CREATE PROJECT' }).click();
  await expect(projects.getByRole('button', { name: `Load ${name}` })).toHaveCount(1, { timeout: 15_000 });
  await projects.getByRole('button', { name: 'Close projects' }).click();
  await expect(projects).toBeHidden();
}

test('opening a project over unsaved changes asks first', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);
  await saveProject(page, 'Keep state');
  await renameLayer(page, 'state-title', 'Unsaved title');

  const projects = await openProjectsPanel(page);
  await projects.getByRole('button', { name: 'Load Keep state' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Open Keep state?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/Unsaved changes/);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toContainText('Unsaved title');

  await projects.getByRole('button', { name: 'Load Keep state' }).click();
  await dialog.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.layer-row[data-layer-id="state-title"] .layer-row-name-button')).toHaveText('Title', {
    timeout: 15_000,
  });
});

test('deleting a project from the editor Projects panel confirms in-app', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await saveProject(page, 'Remove me');
  const projects = await openProjectsPanel(page);
  await projects.getByRole('button', { name: 'Delete Remove me' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete project?' });
  await expect(dialog).toContainText('Remove me will be removed from this browser.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(projects.getByRole('button', { name: 'Load Remove me' })).toHaveCount(1);

  await projects.getByRole('button', { name: 'Delete Remove me' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(projects.getByRole('button', { name: 'Load Remove me' })).toHaveCount(0);
});

test('opening a file when the recovery copy cannot be saved asks again before replacing work', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await expectLayerCanvasToHavePixels(page);
  // Recovery copies live in IndexedDB; make that write fail.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'drafts') throw new DOMException('Storage is full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.evaluate((doc) => {
    const file = new File([JSON.stringify(doc)], 'graph.artifact.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document
      .querySelector('main')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, graphDocument);

  const dialog = page.getByRole('alertdialog', { name: 'Open artifact file?' });
  await dialog.getByRole('button', { name: 'Open file' }).click();
  await expect(dialog).toHaveAccessibleDescription(/Could not save a recovery copy/);
  const openAnyway = dialog.getByRole('button', { name: 'Open anyway' });
  await expect(openAnyway).toBeVisible();
  await expect(page.locator('.layer-row[data-layer-id="graph-loose"]')).toHaveCount(0);
  await openAnyway.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.layer-row[data-layer-id="graph-loose"]')).toHaveCount(1, { timeout: 15_000 });
});

test('a restored autosave counts as the document as loaded', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await renameLayer(page, 'state-title', 'Autosaved title');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doc')?.includes('Autosaved title') ?? false))
    .toBe(true);

  await page.goto('/app');
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toContainText('Autosaved title', {
    timeout: 15_000,
  });
  const randomize = page.getByRole('button', { name: 'Randomize document' }).first();
  const dialog = page.getByRole('alertdialog', { name: 'Replace with a random cover?' });

  // Editing and undoing back to the loaded document leaves nothing to lose.
  await renameLayer(page, 'state-title', 'Edited again');
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toContainText('Autosaved title');
  await randomize.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(0);
});

test('a project opened from the Projects page counts as the document as loaded', async ({ page }) => {
  await gotoDocument(page, stateDocument);
  await saveProject(page, 'From projects page');
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });

  await page.goto('/projects');
  const localProjects = page.getByRole('region', { name: 'Local projects' });
  await localProjects.getByRole('button', { name: 'Load From projects page' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(1, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Randomize document' }).first().click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.layer-row[data-layer-id="state-title"]')).toHaveCount(0);
});

test('Nodes shows progress while node previews render and clears when they settle', async ({ page }) => {
  await gotoDocument(page, effectDocument);
  await expectLayerCanvasToHavePixels(page);

  // Record every change of the Nodes signal from the moment the bar mounts, plus any layout shift.
  await page.evaluate(() => {
    const record = { values: [] as string[], shifts: [] as Array<{ time: number; value: number }>, editFrom: 0 };
    Object.defineProperty(window, '__nodeProgress', { value: record });
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target as HTMLElement;
        if (target.classList?.contains('node-preview-progress'))
          record.values.push(target.dataset.previewPending ?? '');
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-preview-pending'] });
  });

  await switchToNodeView(page);
  const bar = page.locator('.node-preview-progress');
  await expect(bar).toHaveAttribute('data-preview-pending', 'false', { timeout: 20_000 });
  await expect(bar).toHaveCSS('opacity', '0');

  // Layout shift is summed per phase, including shifts that follow input (as in the editor UX baseline):
  // selecting a node opens the inspector, then the edit renders previews under the progress bar.
  await page.evaluate(() => {
    const record = (window as unknown as { __nodeProgress: { shifts: Array<{ time: number; value: number }> } })
      .__nodeProgress;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number }>)
        record.shifts.push({ time: entry.startTime, value: entry.value });
    }).observe({ type: 'layout-shift' });
  });
  // Two frames: the inspector takes its column in one layout step, then nothing moves.
  const settleFrames = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await page.locator('.react-flow__node[data-id="progress-scanlines"]').click();
  const slider = page.locator('.node-props-panel input[type="range"]').first();
  await expect(slider).toBeVisible();
  await settleFrames();

  // An edit re-renders the affected node previews, Output included.
  await page.evaluate(() => {
    (window as unknown as { __nodeProgress: { editFrom: number } }).__nodeProgress.editFrom = performance.now();
  });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(bar).toHaveAttribute('data-preview-pending', 'false', { timeout: 20_000 });
  await expect(bar).toHaveCSS('opacity', '0');
  await settleFrames();

  const record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __nodeProgress: { values: string[]; shifts: Array<{ time: number; value: number }>; editFrom: number };
        }
      ).__nodeProgress,
  );
  const sumShift = (shifts: Array<{ value: number }>) => shifts.reduce((total, shift) => total + shift.value, 0);
  expect(record.values.filter((value) => value === 'true').length).toBeGreaterThanOrEqual(2);
  expect(record.values.at(-1)).toBe('false');
  expect(sumShift(record.shifts.filter((shift) => shift.time < record.editFrom))).toBeLessThanOrEqual(0.05);
  expect(sumShift(record.shifts.filter((shift) => shift.time >= record.editFrom))).toBeLessThanOrEqual(0.05);
});
