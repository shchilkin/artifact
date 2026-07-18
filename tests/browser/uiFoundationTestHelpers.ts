import { OVERLAY_FOUNDATION_SPECIMEN_IDS } from '@artifact/ui';
import { expect, type Locator, type Page } from '@playwright/test';
import { pressForwardTab } from './helpers';

export async function focusFoundationSpecimenWithKeyboard(page: Page, target: string) {
  for (let step = 0; step < 40; step += 1) {
    await pressForwardTab(page);
    const specimen = await page.evaluate(() =>
      document.activeElement?.closest('[data-foundation-specimen]')?.getAttribute('data-foundation-specimen'),
    );
    if (specimen === target) return specimen;
  }
  return null;
}

export async function expectDescriptionsToResolve(locator: Locator, page: Page) {
  const describedBy = await locator.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  for (const id of describedBy?.split(/\s+/) ?? []) {
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
  }
}

export async function expectMobileFieldGeometry(page: Page, matrix: Locator) {
  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await matrix.evaluate((element) => {
    const controls = [...element.querySelectorAll<HTMLElement>('.ui-field-control')].map((control) => {
      const box = control.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    const specimens = [...element.querySelectorAll<HTMLElement>('[data-foundation-specimen]')].map((specimen) => {
      const box = specimen.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    });
    const overlaps = specimens.flatMap((first, index) =>
      specimens
        .slice(index + 1)
        .filter(
          (second) =>
            first.left < second.right &&
            first.right > second.left &&
            first.top < second.bottom &&
            first.bottom > second.top,
        ),
    ).length;
    return {
      overlaps,
      undersizedControls: controls.filter((control) => control.width < 44 || control.height < 44).length,
      viewportOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry).toEqual({ overlaps: 0, undersizedControls: 0, viewportOverflow: 0 });
}

export async function expectOverlayMatrixBehavior(
  page: Page,
  expectedTheme: { popoverFontFamily: string; popoverRadius: string; tooltipFontFamily: string; tooltipRadius: string },
) {
  const matrix = page.locator('[data-foundation-section="overlays"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(OVERLAY_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(OVERLAY_FOUNDATION_SPECIMEN_IDS);

  const previewTrigger = matrix.getByRole('button', { name: 'Preview document' });
  await expect(previewTrigger).toHaveAccessibleName('Preview document');
  await previewTrigger.hover();
  const pointerTooltip = page.getByRole('tooltip', { name: 'Open a larger preview' });
  await expect(pointerTooltip).toBeVisible();
  await expect(previewTrigger).not.toHaveAccessibleName('Open a larger preview');

  expect(await focusFoundationSpecimenWithKeyboard(page, 'tooltip-keyboard')).toBe('tooltip-keyboard');
  await expect(matrix.getByRole('button', { name: 'Keyboard help' })).toBeFocused();
  await expect(page.getByRole('tooltip', { name: 'Press Enter to run the focused command.' })).toBeVisible();

  const openTooltip = page.getByRole('tooltip', { name: 'Exports use the current document size.' });
  await expect(openTooltip).toBeVisible();
  const openTooltipSurface = page.locator('.ui-tooltip-content').filter({
    hasText: 'Exports use the current document size.',
  });
  const fingerprint = await openTooltipSurface.evaluate((tooltip) => {
    const styles = getComputedStyle(tooltip);
    return { animationName: styles.animationName, borderRadius: styles.borderRadius, fontFamily: styles.fontFamily };
  });
  expect(fingerprint.fontFamily).toContain(expectedTheme.tooltipFontFamily);
  expect(fingerprint.borderRadius).toBe(expectedTheme.tooltipRadius);
  expect(fingerprint.animationName).toBe('none');

  const dismissTrigger = matrix.getByRole('button', { name: 'Project details' });
  await dismissTrigger.click();
  const dismissPopover = page.getByRole('dialog', { name: 'Project details' });
  await expect(dismissPopover).toBeVisible();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await expect(dismissPopover).toBeHidden();

  expect(await focusFoundationSpecimenWithKeyboard(page, 'popover-keyboard')).toBe('popover-keyboard');
  const keyboardTrigger = matrix.getByRole('button', { name: 'Keyboard actions' });
  await expect(keyboardTrigger).toBeFocused();
  await page.keyboard.press('Enter');
  const keyboardPopover = page.getByRole('dialog', { name: 'Keyboard actions' });
  await expect(keyboardPopover).toBeVisible();
  await expect(keyboardPopover.getByRole('button', { name: 'Apply selection' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(keyboardPopover).toBeHidden();
  await expect(keyboardTrigger).toBeFocused();

  const longTooltip = page.getByRole('tooltip', {
    name: /PNG preserves transparency/,
  });
  const longPopover = page.getByRole('dialog', { name: 'Storage details' });
  await expect(longTooltip).toBeVisible();
  await expect(longPopover).toBeVisible();
  const longTooltipSurface = page.locator('.ui-tooltip-content').filter({ hasText: /PNG preserves transparency/ });
  const longPopoverSurface = page.locator('.ui-popover-content[aria-label="Storage details"]');
  const popoverFingerprint = await longPopoverSurface.evaluate((popover) => {
    const styles = getComputedStyle(popover);
    return { animationName: styles.animationName, borderRadius: styles.borderRadius, fontFamily: styles.fontFamily };
  });
  expect(popoverFingerprint).toMatchObject({
    animationName: 'none',
    borderRadius: expectedTheme.popoverRadius,
  });
  expect(popoverFingerprint.fontFamily).toContain(expectedTheme.popoverFontFamily);
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expectOverlaysInsideViewport(page, [longTooltipSurface, longPopoverSurface]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const formatDetailsTrigger = matrix.getByRole('button', { name: 'Format details' });
  await formatDetailsTrigger.evaluate((trigger) => trigger.scrollIntoView({ block: 'center' }));
  await expect(formatDetailsTrigger).toBeInViewport();
  await expect(longTooltipSurface).toBeInViewport();
  await expectOverlaysInsideViewport(page, [longTooltipSurface]);
  const storageDetailsTrigger = matrix.getByRole('button', { name: 'Storage details' });
  await storageDetailsTrigger.evaluate((trigger) => trigger.scrollIntoView({ block: 'center' }));
  await expect(storageDetailsTrigger).toBeInViewport();
  await expect(longPopoverSurface).toBeInViewport();
  await expectOverlaysInsideViewport(page, [longPopoverSurface]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
}

async function expectOverlaysInsideViewport(page: Page, overlays: Locator[]) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (const overlay of overlays) {
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  }
}
