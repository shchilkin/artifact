import {
  COMMAND_FOUNDATION_SPECIMEN_IDS,
  FEEDBACK_FOUNDATION_SPECIMEN_IDS,
  FIELD_FOUNDATION_SPECIMEN_IDS,
  UI_FOUNDATION_THEME_TOKENS,
} from '@artifact/ui';
import { expect, test } from '@playwright/test';
import {
  expectDescriptionsToResolve,
  expectMobileFieldGeometry,
  expectOverlayMatrixBehavior,
  focusFoundationSpecimenWithKeyboard,
} from './uiFoundationTestHelpers';

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
  expect(await focusFoundationSpecimenWithKeyboard(page, 'button-primary')).toBe('button-primary');
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

test('Artifact exposes associated Foundation fields with keyboard focus and native states', async ({ page }) => {
  await page.goto('/docs/style-guide');

  const matrix = page.locator('[data-foundation-section="fields"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(FIELD_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(FIELD_FOUNDATION_SPECIMEN_IDS);

  const errorInput = matrix.getByLabel('Release title');
  await expect(errorInput).toHaveAttribute('aria-invalid', 'true');
  await expect(errorInput).toHaveAttribute('aria-errormessage', /.+/);
  await expectDescriptionsToResolve(errorInput, page);
  await expect(matrix.getByLabel('Published slug')).toBeDisabled();
  await expect(matrix.getByLabel('Document ID')).toHaveAttribute('readonly', '');

  expect(await focusFoundationSpecimenWithKeyboard(page, 'input-focus')).toBe('input-focus');
  const focusInput = matrix.getByLabel('Artist');
  await expect(focusInput).toBeFocused();
  const fingerprint = await focusInput.evaluate((input) => {
    const styles = getComputedStyle(input);
    return { fontFamily: styles.fontFamily, outlineStyle: styles.outlineStyle };
  });
  expect(fingerprint.fontFamily).toContain('Space Mono');
  expect(fingerprint.outlineStyle).not.toBe('none');

  expect(await focusFoundationSpecimenWithKeyboard(page, 'native-select-focus')).toBe('native-select-focus');
  const focusSelect = matrix.getByLabel('Preview density');
  await expect(focusSelect).toBeFocused();
  expect(await focusSelect.evaluate((select) => getComputedStyle(select).outlineStyle)).not.toBe('none');

  await expectMobileFieldGeometry(page, matrix);
});

test('Artifact exposes shared feedback semantics and reduced-motion async states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs/style-guide');

  const matrix = page.locator('[data-foundation-section="feedback"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(FEEDBACK_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(FEEDBACK_FOUNDATION_SPECIMEN_IDS);

  await expect(matrix.locator('[data-foundation-specimen="notice-info"] [role="status"]')).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen="notice-success"] [role="status"]')).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen="notice-warning"] [role="status"]')).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen="notice-danger"] [role="alert"]')).toBeVisible();
  await expect(matrix.getByRole('status', { name: 'Loading project preview' })).toBeVisible();

  const indeterminate = matrix.getByRole('progressbar', { name: 'Rendering preview' });
  await expect(indeterminate).toHaveAttribute('aria-busy', 'true');
  await expect(indeterminate).not.toHaveAttribute('aria-valuenow');
  await expect(matrix.getByRole('progressbar', { name: 'Exporting document' })).toHaveAttribute('aria-valuenow', '72');

  await expect(matrix.locator('[data-foundation-specimen="skeleton-line"] .ui-skeleton').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  await expect(indeterminate.locator('.ui-progress-indicator__value')).toHaveCSS('animation-name', 'none');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});

test('Artifact exposes shared Tooltip and Popover mechanics in its Product Theme', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs/style-guide');

  await expectOverlayMatrixBehavior(page, {
    popoverFontFamily: 'Barlow Condensed',
    popoverRadius: '4px',
    tooltipFontFamily: 'Space Mono',
    tooltipRadius: '3px',
  });
});
