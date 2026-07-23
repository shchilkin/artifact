import { expect, test } from '@playwright/test';

import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

const PRODUCT_SURFACE_SPECIMENS = [
  'public-shell',
  'route-recovery',
  'artwork-frame',
  'project-library',
  'docs-navigation',
  'docs-reference',
  'docs-learning',
] as const;

test.beforeEach(async ({ page }, testInfo) =>
  setupBrowserTestPage(page, {
    ignoreExpectedHttp400: testInfo.title.includes('server error, pending, success'),
    ignoreExpectedHttp404: testInfo.title.includes('removed shader debug URL'),
  }),
);
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('removed shader debug URL resolves to the Artifact not-found recovery surface', async ({ page }) => {
  await page.goto('/debug/shaders');

  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await expect(page.getByText('The requested page could not be found.')).toBeVisible();
  const recovery = page.getByRole('region', { name: 'Page not found.' });
  await expect(recovery.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
  await expect(recovery.getByRole('link', { name: 'Open editor' })).toHaveAttribute('href', '/app?new=blank');
  await expect(page.getByText(/shader debug/i)).toHaveCount(0);
});

test('public shell exposes an accessible responsive navigation contract', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs');

  const toggle = page.getByRole('button', { name: 'Open menu' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Docs' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Showcase' }).click();
  await expect(page).toHaveURL(/\/showcase$/);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('public shell hides the mobile navigation trigger on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/');

  const siteNavigation = page.getByRole('navigation', { name: 'Site navigation' });
  await expect(siteNavigation.getByRole('link', { name: 'Open editor', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
});

test('password recovery exposes missing-token and validation states through Foundation controls', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByRole('heading', { name: 'Choose new password' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Open the link from your password reset email.');
  const missingTokenForm = page.getByRole('form', { name: 'Reset password' });
  await expect(missingTokenForm.getByLabel('New password')).toBeDisabled();
  await expect(missingTokenForm.getByLabel('Confirm password')).toBeDisabled();
  await expect(missingTokenForm.getByRole('button', { name: 'Update password' })).toBeDisabled();

  await page.goto('/reset-password?token=expired-token&error=invalid_token');
  await expect(page.getByRole('alert')).toContainText('This reset link is invalid or expired.');

  await page.goto('/reset-password?token=valid-test-token');
  const validTokenForm = page.getByRole('form', { name: 'Reset password' });
  await validTokenForm.getByLabel('New password').fill('short');
  await validTokenForm.getByLabel('Confirm password').fill('short');
  await validTokenForm.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByRole('alert')).toContainText('Password must be at least 8 characters.');
  await expect(validTokenForm.getByLabel('New password')).toHaveClass(/ui-input/);
  await expect(validTokenForm.getByRole('button', { name: 'Update password' })).toHaveClass(/ui-command/);
});

test('password recovery preserves server error, pending, success, and keyboard submission states', async ({ page }) => {
  let requestCount = 0;
  let completeSuccessfulReset = () => {};
  const successfulResetGate = new Promise<void>((resolve) => {
    completeSuccessfulReset = resolve;
  });

  await page.route('**/api/auth/reset-password', async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        body: JSON.stringify({ code: 'INVALID_TOKEN', message: 'invalid token' }),
        contentType: 'application/json',
        status: 400,
      });
      return;
    }
    await successfulResetGate;
    await route.fulfill({ body: JSON.stringify({ status: true }), contentType: 'application/json', status: 200 });
  });

  await page.goto('/reset-password?token=valid-test-token');
  const form = page.getByRole('form', { name: 'Reset password' });
  await form.getByLabel('New password').fill('valid-password');
  await form.getByLabel('Confirm password').fill('valid-password');
  await form.getByLabel('Confirm password').press('Enter');
  await expect(page.getByRole('alert')).toContainText('This reset link is invalid or expired.');

  await form.getByLabel('Confirm password').press('Enter');
  await expect(form.getByRole('button', { name: 'Updating' })).toHaveAttribute('aria-busy', 'true');
  completeSuccessfulReset();
  await expect(page.getByRole('status')).toContainText('Password updated. You can now sign in');
  await expect(form.getByLabel('New password')).toBeDisabled();
});

test('Artifact style guide closes the Product Surface Pattern inventory', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const inventory = page.locator('[data-product-surface-inventory]');
  await expect(inventory).toBeVisible();
  await expect(inventory.locator('[data-product-specimen]')).toHaveCount(PRODUCT_SURFACE_SPECIMENS.length);
  expect(
    await inventory
      .locator('[data-product-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-product-specimen'))),
  ).toEqual(PRODUCT_SURFACE_SPECIMENS);

  const accountStates = inventory.locator('[data-product-specimen="public-shell"] [data-account-state]');
  await expect(accountStates).toHaveCount(3);
  expect(
    await accountStates.evaluateAll((items) => items.map((item) => item.getAttribute('data-account-state'))),
  ).toEqual(['anonymous', 'loading', 'authenticated']);
});

