import { OVERLAY_FOUNDATION_SPECIMEN_IDS } from '@artifact/ui';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { pressForwardTab } from './helpers';

export interface FoundationThemeExpectation {
  name: 'Artifact' | 'Backoffice';
  commandFontFamily: string;
  commandRadius: string;
  fieldFontFamily: string;
  fieldRadius: string;
  feedbackFontFamily: string;
  feedbackRadius: string;
  popoverFontFamily: string;
  popoverRadius: string;
  tooltipFontFamily: string;
  tooltipRadius: string;
}

export async function focusFoundationSpecimenWithKeyboard(page: Page, target: string) {
  const focusableCount = await page
    .locator(
      'a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible',
    )
    .count();
  const traversalLimit = Math.max(40, focusableCount + 1);

  for (let step = 0; step < traversalLimit; step += 1) {
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

export async function expectCommandMatrixConformance(page: Page, matrix: Locator, theme: FoundationThemeExpectation) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectEverySpecimenToBeReadable(matrix, theme.name);
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'button-primary',
    selector: '.ui-command',
    property: 'background-color',
    token: '--ui-command-accent',
  });
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'button-active',
    selector: '.ui-command',
    property: 'background-color',
    token: '--ui-command-surface-active',
  });
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'button-danger',
    selector: '.ui-command',
    property: 'color',
    token: '--ui-command-danger',
  });
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'button-disabled',
    selector: '.ui-command',
    property: 'opacity',
    token: '--ui-disabled-opacity',
  });
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'icon-button-primary',
    selector: '.ui-command',
    property: 'background-color',
    token: '--ui-command-accent',
  });

  await test.step(`[${theme.name}] Button / loading preserves a readable reduced-motion state`, async () => {
    const loading = matrix.locator('[data-foundation-specimen="button-loading"] .ui-command');
    await expect(loading, `[${theme.name}] button-loading must expose the busy state`).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(
      loading.locator('.ui-command__progress'),
      `[${theme.name}] button-loading motion must stop when reduced motion is requested`,
    ).toHaveCSS('animation-name', 'none');
  });

  await test.step(`[${theme.name}] command typography, spacing, and mobile targets match the Product Theme`, async () => {
    const primary = matrix.locator('[data-foundation-specimen="button-primary"] .ui-command');
    const fingerprint = await primary.evaluate((command) => {
      const styles = getComputedStyle(command);
      return {
        fontFamily: styles.fontFamily,
        minHeight: styles.minHeight,
        paddingLeft: styles.paddingLeft,
        radius: styles.borderRadius,
      };
    });
    expect(fingerprint.fontFamily, `[${theme.name}] Button typography`).toContain(theme.commandFontFamily);
    expect(fingerprint.radius, `[${theme.name}] Button geometry`).toBe(theme.commandRadius);
    await expectSemanticStyle(matrix, theme.name, {
      specimen: 'button-primary',
      selector: '.ui-command',
      property: 'min-height',
      token: '--ui-command-target-size',
    });
    await expectSemanticStyle(matrix, theme.name, {
      specimen: 'button-primary',
      selector: '.ui-command',
      property: 'padding-left',
      token: '--ui-command-padding-inline',
    });
    expect(fingerprint.minHeight, `[${theme.name}] Button target height`).toBe('44px');
    expect(Number.parseFloat(fingerprint.paddingLeft), `[${theme.name}] Button inline spacing`).toBeGreaterThan(0);
    await expectMobileMatrixGeometry(page, matrix, '.ui-command', theme.name);
  });
}

