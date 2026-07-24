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

const codeShaderInspectorDocument = {
  schemaVersion: 3,
  global: { bg: '#101018', seed: 146, aspect: '1:1' },
  layers: [
    {
      id: 'v046-code-source',
      name: 'Code source',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#4466aa',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [
      {
        id: 'v046-code-input',
        fromId: 'v046-code-source',
        fromPort: 'out',
        toId: 'v046-code-shader',
        toPort: 'bg',
      },
      {
        id: 'v046-code-output',
        fromId: 'v046-code-shader',
        fromPort: 'out',
        toId: '__export__',
        toPort: 'in',
      },
    ],
    positions: {
      'v046-code-source': { x: 0, y: 100 },
      'v046-code-shader': { x: 420, y: 100 },
      __export__: { x: 860, y: 100 },
    },
    mergeNodes: [],
    colorNodes: [],
    shaderNodes: [
      {
        id: 'v046-code-shader',
        name: 'Code Shader inspector',
        shaderKind: 'customCode',
        role: 'effect',
        palette: ['#ff705f', '#8d5cff'],
        distortion: 56,
        swirl: 28,
        grain: 12,
        scale: 100,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        seedOffset: 0,
        opacity: 100,
        blendMode: 'normal',
        shaderInstance: {
          definition: {
            version: 1,
            id: 'v046-code-definition',
            label: 'Code Shader inspector',
            language: 'glsl-fragment',
            code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
            properties: [],
            provenance: { source: 'manual' },
          },
          values: {},
        },
      },
    ],
  },
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

  await layerInspector.getByLabel('Toggle layer delete and reorder lock').check();
  const lockedLayerSection = layerInspector.locator('[data-inspector-section][data-inspector-locked="true"]').first();
  await expect(lockedLayerSection).toBeVisible();
  await expect(layerInspector.getByLabel('Color')).toBeEnabled();

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

test('Code Shader inspector associates accepted, dirty, and invalid authoring states', async ({ page }) => {
  await gotoDocument(page, codeShaderInspectorDocument);
  await switchToNodeView(page);
  await page.locator('.react-flow__node[data-id="v046-code-shader"]').click();

  const code = page.getByLabel('Shader code');
  const field = code.locator('xpath=ancestor::*[@data-inspector-field="true"]');
  await expect(code).toBeVisible({ timeout: 15_000 });
  await expect(field).toHaveAttribute('data-inspector-validation', 'valid');

  await code.fill('void notMainImage() {}');
  await expect(field).toHaveAttribute('data-inspector-dirty', 'true');
  await expect(field).toHaveAttribute('data-inspector-validation', 'invalid');
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(code).toHaveAttribute('aria-errormessage', /-error$/);
});
