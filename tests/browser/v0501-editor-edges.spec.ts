import { expect, type Page, test } from '@playwright/test';
import {
  documentUrl,
  editorDocumentFixture,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  pressForwardTab,
  setupBrowserTestPage,
} from './helpers';

// v0.50.1 #446: honest `?doc` notices, no hidden Tab stops, a recoverable canvas error state,
// reduced-motion sheets and dialogs, and mobile meta that matches the app surface.
const linkDocument = editorDocumentFixture([fillLayerFixture({ id: 'edge-fill', name: 'Backdrop', color: '#2255cc' })]);

async function gotoEditorUrl(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached({ timeout: 20_000 });
}

declare global {
  interface Window {
    __failCanvasOnce?: boolean;
  }
}

/**
 * The canvas frame measures itself in an effect that observes `.canvas-wrapper`. A one-shot failure there stands
 * in for any render error inside the canvas error boundary.
 */
async function installCanvasFailureSwitch(page: Page) {
  await page.addInitScript(() => {
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeResizeObserver {
      observe(target: Element, options?: ResizeObserverOptions) {
        if (window.__failCanvasOnce && target.classList.contains('canvas-wrapper')) {
          window.__failCanvasOnce = false;
          throw new Error('Simulated canvas render failure');
        }
        super.observe(target, options);
      }
    };
  });
}

/** Changing the aspect is one undoable edit that re-runs the canvas frame effect. */
async function changeAspectWithCanvasFailure(page: Page) {
  await page.evaluate(() => {
    window.__failCanvasOnce = true;
  });
  await page.getByRole('button', { name: /change canvas aspect ratio/i }).click();
  await page.getByRole('menuitem', { name: /4:5.*Portrait/i }).click();
}

async function appTop(page: Page) {
  return page.locator('.editor-layout > .app').evaluate((element) => element.getBoundingClientRect().top);
}

