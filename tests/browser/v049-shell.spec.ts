import { expect, test } from '@playwright/test';

import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  await setupBrowserTestPage(page, { ignoreExpectedHttp404: testInfo.title.includes('recovery') });
  // With auth configured, every route asks for the session; answer as signed out.
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ body: 'null', contentType: 'application/json' }),
  );
});
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

const DIRECT_ROUTES = [
  { path: '/', ready: (page) => page.getByRole('navigation', { name: 'Site navigation' }) },
  { path: '/docs', ready: (page) => page.getByRole('navigation', { name: 'Site navigation' }) },
  { path: '/docs/recipes', ready: (page) => page.getByRole('navigation', { name: 'Site navigation' }) },
  { path: '/showcase', ready: (page) => page.getByRole('navigation', { name: 'Site navigation' }) },
  { path: '/projects', ready: (page) => page.getByRole('navigation', { name: 'Site navigation' }) },
  { path: '/reset-password', ready: (page) => page.getByRole('navigation', { name: 'Site navigation' }) },
  { path: '/app?new=blank', ready: (page) => page.getByRole('tab', { name: 'Switch to layers view' }) },
] satisfies { path: string; ready: (page: import('@playwright/test').Page) => import('@playwright/test').Locator }[];

for (const route of DIRECT_ROUTES) {
  test(`direct navigation renders the route-owned shell for ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(route.ready(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('main, .editor-layout').first()).toBeVisible();
  });
}

test('client navigation between public routes keeps the same document', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  // Showcase is left out: it renders project previews on the main thread, which is its own concern.
  // Visit each route once first: on a cold dev server, Vite may reload the page while it optimizes a
  // route's dependencies, which would look like a lost document rather than client navigation.
  for (const path of ['/docs', '/projects']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible({ timeout: 15_000 });
  }
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { __artifactShellMarker?: string }).__artifactShellMarker = 'kept';
  });

  const siteNavigation = page.getByRole('navigation', { name: 'Site navigation' });
  for (const [label, url] of [
    ['Docs', /\/docs$/],
    ['Projects', /\/projects$/],
    ['Docs', /\/docs$/],
  ] as const) {
    await siteNavigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(url, { timeout: 15_000 });
    await expect(siteNavigation.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
      { timeout: 15_000 },
    );
  }

  expect(
    await page.evaluate(() => (window as unknown as { __artifactShellMarker?: string }).__artifactShellMarker),
  ).toBe('kept');
});

test('route recovery renders inside the public shell and returns home', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/missing-v049-shell-route');

  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();

  await page.getByRole('region', { name: 'Page not found.' }).getByRole('link', { name: 'Return home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Page not found.' })).toHaveCount(0);
});

test('mobile navigation returns focus to its toggle when closed from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs');

  const openToggle = page.getByRole('button', { name: 'Open menu' });
  await openToggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();

  const closeToggle = page.getByRole('button', { name: 'Close menu' });
  await expect(closeToggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
});

test('site navigation skips its entrance animation for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs');

  const siteNavigation = page.getByRole('navigation', { name: 'Site navigation' });
  await expect(siteNavigation).toBeVisible();
  await expect(siteNavigation).toHaveCSS('animation-name', 'none');
  await expect(siteNavigation).toHaveCSS('opacity', '1');
});

test('account dialog loads on demand and returns focus to its trigger', async ({ page }) => {
  test.skip(!process.env.VITE_AUTH_API_BASE_URL, 'requires the configured-auth release segment');
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ body: 'null', contentType: 'application/json' }),
  );
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/docs');

  const trigger = page.getByRole('navigation', { name: 'Site navigation' }).getByRole('button', { name: 'Sign in' });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
