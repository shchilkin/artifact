import { expect, test } from '@playwright/test';

import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

test.skip(!process.env.VITE_AUTH_API_BASE_URL, 'requires the configured-auth release segment');

test.beforeEach(async ({ page }) => setupBrowserTestPage(page, { ignoreExpectedHttp401: true }));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('configured account overlay preserves auth states, keyboard focus, and recovery behavior', async ({ page }) => {
  let completeSignIn = () => {};
  const signInGate = new Promise<void>((resolve) => {
    completeSignIn = resolve;
  });

  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/get-session')) {
      await route.fulfill({ body: 'null', contentType: 'application/json', status: 200 });
      return;
    }
    if (path.endsWith('/sign-in/email')) {
      await signInGate;
      await route.fulfill({
        body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }),
        contentType: 'application/json',
        status: 401,
      });
      return;
    }
    if (path.endsWith('/request-password-reset')) {
      await route.fulfill({ body: JSON.stringify({ status: true }), contentType: 'application/json', status: 200 });
      return;
    }
    await route.fulfill({ body: '{}', contentType: 'application/json', status: 200 });
  });

  await page.goto('/docs');
  const accountButton = page.getByRole('button', { name: 'Sign In' });
  await expect(accountButton).toBeEnabled();
  await accountButton.focus();
  await accountButton.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('Sign in');
  await expect(dialog.getByLabel('Email')).toBeFocused();
  await dialog.getByLabel('Email').fill('artist@example.com');
  await dialog.getByLabel('Password', { exact: true }).fill('invalid-password');
  await dialog.getByLabel('Password', { exact: true }).press('Enter');
  await expect(dialog.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-busy', 'true');
  completeSignIn();
  await expect(dialog.getByRole('alert')).toContainText('Invalid email or password');

  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Create account');
  await dialog.getByLabel('Email').fill('artist@example.com');
  await dialog.getByLabel('Password', { exact: true }).fill('password-one');
  await dialog.getByLabel('Confirm password').fill('password-two');
  await dialog.getByLabel('Confirm password').press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Passwords do not match.');

  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(dialog).toHaveAccessibleName('Reset password');
  await dialog.getByLabel('Email').fill('artist@example.com');
  await dialog.getByLabel('Email').press('Enter');
  await expect(dialog.getByRole('status')).toContainText('a reset link is on its way');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(accountButton).toBeFocused();
});
