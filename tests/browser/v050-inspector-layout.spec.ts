import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  expectStoredLayerField,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
  textLayerFixture,
} from './helpers';

// v0.50 U4: the inspector renders one layout for the same target in Layers and Nodes, every slider has numeric
// entry, and sliders and section toggles have accessible names.
const inspectorDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'u4-fill', name: 'Backdrop', color: '#2255cc' }),
  textLayerFixture({ id: 'u4-title', name: 'Title', content: 'U4' }),
  {
    id: 'u4-scanlines',
    name: 'Scanlines',
    kind: 'effect',
    preset: 'scanlines',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    scanlines: 24,
    scanlineWidth: 2,
  },
]);

const TARGETS = ['u4-fill', 'u4-title', 'u4-scanlines'];

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

const layerInspector = (page: Page) => page.getByRole('complementary', { name: 'Layer settings' });
const nodeInspector = (page: Page) => page.locator('.node-props-panel-open');

async function selectLayer(page: Page, id: string): Promise<Locator> {
  await page.locator(`.layer-row[data-layer-id="${id}"] .layer-row-name-button`).click();
  const inspector = layerInspector(page);
  await expect(inspector.locator('[data-inspector-section="true"]').first()).toBeVisible();
  return inspector;
}

async function selectNode(page: Page, id: string): Promise<Locator> {
  await page.locator(`.react-flow__node[data-id="${id}"]`).click();
  const inspector = nodeInspector(page);
  await expect(inspector.locator('[data-inspector-section="true"]').first()).toBeVisible();
  return inspector;
}

type InspectorLayout = {
  sections: Array<{ title: string; open: boolean }>;
  rows: Array<{ label: string; control: string; row: number; input: number; entry: number | null }>;
};

/** Section order and every visible control row with its size; the same target must produce the same layout. */
function readInspectorLayout(inspector: Locator): Promise<InspectorLayout> {
  return inspector.evaluate((root) => {
    const width = (element: Element | null) =>
      element ? Math.round(element.getBoundingClientRect().width * 10) / 10 : null;
    const sections = Array.from(root.querySelectorAll('[data-inspector-section="true"]')).map((section) => ({
      title: section.querySelector('.artifact-inspector-section__title')?.textContent?.trim() ?? '',
      open: section.getAttribute('data-inspector-open') === 'true',
    }));
    const rows = Array.from(
      root.querySelectorAll('[data-inspector-property-row="true"], [data-inspector-field="true"]'),
    ).map((row) => {
      const input = row.querySelector('input, select, textarea');
      return {
        label: row.querySelector('label')?.textContent?.trim() ?? '',
        control: input?.getAttribute('type') ?? input?.tagName.toLowerCase() ?? '',
        row: width(row) ?? 0,
        input: width(input) ?? 0,
        entry: width(row.querySelector('input[type="number"]')),
      };
    });
    return { sections, rows };
  });
}

test('the same target renders the same control layout in Layers and Nodes', async ({ page }) => {
  await gotoDocument(page, inspectorDocument);

  const layersLayouts: InspectorLayout[] = [];
  for (const id of TARGETS) layersLayouts.push(await readInspectorLayout(await selectLayer(page, id)));

  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  for (const [index, id] of TARGETS.entries()) {
    const nodes = await readInspectorLayout(await selectNode(page, id));
    expect(nodes, `${id} in Nodes`).toEqual(layersLayouts[index]);
  }

  await switchToLayerView(page);
  for (const [index, id] of TARGETS.entries()) {
    const back = await readInspectorLayout(await selectLayer(page, id));
    expect(back, `${id} in Layers after Nodes`).toEqual(layersLayouts[index]);
  }

  // Label, slider, and numeric entry share one row; primary controls come before the shared layer section.
  const effect = layersLayouts[2];
  expect(effect.sections.map((section) => section.title)).toEqual(['Texture', 'Node', 'Layer']);
  const slider = await layerInspector(page).getByRole('slider', { name: 'Scanlines', exact: true }).boundingBox();
  const label = await layerInspector(page)
    .locator('label', { hasText: /^Scanlines$/ })
    .boundingBox();
  const entry = await layerInspector(page)
    .getByRole('spinbutton', { name: 'Scanlines value', exact: true })
    .boundingBox();
  if (!slider || !label || !entry) throw new Error('Scanlines row is not rendered');
  for (const box of [label, entry]) {
    expect(Math.abs(box.y + box.height / 2 - (slider.y + slider.height / 2))).toBeLessThan(4);
  }
  expect(label.x + label.width).toBeLessThanOrEqual(slider.x);
  expect(slider.x + slider.width).toBeLessThanOrEqual(entry.x);
});

test('every slider and section toggle has an accessible name in Layers and Nodes', async ({ page }) => {
  await gotoDocument(page, inspectorDocument);

  for (const id of TARGETS) await expectNamedInspectorControls(page, await selectLayer(page, id));

  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  for (const id of TARGETS) await expectNamedInspectorControls(page, await selectNode(page, id));
});

/** Opens every section by its accessible name and checks each slider and numeric entry by name. */
async function expectNamedInspectorControls(page: Page, inspector: Locator): Promise<void> {
  const titles = (await inspector.locator('.artifact-inspector-section__title').allTextContents()).map((title) =>
    title.trim(),
  );
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) {
    const toggle = inspector.getByRole('button', { name: title, exact: true });
    await expect(toggle).toHaveCount(1);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const section = inspector
      .locator('[data-inspector-section="true"]')
      .filter({ has: page.getByRole('button', { name: title, exact: true }) });
    const labels = (await section.locator('.artifact-inspector-slider label').allTextContents()).map((label) =>
      label.trim(),
    );
    await expect(section.getByRole('slider')).toHaveCount(labels.length);
    await expect(section.getByRole('spinbutton')).toHaveCount(labels.length);
    for (const label of labels) {
      expect(label).toMatch(/[A-Za-z]/);
      await expect(section.getByRole('slider', { name: label, exact: true })).toHaveCount(1);
      await expect(section.getByRole('spinbutton', { name: `${label} value`, exact: true })).toHaveCount(1);
    }
  }
}

test('numeric entry sets the same value as the slider and clamps out-of-range input', async ({ page }) => {
  await gotoDocument(page, inspectorDocument);
  const inspector = await selectLayer(page, 'u4-scanlines');
  const slider = inspector.getByRole('slider', { name: 'Scanlines', exact: true });
  const entry = inspector.getByRole('spinbutton', { name: 'Scanlines value', exact: true });
  const selector = { key: 'id', value: 'u4-scanlines' };

  await expect(slider).toHaveAttribute('aria-valuetext', '24%');
  await expect(entry).toHaveValue('24');

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expectStoredLayerField(page, selector, 'scanlines', 25);
  await expect(entry).toHaveValue('25');

  await entry.fill('40');
  await expect(slider).toHaveValue('40');
  await entry.press('Enter');
  await expectStoredLayerField(page, selector, 'scanlines', 40);

  const max = Number(await entry.getAttribute('max'));
  await entry.fill(String(max + 50));
  await expectStoredLayerField(page, selector, 'scanlines', 40);
  await entry.press('Enter');
  await expectStoredLayerField(page, selector, 'scanlines', max);
  await expect(entry).toHaveValue(String(max));

  await entry.fill('');
  await entry.blur();
  await expect(entry).toHaveValue(String(max));
  await expectStoredLayerField(page, selector, 'scanlines', max);
});
