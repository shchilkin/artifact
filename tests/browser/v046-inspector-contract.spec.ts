import { expect, test } from '@playwright/test';

import { INSPECTOR_SPECIMEN_IDS } from '../../apps/web/app/components/inspector-system/inspector-specimens';
import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage, switchToNodeView } from './helpers';

const runtimeInspectorDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 46, aspect: '1:1' },
  layers: [
    {
      id: 'v046-inspector-fill',
      name: 'Inspector fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#cc6644',
      opacity: 84,
      blendMode: 'normal',
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('inspector contract exposes ordinary and dense states with keyboard disclosure', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const specimens = page.getByLabel('Inspector layout specimens');
  const ordinary = specimens.locator(`[data-inspector-specimen="${INSPECTOR_SPECIMEN_IDS.ordinary}"]`);
  const dense = specimens.locator(`[data-inspector-specimen="${INSPECTOR_SPECIMEN_IDS.dense}"]`);

  await expect(specimens).toBeVisible({ timeout: 15_000 });
  await expect(ordinary).toBeVisible();
  await expect(dense).toBeVisible();
  await expect(ordinary.locator('[data-inspector-dirty="true"]')).toBeVisible();
  await expect(ordinary.locator('[data-inspector-validation="invalid"]')).toBeVisible();
  await expect(ordinary.locator('[data-inspector-disabled="true"] select')).toBeDisabled();
  await expect(dense.locator('[data-inspector-validation="validating"]')).toHaveAttribute('aria-busy', 'true');
  await expect(dense.locator('[data-inspector-locked="true"] select')).toBeEnabled();
  await expect(dense.locator('[data-inspector-loading="true"]').first()).toHaveAttribute('aria-busy', 'true');
  await expect(dense.getByText('Lock', { exact: true })).toBeVisible();
  await expect(dense.getByText('Checking', { exact: true })).toBeVisible();

  const denseTargets = await dense.locator('button, input, select').evaluateAll((elements) =>
    elements.map((element) => ({
      height: element.getBoundingClientRect().height,
      type: element.tagName.toLowerCase(),
    })),
  );
  for (const target of denseTargets) {
    expect(target.height, `${target.type} should keep a 44px target`).toBeGreaterThanOrEqual(44);
  }

  const disclosure = ordinary.getByRole('button', { name: /artwork identity/i });
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  expect(await disclosure.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Space');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

  const invalidInput = ordinary.getByLabel('Copies');
  await expect(invalidInput).toHaveAttribute('aria-invalid', 'true');
  await expect(invalidInput).toHaveAttribute('aria-errormessage', /-error$/);
});

test('inspector contract stacks inside a 390-pixel viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/style-guide');

  const specimens = page.getByLabel('Inspector layout specimens');
  await expect(specimens).toBeVisible({ timeout: 15_000 });

  const layout = await specimens.evaluate((element) => {
    const container = element.getBoundingClientRect();
    const children = Array.from(element.querySelectorAll<HTMLElement>('[data-inspector-specimen]')).map((child) => {
      const box = child.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width };
    });
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      container: { left: container.left, right: container.right },
      children,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.children).toHaveLength(Object.values(INSPECTOR_SPECIMEN_IDS).length);
  for (const child of layout.children) {
    expect(child.width).toBeGreaterThan(0);
    expect(child.left).toBeGreaterThanOrEqual(layout.container.left - 1);
    expect(child.right).toBeLessThanOrEqual(layout.container.right + 1);
  }
});

test('layer and node property surfaces consume the runtime inspector contract', async ({ page }) => {
  await gotoDocument(page, runtimeInspectorDocument);
  await page.locator('.layer-row').filter({ hasText: 'Inspector fill' }).click();

  const layerInspector = page.locator('.layer-inspector-drawer');
  const layerSection = layerInspector.locator('[data-inspector-section="true"]').first();
  await expect(layerSection).toBeVisible();
  await expect(layerInspector.locator('[data-inspector-property-row="true"]')).not.toHaveCount(0);
  await expect(layerInspector.locator('[data-inspector-field="true"]')).not.toHaveCount(0);

  const disclosure = layerSection.getByRole('button').first();
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await page.keyboard.press('Space');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

  await switchToNodeView(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Inspector fill' }).click();

  const nodeInspector = page.locator('.node-props-panel-open');
  await expect(nodeInspector).toBeVisible();
  await expect(nodeInspector.locator('[data-inspector-section="true"]')).not.toHaveCount(0);
  await expect(nodeInspector.locator('[data-inspector-property-row="true"]')).not.toHaveCount(0);
  await expect(nodeInspector.getByLabel('Toggle node delete lock')).toBeEnabled();
});
