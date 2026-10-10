import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  expectStoredLayerField,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
} from './helpers';

// v0.50.1 #444: effect help opens from the keyboard and sits beside its row, numeric entry names the limit it
// clamped to, and the signed-out AI gate is a calm notice rather than an error.

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const helpDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'h-fill', name: 'Backdrop', color: '#2255cc' }),
  {
    id: 'h-photo',
    name: 'Photo',
    kind: 'image',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    src: PIXEL_PNG,
    fit: 'cover',
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  },
  {
    id: 'h-rays',
    name: 'Rays',
    kind: 'effect',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    preset: 'rays',
    rayInt: 40,
    rays: 12,
  },
]);

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/ai/access', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, enabled: false, disabledReason: 'anonymous', providers: [] }),
    }),
  );
});
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

const layerInspector = (page: Page) => page.getByRole('complementary', { name: 'Layer settings' });

async function selectLayer(page: Page, id: string): Promise<Locator> {
  await page.locator(`.layer-row[data-layer-id="${id}"] .layer-row-name-button`).click();
  const inspector = layerInspector(page);
  await expect(inspector.locator('.editor-target-overview')).toBeVisible();
  return inspector;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('effect help opens on click, Enter, and Space, closes on Escape, and sits beside its row', async ({ page }) => {
  await gotoDocument(page, helpDocument);
  const inspector = await selectLayer(page, 'h-rays');
  const trigger = inspector.getByRole('button', { name: 'About Intensity' });
  const row = inspector
    .locator('[data-inspector-property-row="true"]')
    .filter({ has: page.getByRole('button', { name: 'About Intensity' }) });
  const help = page.getByRole('dialog', { name: 'About Intensity' });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(help).toBeVisible();
  await expect(help).toContainText('Ray Intensity');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const helpBox = await help.boundingBox();
  const rowBox = await row.boundingBox();
  expect(helpBox && rowBox && overlaps(helpBox, rowBox), 'help must not cover its own row').toBe(false);

  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(trigger).toBeFocused();
  // Escape closed the help only; the layer stays selected.
  await expect(inspector.getByRole('button', { name: 'About Intensity' })).toBeVisible();

  await page.keyboard.press('Space');
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  await trigger.click();
  await expect(help).toBeVisible();
  // A pinned help stays open after the pointer leaves.
  await page.mouse.move(10, 10);
  await page.waitForTimeout(400);
  await expect(help).toBeVisible();
  await trigger.click();
  await expect(help).toBeHidden();
});

test('numeric entry names the limit it clamped to and records one undo step', async ({ page }) => {
  await gotoDocument(page, helpDocument);
  const inspector = await selectLayer(page, 'h-rays');
  const entry = inspector.getByRole('spinbutton', { name: 'Intensity value' });
  const limitFor = (name: string) =>
    inspector
      .locator('[data-inspector-property-row="true"]')
      .filter({ has: page.getByRole('spinbutton', { name }) })
      .getByRole('status');
  const limit = limitFor('Intensity value');

  await entry.fill('999');
  await entry.press('Enter');
  await expect(entry).toHaveValue('100');
  await expect(limit).toHaveText('Max 100%');
  await expectStoredLayerField(page, { key: 'id', value: 'h-rays' }, 'rayInt', 100);
  await page.waitForTimeout(1500);
  await expect(limit).toHaveText('Max 100%');
  await expect(limit).toHaveText('', { timeout: 5_000 });

  // The clamped edit is one undo step back to the value before it.
  const undo = page.getByRole('button', { name: 'Undo' });
  await undo.click();
  await expectStoredLayerField(page, { key: 'id', value: 'h-rays' }, 'rayInt', 40);
  await expect(entry).toHaveValue('40');
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(entry).toHaveValue('100');

  // Count accepts typed values past its slider, up to its own limit.
  const count = inspector.getByRole('spinbutton', { name: 'Count value' });
  await count.fill('200');
  await count.press('Enter');
  await expect(count).toHaveValue('200');
  await count.fill('999');
  await count.press('Enter');
  await expect(count).toHaveValue('240');
  await expect(limitFor('Count value')).toHaveText('Max 240');

  await entry.fill('-5');
  await entry.blur();
  await expect(entry).toHaveValue('0');
  await expect(limit).toHaveText('Min 0%');
  await expectStoredLayerField(page, { key: 'id', value: 'h-rays' }, 'rayInt', 0);
  await expectStoredLayerField(page, { key: 'id', value: 'h-rays' }, 'rays', 240);
});

test('effect descriptions only promise typing past the slider where the entry accepts it', async ({ page }) => {
  await gotoDocument(page, helpDocument);
  const inspector = await selectLayer(page, 'h-rays');
  await expect(inspector.locator('.artifact-inspector-effect-description')).toContainText(
    'Type a Count up to 240; the slider stops at 96.',
  );
  await expect(inspector).not.toContainText('manual field');
});

test('the signed-out AI gate is an info notice, not an error', async ({ page }) => {
  await gotoDocument(page, helpDocument);
  const inspector = await selectLayer(page, 'h-photo');
  const gate = inspector.locator('.ai-generation-access-banner');

  await expect(gate).toContainText('Account required for AI');
  await expect(gate).toContainText('Sign in to create with AI.');
  await expect(gate).toHaveAttribute('data-inspector-status', 'info');
  await expect(gate).toHaveClass(/ui-inline-notice--info/);
  await expect(gate).toHaveAttribute('role', 'status');

  const colors = await gate.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--state-danger)';
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    const title = element.querySelector('.artifact-inspector-status__title');
    const message = element.querySelector('.artifact-inspector-status__message');
    return {
      danger,
      title: title ? getComputedStyle(title).color : '',
      message: message ? getComputedStyle(message).color : '',
    };
  });
  expect(colors.title).not.toBe(colors.danger);
  expect(colors.message).not.toBe(colors.danger);
});