test.describe('editor edges', () => {
  test.beforeEach(async ({ page }) => setupBrowserTestPage(page));

  test('a malformed ?doc link names the problem without shifting the editor', async ({ page }) => {
    await gotoEditorUrl(page, '/app');
    const plainTop = await appTop(page);

    await gotoEditorUrl(page, '/app?doc=%7Bbroken');
    const notice = page.getByRole('alert').filter({ hasText: "This link's document couldn't be read." });
    await expect(notice).toContainText(
      /This link's document couldn't be read\. Showing (the default|your last) canvas\./,
    );
    await expect(page.getByText('Loaded from')).toHaveCount(0);
    expect(await appTop(page)).toBe(plainTop);

    await page.evaluate(() => localStorage.clear());
    await gotoEditorUrl(page, '/app?doc=%7Bbroken');
    await expect(notice).toContainText("This link's document couldn't be read. Showing the default canvas.");

    await notice.getByRole('button', { name: 'Dismiss link notice' }).click();
    await expect(notice).toHaveCount(0);
    expectNoBrowserIssues(page);
  });

  test('?doc links say where they came from', async ({ page }) => {
    await gotoEditorUrl(page, documentUrl(linkDocument));
    await expect(page.getByRole('status').filter({ hasText: 'Opened from link.' })).toBeVisible();
    await expect(page.getByText('Loaded from')).toHaveCount(0);

    await gotoEditorUrl(page, `${documentUrl(linkDocument)}&from=docs`);
    await expect(page.getByRole('status').filter({ hasText: 'Loaded from docs.' })).toBeVisible();
    await expect(page).not.toHaveURL(/[?&](doc|from)=/);
    expectNoBrowserIssues(page);
  });

  test('none of the first 10 Tab stops on /app is hidden', async ({ page }) => {
    await gotoEditorUrl(page, '/app');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const stops: Array<{ label: string; visible: boolean }> = [];
    for (let index = 0; index < 10; index += 1) {
      await pressForwardTab(page);
      stops.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return { label: 'body', visible: false };
          const label = `${element.tagName.toLowerCase()}.${element.className} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 24) ?? ''}`;
          const isShown = (target: Element) => {
            const box = target.getBoundingClientRect();
            return (
              target.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
              box.width > 1 &&
              box.height > 1
            );
          };
          // A visually hidden control counts as visible when a close ancestor draws its focus ring
          // (layer rows outline themselves for their selection checkbox).
          const ringAncestor = (() => {
            let ancestor = element.parentElement;
            for (let depth = 0; ancestor && depth < 3; depth += 1, ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) return ancestor;
            }
            return null;
          })();
          const visible = isShown(element) || (ringAncestor !== null && isShown(ringAncestor));
          return { label, visible };
        }),
      );
    }
    expect(stops.filter((stop) => !stop.visible)).toEqual([]);
    expectNoBrowserIssues(page);
  });

  test('a canvas render error offers Undo and Retry, and Undo restores the canvas', async ({ page }) => {
    await installCanvasFailureSwitch(page);
    await gotoDocument(page, linkDocument);
    await expectLayerCanvasToHavePixels(page);

    await changeAspectWithCanvasFailure(page);

    const errorState = page.getByRole('alert').filter({ hasText: "The canvas couldn't render these layers." });
    await expect(errorState).toBeVisible();
    await expect(errorState.getByRole('button', { name: 'Retry' })).toBeEnabled();
    await errorState.getByRole('button', { name: 'Undo' }).click();

    await expect(errorState).toHaveCount(0);
    await expectLayerCanvasToHavePixels(page);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').global?.aspect))
      .toBe('1:1');
  });

  test('Retry renders the canvas again after a render error', async ({ page }) => {
    await installCanvasFailureSwitch(page);
    await gotoDocument(page, linkDocument);
    await changeAspectWithCanvasFailure(page);

    const errorState = page.getByRole('alert').filter({ hasText: "The canvas couldn't render these layers." });
    await errorState.getByRole('button', { name: 'Retry' }).click();
    await expect(errorState).toHaveCount(0);
    await expectLayerCanvasToHavePixels(page);
  });

  test('with reduced motion, sheets and dialogs open without running animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoDocument(page, linkDocument);
    // Only animations on the opened sheet or dialog (and its overlay) count; the canvas keeps its own progress bar.
    const longAnimations = () =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running')
          .map((animation) => {
            const duration = Number(animation.effect?.getComputedTiming().duration ?? 0);
            const target = (animation.effect as KeyframeEffect | null)?.target ?? null;
            return { duration, target };
          })
          .filter(
            ({ duration, target }) =>
              duration > 10 &&
              target?.closest(
                '[role="dialog"], [role="alertdialog"], .artifact-sheet-overlay, .artifact-dialog-overlay',
              ),
          )
          .map(({ duration, target }) => ({ duration, target: target?.className ?? '' })),
      );

    await page.getByRole('button', { name: /^Projects\./ }).click();
    await expect(page.getByRole('dialog', { name: /projects/i })).toBeVisible();
    expect(await longAnimations()).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /projects/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Create new project' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await longAnimations()).toEqual([]);
    await page.keyboard.press('Escape');
    expectNoBrowserIssues(page);
  });

  test('mobile meta matches the app surface', async ({ page }) => {
    await gotoEditorUrl(page, '/app');
    const meta = await page.evaluate(() => {
      const toRgb = (color: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) return [];
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const surfaceApp = getComputedStyle(document.documentElement).getPropertyValue('--surface-app').trim();
      const probe = document.createElement('div');
      probe.style.color = surfaceApp;
      document.body.append(probe);
      const surfaceColor = getComputedStyle(probe).color;
      probe.remove();
      return {
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
        themeColor: toRgb(document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? ''),
        surfaceApp: toRgb(surfaceColor),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        colorSchemeMeta: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
      };
    });

    expect(meta.viewport).toContain('viewport-fit=cover');
    expect(meta.themeColor).toHaveLength(3);
    meta.themeColor.forEach((channel, index) => {
      expect(Math.abs(channel - (meta.surfaceApp[index] ?? -99))).toBeLessThanOrEqual(1);
    });
    expect(meta.colorScheme).toBe('dark');
    expect(meta.colorSchemeMeta).toBe('dark');
  });
});
