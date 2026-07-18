import { expect, type Locator, type Page } from '@playwright/test';

export async function focusFoundationSpecimenWithKeyboard(page: Page, target: string) {
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab');
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
