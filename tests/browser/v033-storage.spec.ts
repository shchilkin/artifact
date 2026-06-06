import { expect, type Locator, test } from '@playwright/test';

import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test('v0.33 Projects shows work state first and keeps storage diagnostics collapsed', async ({ page }) => {
  await page.goto('/app?new=blank');

  await expect(page.getByLabel('Local workspace warning')).toHaveCount(0);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await expect(projects).toBeVisible();
  await expectSaveFormToAlign(projects);
  await expect(projects).toContainText('Unsaved changes');
  await expect(projects.getByText('Browser storage')).toBeHidden();
  await expect(projects.getByText('Offline app')).toBeHidden();
  await projects.getByText('Storage details').click();
  await expect(projects.getByText('Browser storage')).toBeVisible();
  await expect(projects.getByText('Offline app')).toBeVisible();
  await expect(projects.getByRole('button', { name: 'Create new project from projects' })).toHaveClass(
    /project-new-blank-action/,
  );
  await expectNoBrowserIssues(page);
});

test('v0.33 project snapshot state switches from saved snapshot back to unsaved changes after edits', async ({
  page,
}) => {
  await page.goto('/app?new=blank');

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await projects.getByLabel('Snapshot name').fill('Saved State Smoke');
  await projects.getByRole('button', { name: 'SAVE SNAPSHOT' }).click();
  await expect(projects).toContainText('Snapshot saved');

  await projects.getByRole('button', { name: 'Close projects' }).click();
  await page.locator('main .bottom-bar .rand-btn').click();
  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toContainText('Unsaved changes');
  await expectNoBrowserIssues(page);
});

test('v0.33 local workspace warning stays out of node mode when healthy', async ({ page }) => {
  await page.goto('/app?new=blank');

  await page.getByRole('tab', { name: 'Switch to nodes view' }).click();
  await expect(page.getByLabel('Local workspace warning')).toHaveCount(0);
  await expectNoBrowserIssues(page);
});

test('v0.33 pwa assets are served for install and app shell support', async ({ page }) => {
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  await expect(manifest.json()).resolves.toMatchObject({
    name: 'Artifact Cover Editor',
    short_name: 'Artifact',
    start_url: '/app',
    display: 'standalone',
  });

  const serviceWorker = await page.request.get('/sw.js');
  expect(serviceWorker.ok()).toBe(true);
  expect(await serviceWorker.text()).toContain('artifact-v0.33.0-shell');
});

async function expectSaveFormToAlign(projects: Locator) {
  const inputBox = await projects.getByLabel('Snapshot name').boundingBox();
  const saveBox = await projects.getByRole('button', { name: 'SAVE SNAPSHOT' }).boundingBox();

  expect(inputBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(Math.abs((inputBox?.y ?? 0) - (saveBox?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((inputBox?.height ?? 0) - (saveBox?.height ?? 0))).toBeLessThanOrEqual(1);
}
