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

test('submits the overview UTC period by keyboard through Foundation controls', async ({ page }) => {
  const requestedPeriods: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/admin/overview') requestedPeriods.push(url.searchParams.get('period') ?? '');
  });

  await page.goto('/?period=2026-07');
  const period = page.getByLabel('UTC period');
  await expect(period).toHaveClass(/\bui-field-control\b/);
  await expect(page.getByRole('button', { name: 'Apply' })).toHaveClass(/\bui-command\b/);

  await period.fill('2026-06');
  await period.press('Enter');

  await expect(page).toHaveURL(/period=2026-06/);
  expect(requestedPeriods).toContain('2026-06');
  await expect(page.getByRole('heading', { name: 'Monthly pulse' })).toBeVisible();
  await expect(page.getByText('$10.00 spent')).toBeVisible();
});

test('clamps the Safety Budget progress while preserving over-limit operational values', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/overview?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        period: '2026-07',
        accounts: { free: 0, creator: 0, founder: 0, total: 0 },
        generations: { committed: 0, reserved: 0 },
        providerUsage: { costMicroUsd: '0', inputTokens: '0', outputTokens: '0', failedCalls: 0 },
        safetyBudget: {
          period: '2026-07',
          state: 'stopped',
          spentMicroUsd: '36000000',
          warningMicroUsd: '24000000',
          limitMicroUsd: '30000000',
        },
      }),
    }),
  );

  await page.goto('/?period=2026-07');
  await expect(page.getByRole('progressbar', { name: 'Safety budget used' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByText('$36.00 spent')).toBeVisible();
  await expect(page.getByText('Remaining').locator('..').getByText('$0.00', { exact: true })).toBeVisible();
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

test('renders shell and route-state actions through the UI Foundation command contract', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveClass(/\bui-command\b/);

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
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: 'Use another account' })).toHaveClass(/\bui-command\b/);
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

test('preserves account filters through Foundation search and pagination controls', async ({ page }) => {
  const accountRequests: string[] = [];
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/accounts?**', (route) => {
    const url = new URL(route.request().url());
    accountRequests.push(url.search);
    const limit = Number(url.searchParams.get('limit') ?? 25);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accounts: [account],
        page: { limit, offset, total: 51, hasMore: offset + limit < 51 },
      }),
    });
  });

  await page.goto('/accounts?q=creator&period=2026-07&limit=25&offset=0');
  const search = page.getByLabel('Search accounts');
  const period = page.getByLabel('UTC period');
  await expect(search).toHaveClass(/\bui-field-control\b/);
  await expect(period).toHaveClass(/\bui-field-control\b/);
  await expect(page.getByRole('button', { name: 'Search' })).toHaveClass(/\bui-command\b/);

  await search.fill('creator@example.com');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=creator%40example.com/);
  await expect(page).not.toHaveURL(/offset=/);

  const next = page.getByRole('link', { name: 'Next' });
  await expect(next).toHaveClass(/\bui-command\b/);
  await next.focus();
  await next.press('Enter');
  await expect(page).toHaveURL(/q=creator%40example.com/);
  await expect(page).toHaveURL(/period=2026-07/);
  await expect(page).toHaveURL(/limit=25/);
  await expect(page).toHaveURL(/offset=25/);
  expect(accountRequests.some((request) => request.includes('offset=25'))).toBe(true);
});

test('contains the account directory table in a keyboard-scrollable mobile region', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/accounts?period=2026-07');

  const tableRegion = page.getByRole('region', { name: 'Account directory table' });
  await expect(tableRegion).toHaveAttribute('tabindex', '0');
  const geometry = await tableRegion.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
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

test('does not present a missing admin API route as a missing account', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'not_found',
        message: 'Not found.',
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Admin API route unavailable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account not found' })).toHaveCount(0);
});

test('shows a missing-account state only on account detail routes', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'admin_account_not_found',
        message: 'Account not found.',
      }),
    }),
  );
  await page.goto('/accounts/missing-account?period=2026-07');
  await expect(page.getByRole('heading', { name: 'Account not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to accounts' })).toBeVisible();
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
  const tier = page.getByRole('combobox', { name: 'New tier' });
  const reason = page.getByLabel('Reason for tier change');
  const submit = page.getByRole('button', { name: 'Change tier' });
  await expect(tier).toHaveClass(/\bui-field-control\b/);
  await expect(reason).toHaveClass(/\bui-field-control\b/);
  await expect(submit).toHaveClass(/\bui-command\b/);
  await tier.selectOption('free');
  await reason.fill('End closed alpha access');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveClass(/\bui-inline-notice\b/);
  await expect(page.getByText('Account changed elsewhere')).toBeVisible();
  await expect(page.getByText('Account tier changed since it was loaded.')).toBeVisible();
});