test('examples remains the canonical showcase compatibility entry', async ({ page }) => {
  await page.goto('/examples');
  await expect(page).toHaveURL(/\/showcase$/);
  await expect(page.getByRole('heading', { name: 'Made in Artifact.' })).toBeVisible();
});

test('home presents an accessible discovery journey into blank and showcase starts', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Stack layers. Shape covers.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Album cover preview composing layer by layer' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Layer progression' }).locator('[aria-current="step"]')).toHaveCount(1);

  const hero = page.getByRole('region', { name: 'Stack layers. Shape covers.' });
  await expect(hero.getByRole('link', { name: 'Open editor' })).toHaveAttribute('href', '/app?new=blank');
  await expect(hero.getByRole('link', { name: 'View showcase' })).toHaveAttribute('href', '/showcase');
});

test('showcase exposes incremental loading and failed-preview recovery without losing editable links', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });
    HTMLCanvasElement.prototype.toDataURL = () => {
      throw new Error('deterministic thumbnail failure');
    };
  });
  await page.goto('/showcase');
  await expect(page.getByRole('heading', { name: 'Made in Artifact.' })).toBeVisible();

  const wall = page.getByRole('region', { name: 'Made in Artifact project wall' });
  const tiles = wall.getByRole('link', { name: /Open .+ in editor/ });
  await expect.poll(() => tiles.count()).toBeGreaterThanOrEqual(4);
  const initialCount = await tiles.count();
  expect(initialCount).toBeGreaterThanOrEqual(4);
  await expect(wall.getByText('Preview unavailable.').first()).toBeVisible({ timeout: 15_000 });
  await expect(tiles.first()).toHaveAttribute('href', /^\/app\?doc=/);

  await page.getByRole('button', { name: 'Render more' }).click();
  await expect.poll(() => tiles.count()).toBeGreaterThan(initialCount);
  await expect(page.getByRole('button', { name: /Rendering|Render more/ })).toBeVisible();
});

test('Projects route shares the product shell and exposes an actionable empty library', async ({ page }) => {
  await page.goto('/projects');

  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  const library = page.getByRole('region', { name: 'Local projects' });
  await expect(library.getByText('Projects keep editable work inside this browser.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'New project' })).toHaveAttribute('href', '/app?new=blank');
  await expect(page.getByRole('link', { name: 'New project' })).toHaveClass(/ui-command/);
});

test('Docs shares active navigation, Foundation search commands, and explicit not-found recovery', async ({ page }) => {
  await page.goto('/docs/nodes');

  const docsNavigation = page.getByRole('navigation', { name: 'Docs navigation' });
  await expect(docsNavigation.getByRole('link', { name: /Learn/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('searchbox', { name: 'Search docs' })).toHaveClass(/ui-input/);
  await page.getByText('Filter results by type').click();
  const effectsFilter = page.getByRole('button', { name: 'Effects', exact: true });
  await expect(effectsFilter).toHaveClass(/ui-command/);
  await effectsFilter.click();
  await expect(effectsFilter).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/docs/reference');
  await expect(page.getByRole('searchbox', { name: 'Search node reference' })).toHaveClass(/ui-input/);
  await page.getByRole('searchbox', { name: 'Search node reference' }).fill('no-such-artifact-node');
  await expect(page.getByRole('heading', { name: 'No matching nodes.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('heading', { name: 'Fill' }).first()).toBeVisible();

  await page.goto('/docs/reference/not-a-node');
  await expect(page.getByRole('heading', { name: 'Node not found.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to reference' })).toHaveClass(/ui-command/);
  await expect(page.getByRole('link', { name: 'Back to reference' })).toHaveAttribute('href', '/docs/reference');
});

test('non-editor product routes keep their hierarchy and controls inside a narrow viewport', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  const routes = [
    { path: '/', heading: 'Stack layers. Shape covers.' },
    { path: '/showcase', heading: 'Made in Artifact.' },
    { path: '/projects', heading: 'Projects' },
    { path: '/docs', heading: 'Docs.' },
    { path: '/docs/recipes', heading: 'Recipes.' },
    { path: '/docs/reference', heading: 'Reference.' },
    { path: '/docs/reference/fill', heading: 'Fill' },
    { path: '/docs/reference/not-a-node', heading: 'Node not found.' },
    { path: '/docs/nodes', heading: 'Learn Artifact.' },
    { path: '/docs/style-guide', heading: 'Style guide.' },
    { path: '/reset-password', heading: 'Choose new password' },
  ] as const;

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(layout.scrollWidth, `${route.path} should not overflow horizontally`).toBeLessThanOrEqual(
      layout.viewportWidth + 1,
    );
  }
});
