import { COMMAND_FOUNDATION_SPECIMEN_IDS, UI_FOUNDATION_THEME_TOKENS } from '@artifact/ui';
import { expect, test } from '@playwright/test';

test('Artifact exposes the shared command Foundation Matrix in its Product Theme', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const matrix = page.locator('[data-foundation-section="commands"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(COMMAND_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(COMMAND_FOUNDATION_SPECIMEN_IDS);

  const missingTokens = await matrix.evaluate((element, tokens) => {
    const styles = getComputedStyle(element);
    return tokens.filter((token) => styles.getPropertyValue(token).trim().length === 0);
  }, UI_FOUNDATION_THEME_TOKENS);
  expect(missingTokens).toEqual([]);

  await expect(matrix.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  await expect(matrix.getByRole('button', { name: 'Saving' })).toHaveAttribute('aria-busy', 'true');
  await expect(matrix.locator('[data-foundation-specimen="button-active"] .ui-command')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(matrix.getByRole('link', { name: 'Locked link' })).toHaveAttribute('aria-disabled', 'true');
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
  expect(fingerprint).toMatchObject({ borderRadius: '3px', textTransform: 'uppercase' });
  expect(fingerprint.letterSpacing).not.toBe('0px');
  expect(fingerprint.outlineStyle).not.toBe('none');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual(expect.objectContaining({ clientWidth: 390, scrollWidth: 390 }));
});

async function focusFirstFoundationCommandWithKeyboard(page: import('@playwright/test').Page) {
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press('Tab');
    const specimen = await page.evaluate(() =>
      document.activeElement?.closest('[data-foundation-specimen]')?.getAttribute('data-foundation-specimen'),
    );
    if (specimen) return specimen;
  }
  return null;
}
