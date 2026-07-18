import { COMMAND_FOUNDATION_SPECIMEN_IDS, UI_FOUNDATION_THEME_TOKENS } from '@artifact/ui';
import { expect, test } from '@playwright/test';

test('Backoffice exposes the same command Foundation Matrix in its Product Theme', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  await page.goto('/style-guide');

  await expect(page.getByRole('heading', { name: 'Style guide' })).toBeVisible();
  const matrix = page.locator('[data-foundation-section="commands"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(COMMAND_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(COMMAND_FOUNDATION_SPECIMEN_IDS);
  expect(apiRequests).toEqual([]);

  const missingTokens = await matrix.evaluate((element, tokens) => {
    const styles = getComputedStyle(element);
    return tokens.filter((token) => styles.getPropertyValue(token).trim().length === 0);
  }, UI_FOUNDATION_THEME_TOKENS);
  expect(missingTokens).toEqual([]);

  await expect(matrix.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  await expect(matrix.getByRole('button', { name: 'Saving' })).toHaveAttribute('aria-busy', 'true');
  await expect(matrix.getByRole('link', { name: 'Locked link' })).toHaveAttribute('tabindex', '-1');
  await expect(matrix.getByRole('button', { name: 'Preview command specimen' })).toBeVisible();

  const disabledLink = matrix.getByRole('link', { name: 'Locked link' });
  const urlBeforeDisabledClick = page.url();
  await disabledLink.evaluate((link: HTMLAnchorElement) => link.click());
  expect(page.url()).toBe(urlBeforeDisabledClick);

  const primary = matrix.getByRole('button', { name: 'Create' });
  expect(await focusFirstFoundationCommandWithKeyboard(page)).toBe('button-primary');
  await expect(primary).toBeFocused();
  const fingerprint = await primary.evaluate((button) => {
    const styles = getComputedStyle(button);
    return {
      borderRadius: styles.borderRadius,
      letterSpacing: styles.letterSpacing,
      outlineStyle: styles.outlineStyle,
      textTransform: styles.textTransform,
    };
  });
  expect(fingerprint).toMatchObject({ borderRadius: '5px', letterSpacing: 'normal', textTransform: 'none' });
  expect(fingerprint.outlineStyle).not.toBe('none');

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  const undersizedCommands = await matrix.locator('.ui-command').evaluateAll(
    (commands) =>
      commands.filter((command) => {
        const box = command.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      }).length,
  );
  expect(undersizedCommands).toBe(0);
});

async function focusFirstFoundationCommandWithKeyboard(page: import('@playwright/test').Page) {
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press('Tab');
    const specimen = await page.evaluate(() =>
      document.activeElement?.closest('[data-foundation-specimen]')?.getAttribute('data-foundation-specimen'),
    );
    if (specimen) return specimen;
  }
  return null;
}
