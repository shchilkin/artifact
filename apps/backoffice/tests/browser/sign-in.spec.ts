import { expect, type Route, test } from '@playwright/test';

test('renders the Backoffice sign-in proof consumer with Foundation controls', async ({ page }) => {
  await page.goto('/sign-in');

  const form = page.locator('.sign-in-form');
  await expect(form.locator('.ui-field')).toHaveCount(2);
  await expect(form.locator('.ui-input')).toHaveCount(2);
  await expect(form.locator('.ui-command')).toHaveCount(1);

  const email = page.getByLabel('Email');
  const password = page.getByLabel('Password');
  const submit = page.getByRole('button', { name: 'Sign in' });
  await expect(page.locator('.sign-in-brand')).toBeVisible();
  await expect(email).toHaveAttribute('autocomplete', 'email');
  await expect(email).toHaveAttribute('name', 'email');
  await expect(email).toHaveAttribute('required', '');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(password).toHaveAttribute('name', 'password');
  await expect(password).toHaveAttribute('required', '');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(email).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await expect(password).not.toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Return to Artifact' })).toBeFocused();

  const geometry = await page.locator('.sign-in-panel').evaluate((panel) => {
    const box = panel.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(await submit.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );

  const signature = await page.locator('.sign-in-brand').evaluate((brand) => {
    const mark = brand.querySelector('.brand-mark') as Element;
    const markStyles = getComputedStyle(mark);
    const signalProbe = document.createElement('span');
    signalProbe.style.color = 'var(--ui-brand-signal)';
    document.body.append(signalProbe);
    const resolvedBrandSignal = getComputedStyle(signalProbe).color;
    signalProbe.remove();
    return {
      fontFamily: getComputedStyle(brand).fontFamily,
      markBorderColor: markStyles.borderColor,
      markColor: markStyles.color,
      markText: mark.textContent?.trim(),
      resolvedBrandSignal,
    };
  });
  const controlFingerprint = await email.evaluate((control) => {
    const styles = getComputedStyle(control);
    return { borderRadius: styles.borderRadius, fontFamily: styles.fontFamily };
  });
  const commandFingerprint = await submit.evaluate((command) => {
    const styles = getComputedStyle(command);
    return { borderRadius: styles.borderRadius, textTransform: styles.textTransform };
  });
  expect(signature.markText).toBe('A');
  expect(signature.markColor).toBe(signature.resolvedBrandSignal);
  expect(signature.markBorderColor).toBe(signature.resolvedBrandSignal);
  expect(signature.fontFamily).not.toBe(controlFingerprint.fontFamily);
  expect(controlFingerprint).toMatchObject({ borderRadius: '3px' });
  expect(controlFingerprint.fontFamily).toContain('Inter');
  expect(commandFingerprint).toEqual({ borderRadius: '5px', textTransform: 'none' });
});

test('submits with the keyboard, exposes pending state, and keeps a safe return path', async ({ page }) => {
  let releaseSignIn: (() => void) | undefined;
  const signInGate = new Promise<void>((resolve) => {
    releaseSignIn = resolve;
  });
  let signInStarted: (() => void) | undefined;
  const signInRequest = new Promise<void>((resolve) => {
    signInStarted = resolve;
  });
  let requestBody: Record<string, unknown> | null = null;
  let requestCount = 0;
  await page.route('**/api/auth/sign-in/email', async (route) => {
    requestCount += 1;
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    signInStarted?.();
    await signInGate;
    await fulfillSuccessfulSignIn(route);
  });

  await page.goto('/sign-in?returnTo=%2Fusage%3Fperiod%3D2026-07');
  await page.getByLabel('Email').fill('admin@example.com');
  const password = page.getByLabel('Password');
  await password.fill('correct horse battery staple  ');
  await password.press('Enter');
  await signInRequest;

  const pending = page.getByRole('button', { name: 'Signing in' });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByLabel('Email')).toHaveValue('admin@example.com');
  await expect(password).toHaveValue('correct horse battery staple  ');
  await expect(page.getByLabel('Email')).toBeEnabled();
  await expect(password).toBeEnabled();
  await password.press('Enter');
  expect(requestCount).toBe(1);
  expect(requestBody).toMatchObject({
    email: 'admin@example.com',
    password: 'correct horse battery staple  ',
    rememberMe: true,
  });
  releaseSignIn?.();
  await expect(page).toHaveURL(/\/usage\?period=2026-07$/);
  expect(await page.evaluate(() => localStorage.getItem('artifact-better-auth-token'))).toBe(
    'backoffice-browser-token',
  );
});

test('announces auth errors and rejects an unsafe return path', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'The email or password was not accepted.' }),
    });
  });
  await page.goto('/sign-in?returnTo=%2F%2Fevil.example');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('incorrect');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const error = page.getByRole('alert');
  await expect(error).toHaveText('The email or password was not accepted.');
  await expect(page.getByLabel('Email')).toHaveValue('admin@example.com');
  await expect(page.getByLabel('Password')).toHaveValue('incorrect');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();

  await page.unroute('**/api/auth/sign-in/email');
  await page.route('**/api/auth/sign-in/email', fulfillSuccessfulSignIn);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).origin).toBe('http://127.0.0.1:4031');
});

async function fulfillSuccessfulSignIn(route: Route) {
  await route.fulfill({
    contentType: 'application/json',
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-origin': 'http://127.0.0.1:4031',
      'access-control-expose-headers': 'set-auth-token',
      'set-auth-token': 'backoffice-browser-token',
    },
    body: JSON.stringify({
      token: 'backoffice-browser-token',
      user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin' },
    }),
  });
}
