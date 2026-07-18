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
  focusFoundationSpecimenWithKeyboard,
} from '../../../../tests/browser/uiFoundationTestHelpers';

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

test('Backoffice exposes the same associated Foundation fields with native states', async ({ page }) => {
  await page.goto('/style-guide');

  const matrix = page.locator('[data-foundation-section="fields"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(FIELD_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(FIELD_FOUNDATION_SPECIMEN_IDS);

  const errorSelect = matrix.getByLabel('Aspect ratio');
  await expect(errorSelect).toHaveAttribute('aria-invalid', 'true');
  await expect(errorSelect).toHaveAttribute('aria-errormessage', /.+/);
  await expectDescriptionsToResolve(errorSelect, page);
  await expect(matrix.getByLabel('Archived note')).toBeDisabled();
  await expect(matrix.getByLabel('Source summary')).toHaveAttribute('readonly', '');

  expect(await focusFoundationSpecimenWithKeyboard(page, 'input-focus')).toBe('input-focus');
  const focusInput = matrix.getByLabel('Artist');
  await expect(focusInput).toBeFocused();
  const fingerprint = await focusInput.evaluate((input) => {
    const styles = getComputedStyle(input);
    return { fontFamily: styles.fontFamily, outlineStyle: styles.outlineStyle };
  });
  expect(fingerprint.fontFamily).toContain('Inter');
  expect(fingerprint.outlineStyle).not.toBe('none');

  expect(await focusFoundationSpecimenWithKeyboard(page, 'native-select-focus')).toBe('native-select-focus');
  const focusSelect = matrix.getByLabel('Preview density');
  await expect(focusSelect).toBeFocused();
  expect(await focusSelect.evaluate((select) => getComputedStyle(select).outlineStyle)).not.toBe('none');

  await expectMobileFieldGeometry(page, matrix);
});

test('Backoffice exposes the same feedback semantics and reduced-motion async states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/style-guide');

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