export async function expectFieldMatrixConformance(matrix: Locator, theme: FoundationThemeExpectation) {
  await expectEverySpecimenToBeReadable(matrix, theme.name);

  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'input-default',
    selector: '.ui-field-control',
    property: 'background-color',
    token: '--ui-field-control-surface',
  });
  for (const specimen of ['input-error', 'textarea-error', 'native-select-error']) {
    await expectSemanticStyle(matrix, theme.name, {
      specimen,
      selector: '.ui-field-control',
      property: 'border-top-color',
      token: '--ui-field-error-border',
    });
    await expect(
      matrix.locator(`[data-foundation-specimen="${specimen}"] .ui-field-control`),
      `[${theme.name}] ${specimen} must expose its error state`,
    ).toHaveAttribute('aria-invalid', 'true');
  }
  for (const specimen of ['input-disabled', 'textarea-disabled', 'native-select-disabled']) {
    await expectSemanticStyle(matrix, theme.name, {
      specimen,
      selector: '.ui-field-control',
      property: 'opacity',
      token: '--ui-disabled-opacity',
    });
  }
  for (const specimen of ['input-readonly', 'textarea-readonly']) {
    await expectSemanticStyle(matrix, theme.name, {
      specimen,
      selector: '.ui-field-control',
      property: 'background-color',
      token: '--ui-field-control-readonly-surface',
    });
  }

  await test.step(`[${theme.name}] field typography, spacing, and geometry match the Product Theme`, async () => {
    const field = matrix.locator('[data-foundation-specimen="input-default"] .ui-field');
    const control = field.locator('.ui-field-control');
    const fingerprint = await control.evaluate((input) => {
      const styles = getComputedStyle(input);
      return { fontFamily: styles.fontFamily, radius: styles.borderRadius };
    });
    expect(fingerprint.fontFamily, `[${theme.name}] Input typography`).toContain(theme.fieldFontFamily);
    expect(fingerprint.radius, `[${theme.name}] Input geometry`).toBe(theme.fieldRadius);
    await expectSemanticStyle(matrix, theme.name, {
      specimen: 'input-default',
      selector: '.ui-field',
      property: 'row-gap',
      token: '--ui-field-gap',
    });
    await expectSemanticStyle(matrix, theme.name, {
      specimen: 'input-default',
      selector: '.ui-field-control',
      property: 'padding-left',
      token: '--ui-field-control-padding-inline',
    });
  });
}

export async function expectFeedbackMatrixConformance(matrix: Locator, theme: FoundationThemeExpectation) {
  await expectEverySpecimenToBeReadable(matrix, theme.name);

  for (const variant of ['info', 'success', 'warning', 'danger']) {
    const specimen = `notice-${variant}`;
    const selector = `.ui-inline-notice--${variant}`;
    await expectSemanticStyle(matrix, theme.name, {
      specimen,
      selector,
      property: 'background-color',
      token: `--ui-feedback-${variant}-surface`,
    });
    await expectSemanticStyle(matrix, theme.name, {
      specimen,
      selector,
      property: 'border-top-color',
      token: `--ui-feedback-${variant}-border`,
    });
    await expectSemanticStyle(matrix, theme.name, {
      specimen,
      selector,
      property: 'color',
      token: `--ui-feedback-${variant}-text`,
    });
  }
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'skeleton-block',
    selector: '.ui-skeleton',
    property: 'background-color',
    token: '--ui-skeleton-surface',
  });
  await expectSemanticStyle(matrix, theme.name, {
    specimen: 'progress-determinate',
    selector: '.ui-progress-indicator__value',
    property: 'background-color',
    token: '--ui-progress-fill',
  });

  await test.step(`[${theme.name}] feedback typography and spacing match the Product Theme`, async () => {
    const notice = matrix.locator('[data-foundation-specimen="notice-info"] .ui-inline-notice');
    const fingerprint = await notice.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { fontFamily: styles.fontFamily, radius: styles.borderRadius };
    });
    expect(fingerprint.fontFamily, `[${theme.name}] InlineNotice typography`).toContain(theme.feedbackFontFamily);
    expect(fingerprint.radius, `[${theme.name}] InlineNotice geometry`).toBe(theme.feedbackRadius);
    await expectSemanticStyle(matrix, theme.name, {
      specimen: 'notice-info',
      selector: '.ui-inline-notice',
      property: 'padding-top',
      token: '--ui-feedback-padding-block',
    });
    await expectSemanticStyle(matrix, theme.name, {
      specimen: 'notice-info',
      selector: '.ui-inline-notice',
      property: 'padding-left',
      token: '--ui-feedback-padding-inline',
    });
  });
}

