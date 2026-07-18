import { expect, test } from '@playwright/test';

const commandSpecimenIds = [
  'button-primary',
  'button-secondary',
  'button-quiet',
  'button-danger',
  'button-disabled',
  'button-link-primary',
  'button-link-disabled',
  'icon-button-default',
  'icon-button-primary',
  'icon-button-danger',
  'icon-button-disabled',
] as const;

const requiredThemeTokens = [
  '--ui-command-font-family',
  '--ui-command-font-size',
  '--ui-command-font-weight',
  '--ui-command-letter-spacing',
  '--ui-command-text-transform',
  '--ui-command-height',
  '--ui-command-height-compact',
  '--ui-command-padding-inline',
  '--ui-command-gap',
  '--ui-command-radius',
  '--ui-command-surface',
  '--ui-command-surface-hover',
  '--ui-command-surface-active',
  '--ui-command-text',
  '--ui-command-text-hover',
  '--ui-command-border',
  '--ui-command-border-hover',
  '--ui-command-accent',
  '--ui-command-accent-hover',
  '--ui-command-accent-contrast',
  '--ui-command-danger',
  '--ui-command-danger-surface',
  '--ui-focus-ring',
  '--ui-focus-offset',
  '--ui-disabled-opacity',
  '--ui-motion-fast',
  '--ui-ease-out',
  '--ui-brand-field',
  '--ui-brand-frame',
  '--ui-brand-signal',
  '--ui-brand-shadow',
] as const;

test('Artifact exposes the shared command Foundation Matrix in its Product Theme', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const matrix = page.locator('[data-foundation-section="commands"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(commandSpecimenIds.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(commandSpecimenIds);

  const missingTokens = await matrix.evaluate((element, tokens) => {
    const styles = getComputedStyle(element);
    return tokens.filter((token) => styles.getPropertyValue(token).trim().length === 0);
  }, requiredThemeTokens);
  expect(missingTokens).toEqual([]);

  await expect(matrix.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  await expect(matrix.getByRole('link', { name: 'Locked link' })).toHaveAttribute('aria-disabled', 'true');
  await expect(matrix.getByRole('button', { name: 'Preview command specimen' })).toBeVisible();

  const disabledLink = matrix.getByRole('link', { name: 'Locked link' });
  const urlBeforeDisabledClick = page.url();
  await disabledLink.evaluate((link: HTMLAnchorElement) => link.click());
  expect(page.url()).toBe(urlBeforeDisabledClick);

  const primary = matrix.getByRole('button', { name: 'Create' });
  await primary.focus();
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