test('submits quota grants and reversals through Foundation controls with audited reasons', async ({ page }) => {
  const mutationBodies: Array<Record<string, unknown>> = [];
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', async (route) => {
    if (route.request().method() === 'POST') {
      mutationBodies.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...accountDetail, created: true }),
      });
      return;
    }
    await fulfillAdminRead(route);
  });

  await page.goto('/accounts/creator-1?period=2026-07');
  const grantPeriod = page.getByLabel('Period');
  const grantAmount = page.getByLabel('Generations');
  const grantReason = page.getByLabel('Reason for quota grant');
  const grantSubmit = page.getByRole('button', { name: 'Add quota' });
  await expect(grantPeriod).toHaveClass(/\bui-field-control\b/);
  await expect(grantAmount).toHaveClass(/\bui-field-control\b/);
  await expect(grantReason).toHaveClass(/\bui-field-control\b/);
  await expect(grantSubmit).toHaveClass(/\bui-command\b/);
  await grantAmount.fill('7');
  await grantReason.fill('Support a launch campaign');
  await grantSubmit.click();
  await expect(page.getByRole('status').filter({ hasText: '7 generations added for 2026-07.' })).toBeVisible();

  const reversalAmount = page.getByLabel('Amount to reverse');
  const reversalReason = page.getByLabel('Reversal reason');
  const reversalSubmit = page.getByRole('button', { name: 'Reverse' });
  await expect(reversalAmount).toHaveClass(/\bui-field-control\b/);
  await expect(reversalReason).toHaveClass(/\bui-field-control\b/);
  await expect(reversalSubmit).toHaveClass(/\bui-command\b/);
  await reversalAmount.fill('1');
  await reversalReason.fill('Correct duplicate allowance');
  await reversalSubmit.click();
  await expect(page.getByRole('status').filter({ hasText: '1 granted generations reversed.' })).toBeVisible();

  expect(mutationBodies).toHaveLength(2);
  expect(mutationBodies[0]).toMatchObject({ amount: 7, period: '2026-07', reason: 'Support a launch campaign' });
  expect(mutationBodies[1]).toMatchObject({ amount: 1, reason: 'Correct duplicate allowance' });
  expect(
    mutationBodies.every((body) => typeof body.idempotencyKey === 'string' && body.idempotencyKey.length > 0),
  ).toBe(true);
});

test('previews and applies AI operation recovery with an audit reason', async ({ page }) => {
  await page.goto('/usage');
  await expect(page.getByRole('heading', { name: 'Operation recovery' })).toBeVisible();
  const summary = page.locator('.operation-recovery-summary > div').filter({ hasText: 'Ready to finalize' });
  await expect(summary.getByText('1', { exact: true })).toBeVisible();

  await expect(page.getByLabel('Account ID')).toHaveClass(/\bui-field-control\b/);
  await expect(page.getByRole('textbox', { name: 'Provider', exact: true })).toHaveClass(/\bui-field-control\b/);
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveClass(/\bui-field-control\b/);
  await expect(page.getByRole('button', { name: 'Apply' })).toHaveClass(/\bui-command\b/);
  const reason = page.getByLabel('Reason');
  const recovery = page.getByRole('button', { name: 'Recover operations' });
  await expect(reason).toHaveClass(/\bui-field-control\b/);
  await expect(recovery).toHaveClass(/\bui-command\b/);
  await reason.fill('Finalize completed production results');
  await recovery.click();

  await expect(page.getByRole('status').filter({ hasText: 'Change saved' })).toHaveClass(/\bui-inline-notice\b/);
  await expect(page.getByText('Finalized 1 completed result and closed 1 abandoned request.')).toBeVisible();
});

test('preserves provider-ledger filters when paging from the default page size', async ({ page }) => {
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/usage') {
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          usage: [],
          page: { limit, offset, total: 51, hasMore: offset + limit < 51 },
        }),
      });
      return;
    }
    await fulfillAdminRead(route);
  });

  await page.goto('/usage?userId=creator-1&provider=openai&status=failed');
  const next = page.getByRole('link', { name: 'Next' });
  await expect(next).toHaveClass(/\bui-command\b/);
  await next.focus();
  await next.press('Enter');
  await expect(page).toHaveURL(/userId=creator-1/);
  await expect(page).toHaveURL(/provider=openai/);
  await expect(page).toHaveURL(/status=failed/);
  await expect(page).toHaveURL(/limit=25/);
  await expect(page).toHaveURL(/offset=25/);
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
  if (url.pathname === '/api/admin/ai-operations/reconciliation') {
    const applied = route.request().method() === 'POST';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: applied ? 'applied' : 'preview',
        repeated: false,
        checkedAt: '2026-07-15T10:00:00.000Z',
        staleBefore: '2026-07-15T04:00:00.000Z',
        recoveredOperationIds: ['operation-1'],
        expiredOperationIds: ['operation-2'],
        nextAllowedAt: applied ? '2026-07-15T10:05:00.000Z' : null,
      }),
    });
  }
  return route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'not_found' }),
  });
}
