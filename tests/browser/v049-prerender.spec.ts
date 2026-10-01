import { expect, type Page, test } from '@playwright/test';

import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

// Prerendered HTML and the SPA fallback document exist only in the production build.
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE !== 'preview', 'requires the production preview server');

const PRERENDERED = [
  { path: '/', title: 'Artifact | Local-first Cover Art Editor', heading: /Stack layers/ },
  { path: '/docs', title: 'Docs | Artifact', heading: 'Docs.' },
  { path: '/docs/nodes', title: 'Learn | Artifact Docs', heading: 'Learn Artifact.' },
  { path: '/docs/recipes', title: 'Recipes | Artifact Docs', heading: 'Recipes.' },
  { path: '/docs/reference', title: 'Reference | Artifact Docs', heading: 'Reference.' },
] as const;

const SPA_FALLBACK = [
  '/app?new=blank',
  '/projects',
  '/reset-password',
  '/showcase',
  '/docs/style-guide',
  '/docs/reference/noise',
  '/missing-v049-prerender-route',
];

function metaContent(html: string, attribute: 'name' | 'property', key: string) {
  return html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1];
}

test.describe('static HTML', () => {
  for (const route of PRERENDERED) {
    test(`${route.path} is served as prerendered HTML with its own metadata`, async ({ request }) => {
      const response = await request.get(route.path);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(html).toContain(`<title>${route.title}</title>`);
      expect(metaContent(html, 'property', 'og:title')).toBe(route.title);
      expect(metaContent(html, 'name', 'twitter:title')).toBe(route.title);
      expect(metaContent(html, 'property', 'og:description')).toBe(metaContent(html, 'name', 'description'));
      expect(metaContent(html, 'property', 'og:url')).toBe(`https://artifact.shchilkin.dev${route.path}`);
      expect(html).toContain(route.path === '/' ? 'id="home-hero-title"' : 'id="docs-page-title"');
      expect(html).not.toContain('app-hydrate-fallback');
    });
  }

  for (const path of SPA_FALLBACK) {
    test(`${path} is served by the SPA fallback document`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(html).toContain('app-hydrate-fallback');
      expect(html).not.toContain('home-hero-title');
      expect(html).not.toContain('docs-page-title');
    });
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const route of PRERENDERED) {
    test(`${route.path} shows its content and site navigation`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page).toHaveTitle(route.title);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    });
  }

  test('SPA fallback paths show an accessible loading shell', async ({ page }) => {
    await page.goto('/projects');
    const status = page.getByRole('status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('Loading');
    await expect(status.locator('.app-hydrate-fallback__wordmark')).toHaveText('artifact');
  });

  test('the loading shell holds still for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app');
    const status = page.getByRole('status');
    await expect(status).toHaveCSS('animation-name', 'none');
    await expect(status).toHaveCSS('opacity', '1');
  });
});

test.describe('with JavaScript', () => {
  let hydrateFallbackHints: string[] = [];

  test.beforeEach(async ({ page }, testInfo) => {
    await setupBrowserTestPage(page, { ignoreExpectedHttp404: testInfo.title.includes('unknown') });
    hydrateFallbackHints = [];
    page.on('console', (message) => {
      // React Router logs this hint when a route renders without a hydration fallback.
      if (message.text().includes('HydrateFallback')) hydrateFallbackHints.push(message.text());
    });
  });
  test.afterEach(async ({ page }) => {
    expectNoBrowserIssues(page);
    expect(hydrateFallbackHints).toEqual([]);
  });

  async function markDocument(page: Page) {
    await page.evaluate(() => {
      (window as unknown as { __artifactPrerenderMarker?: string }).__artifactPrerenderMarker = 'kept';
    });
  }

  async function expectSameDocument(page: Page) {
    expect(
      await page.evaluate(
        () => (window as unknown as { __artifactPrerenderMarker?: string }).__artifactPrerenderMarker,
      ),
    ).toBe('kept');
  }

  for (const route of PRERENDERED) {
    test(`${route.path} hydrates without mismatch and stays interactive`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      // The mobile menu toggle only responds once React has hydrated the prerendered markup.
      await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
      await expect(page).toHaveTitle(route.title);
    });
  }

  test('the loading shell is visible until the matched route loads', async ({ page }) => {
    let releaseRoute = () => {};
    const routeHeld = new Promise<void>((resolve) => {
      releaseRoute = resolve;
    });
    await page.route(/\/assets\/projects-[^/]+\.js$/, async (route) => {
      await routeHeld;
      await route.continue();
    });

    await page.goto('/projects', { waitUntil: 'commit' });
    await expect(page.getByRole('status')).toContainText('Loading');

    releaseRoute();
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.app-hydrate-fallback')).toHaveCount(0);
    await expect(page).toHaveTitle('artifact | Projects');
  });

  test('client navigation crosses prerendered and fallback routes in one document', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/docs');
    await markDocument(page);

    const siteNavigation = page.getByRole('navigation', { name: 'Site navigation' });
    await siteNavigation.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page).toHaveTitle('artifact | Projects');

    await siteNavigation.getByRole('link', { name: 'Docs', exact: true }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Docs.' })).toBeVisible();

    await page
      .getByRole('main')
      .getByRole('link', { name: /Recipes/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/docs\/recipes$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Recipes.' })).toBeVisible();
    await expectSameDocument(page);
  });

  test('the editor opens from the prerendered home page and on refresh', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/');
    await markDocument(page);

    await page.getByRole('link', { name: 'Open editor' }).first().click();
    await expect(page).toHaveURL(/\/app(\?|$)/);
    await expect(page.getByRole('tab', { name: 'Switch to layers view' })).toBeVisible({ timeout: 15_000 });
    await expectSameDocument(page);

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Switch to layers view' })).toBeVisible({ timeout: 15_000 });
  });

  test('a dynamic docs path loads through the SPA fallback', async ({ page }) => {
    await page.goto('/docs/reference/noise');
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/noise/i);
    await expect(page).toHaveTitle('Node Reference | Artifact Docs');
  });

  test('an unknown path recovers inside the public shell', async ({ page }) => {
    await page.goto('/missing-v049-prerender-route');
    await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
  });
});
