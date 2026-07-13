import { expect, type Page, type Route, test } from '@playwright/test';

const account = {
  id: 'creator-1',
  email: 'creator@example.com',
  role: 'user',
  tier: 'creator',
  tierVersion: 2,
  generations: { committed: 9, reserved: 1 },
  providerCostMicroUsd: '10800',
  failedCalls: 1,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-07-13T10:00:00.000Z',
};

const accountDetail = {
  account,
  tierAssignments: [],
  quotaGrants: [
    {
      id: 'grant-1',
      period: '2026-07',
      amount: 5,
      reversedAmount: 1,
      reason: 'Launch allowance',
      adminUserId: 'admin-1',
      createdAt: '2026-07-10T10:00:00.000Z',
    },
  ],
  quotaGrantReversals: [],
  audit: [
    {
      id: 'audit-1',
      adminUserId: 'admin-1',
      targetUserId: 'creator-1',
      action: 'quota.grant',
      entityType: 'quota_grant',
      entityId: 'grant-1',
      reason: 'Launch allowance',
      before: null,
      after: { amount: 5 },
      createdAt: '2026-07-10T10:00:00.000Z',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await installAdminApi(page);
});

test('shows the operational overview and all four primary views', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium');
  await page.goto('/?period=2026-07');
  await expect(page.getByRole('heading', { name: 'Monthly pulse' })).toBeVisible();
  await expect(page.getByText('$10.00 spent')).toBeVisible();

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { name: 'Account access' })).toBeVisible();
  await expect(page.getByText('creator@example.com')).toBeVisible();

  await page.getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'creator@example.com' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Change access' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quota grants' })).toBeVisible();

  await page.getByRole('link', { name: 'Provider usage' }).click();
  await expect(page.getByRole('heading', { name: 'Provider ledger' })).toBeVisible();
  await expect(page.getByText('gpt-5.5')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reconciliation' })).toBeVisible();
});

test('renders denied access without exposing operational data', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'admin_access_denied',
        message: 'Admin access is required.',
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible();
  await expect(page.getByText('Creator accounts')).toHaveCount(0);
});

test('shows an empty account search without losing the filters', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/accounts?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accounts: [],
        page: { limit: 25, offset: 0, total: 0, hasMore: false },
      }),
    }),
  );
  await page.goto('/accounts?q=missing%40example.com&period=2026-07');
  await expect(page.getByText('No accounts found')).toBeVisible();
  await expect(page.getByLabel('Search accounts')).toHaveValue('missing@example.com');
});

test('shows a recoverable server error', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'admin_request_failed',
        message: 'Provider usage is temporarily unavailable.',
      }),
    }),
  );
  await page.goto('/usage');
  await expect(page.getByRole('heading', { name: 'Data could not be loaded' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('shows a clear message when the account service cannot be reached', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Data could not be loaded' })).toBeVisible();
  await expect(page.getByText('Could not connect to the Artifact account service.')).toBeVisible();
  await expect(page.getByText('Failed to fetch')).toHaveCount(0);
});

test('keeps a tier conflict visible beside the account control', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'admin_state_conflict',
          message: 'Account tier changed since it was loaded.',
        }),
      });
      return;
    }
    await fulfillAdminRead(route);
  });
  await page.goto('/accounts/creator-1?period=2026-07');
  await page.getByRole('combobox', { name: 'New tier' }).selectOption('free');
  await page.getByLabel('Reason for tier change').fill('End closed alpha access');
  await page.getByRole('button', { name: 'Change tier' }).click();
  await expect(page.getByText('Account changed elsewhere')).toBeVisible();
  await expect(page.getByText('Account tier changed since it was loaded.')).toBeVisible();
});

test('mobile navigation and controls fit without horizontal page overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/accounts/creator-1?period=2026-07');
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  await expect(page.getByRole('navigation', { name: 'Backoffice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add quota' })).toBeVisible();
});

async function installAdminApi(page: Page) {
  await page.route('**/api/admin/**', fulfillAdminRead);
}

async function fulfillAdminRead(route: Route) {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/admin/overview') {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        period: '2026-07',
        accounts: { free: 4, creator: 3, founder: 1, total: 8 },
        generations: { committed: 18, reserved: 2 },
        providerUsage: {
          costMicroUsd: '421500',
          inputTokens: '12000',
          outputTokens: '8800',
          failedCalls: 2,
        },
        safetyBudget: {
          period: '2026-07',
          state: 'normal',
          spentMicroUsd: '10000000',
          warningMicroUsd: '24000000',
          limitMicroUsd: '30000000',
        },
      }),
    });
  }
  if (url.pathname === '/api/admin/accounts') {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accounts: [account],
        page: { limit: 25, offset: 0, total: 1, hasMore: false },
      }),
    });
  }
  if (url.pathname === '/api/admin/accounts/creator-1') {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(accountDetail),
    });
  }
  if (url.pathname === '/api/admin/usage') {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        usage: [
          {
            id: 'usage-1',
            operationId: 'operation-1',
            userId: 'creator-1',
            feature: 'shader_create',
            provider: 'openai',
            model: 'gpt-5.5',
            status: 'succeeded',
            providerRequestId: 'request-1',
            usage: { inputTokens: 120, outputTokens: 340 },
            costMicroUsd: '10800',
            pricingVersion: 'openai-2026-07-12',
            createdAt: '2026-07-12T10:00:00.000Z',
          },
        ],
        page: { limit: 25, offset: 0, total: 1, hasMore: false },
      }),
    });
  }
  if (url.pathname === '/api/admin/reconciliations') {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        reconciliations: [
          {
            id: 'reconciliation-1',
            provider: 'openai',
            usageDate: '2026-07-11',
            status: 'succeeded',
            providerCostMicroUsd: '11000',
            internalCostMicroUsd: '10800',
            errorCode: null,
            syncedAt: '2026-07-12T02:00:00.000Z',
            createdAt: '2026-07-12T02:00:00.000Z',
          },
        ],
      }),
    });
  }
  return route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'not_found' }),
  });
}