export async function expectOverlayMatrixBehavior(page: Page, expectedTheme: FoundationThemeExpectation) {
  const matrix = page.locator('[data-foundation-section="overlays"]');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('[data-foundation-specimen]')).toHaveCount(OVERLAY_FOUNDATION_SPECIMEN_IDS.length);
  expect(
    await matrix
      .locator('[data-foundation-specimen]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-foundation-specimen'))),
  ).toEqual(OVERLAY_FOUNDATION_SPECIMEN_IDS);
  await expect(page.getByRole('dialog', { name: 'Current export' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Storage details' })).toBeVisible();

  const previewTrigger = matrix.getByRole('button', { name: 'Preview document' });
  await expect(previewTrigger).toHaveAccessibleName('Preview document');
  await expect(previewTrigger).not.toHaveAccessibleName('Open a larger preview');

  expect(await focusFoundationSpecimenWithKeyboard(page, 'tooltip-keyboard')).toBe('tooltip-keyboard');
  await expect(matrix.getByRole('button', { name: 'Keyboard help' })).toBeFocused();
  const keyboardTooltip = page.getByRole('tooltip', { name: 'Press Enter to run the focused command.' });
  await expect(keyboardTooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(keyboardTooltip).toBeHidden();

  await previewTrigger.hover();
  const pointerTooltip = page.getByRole('tooltip', { name: 'Open a larger preview' });
  await expect(pointerTooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pointerTooltip).toBeHidden();

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
  await expectSemanticStyle(matrix, expectedTheme.name, {
    specimen: 'tooltip-open',
    selector: '.ui-tooltip-content',
    property: 'background-color',
    token: '--ui-tooltip-surface',
  });
  await expectSemanticStyle(matrix, expectedTheme.name, {
    specimen: 'tooltip-open',
    selector: '.ui-tooltip-content',
    property: 'color',
    token: '--ui-tooltip-text',
  });
  await expectSemanticStyle(matrix, expectedTheme.name, {
    specimen: 'popover-open',
    selector: '.ui-popover-content',
    property: 'background-color',
    token: '--ui-popover-surface',
  });
  await expectSemanticStyle(matrix, expectedTheme.name, {
    specimen: 'popover-open',
    selector: '.ui-popover-content',
    property: 'color',
    token: '--ui-popover-text',
  });
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
  await expectMobileMatrixGeometry(page, matrix, '.ui-command', expectedTheme.name);
}

async function expectEverySpecimenToBeReadable(matrix: Locator, theme: string) {
  const specimens = matrix.locator('[data-foundation-specimen]');
  const count = await specimens.count();
  for (let index = 0; index < count; index += 1) {
    const specimen = specimens.nth(index);
    const id = await specimen.getAttribute('data-foundation-specimen');
    await test.step(`[${theme}] ${id ?? `specimen-${index}`} is visible and readable`, async () => {
      await expect(specimen, `[${theme}] ${id ?? `specimen-${index}`} must be visible`).toBeVisible();
      const geometry = await specimen.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const label = element.querySelector<HTMLElement>('.ui-foundation-specimen__label');
        return {
          height: box.height,
          labelFontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0,
          width: box.width,
        };
      });
      expect(geometry.width, `[${theme}] ${id} width`).toBeGreaterThanOrEqual(120);
      expect(geometry.height, `[${theme}] ${id} height`).toBeGreaterThanOrEqual(120);
      expect(geometry.labelFontSize, `[${theme}] ${id} label typography`).toBeGreaterThanOrEqual(10);
    });
  }
}

async function expectMobileMatrixGeometry(page: Page, matrix: Locator, targetSelector: string, theme: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await matrix.evaluate((element, selector) => {
    const targets = [...element.querySelectorAll<HTMLElement>(selector)].map((target) => {
      const box = target.getBoundingClientRect();
      return { height: box.height, width: box.width };
    });
    return {
      undersizedTargets: targets.filter((target) => target.height < 44 || target.width < 44).length,
      viewportOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, targetSelector);
  expect(geometry.undersizedTargets, `[${theme}] mobile target readability`).toBe(0);
  expect(geometry.viewportOverflow, `[${theme}] mobile horizontal overflow`).toBe(0);
}

async function expectSemanticStyle(
  matrix: Locator,
  theme: string,
  assertion: { property: string; selector: string; specimen: string; token: string },
) {
  const label = `[${theme}] ${assertion.specimen} ${assertion.property} uses ${assertion.token}`;
  await test.step(label, async () => {
    const target = matrix.locator(`[data-foundation-specimen="${assertion.specimen}"] ${assertion.selector}`);
    await expect(target, `${label}: target must exist`).toHaveCount(1);
    const values = await target.evaluate((element, expected) => {
      const probe = document.createElement('span');
      probe.style.setProperty(expected.property, `var(${expected.token})`);
      probe.style.position = 'absolute';
      probe.style.pointerEvents = 'none';
      element.parentElement?.append(probe);
      const expectedValue = getComputedStyle(probe).getPropertyValue(expected.property);
      const actualValue = getComputedStyle(element).getPropertyValue(expected.property);
      probe.remove();
      return { actualValue, expectedValue };
    }, assertion);
    expect(values.actualValue, label).toBe(values.expectedValue);
  });
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
