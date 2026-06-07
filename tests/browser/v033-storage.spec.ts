import { expect, type Locator, type Page, test } from '@playwright/test';

import { clickEditorControl, expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test('v0.34 Projects shows work state first and keeps storage diagnostics collapsed', async ({ page }) => {
  await page.goto('/app?new=blank');

  await expect(page.getByLabel('Local workspace warning')).toHaveCount(0);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await expect(projects).toBeVisible();
  await expectSaveFormToAlign(projects);
  await expect(projects).toContainText('Not saved as project');
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

test('v0.34 active project save updates the current project after edits', async ({ page }) => {
  await page.goto('/app?new=blank');

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await projects.getByLabel('Project name').fill('Saved State Smoke');
  await projects.getByRole('button', { name: 'CREATE PROJECT' }).click();
  await expect(projects).toContainText('Saved in project');
  await expect(projects.getByRole('button', { name: 'Load Saved State Smoke' })).toHaveCount(1);
  await expect(projects.getByRole('button', { name: 'Save active project Saved State Smoke' })).toBeDisabled();

  await projects.getByLabel('Project name').fill('Saved State Renamed');
  await expect(projects.getByRole('button', { name: 'Save active project Saved State Renamed' })).toBeEnabled();
  await projects.getByRole('button', { name: 'Save active project Saved State Renamed' }).click();
  await expect(projects.getByRole('button', { name: 'Load Saved State Renamed' })).toHaveCount(1);
  await expect(projects.getByRole('button', { name: 'Load Saved State Smoke' })).toHaveCount(0);
  await expect(projects.getByRole('button', { name: 'Save active project Saved State Renamed' })).toBeDisabled();

  await projects.getByRole('button', { name: 'Close projects' }).click();
  await page.locator('main .bottom-bar .rand-btn').click();
  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toContainText('Unsaved changes');
  await expect(page.getByRole('button', { name: 'Save active project Saved State Renamed' })).toBeEnabled();

  await page.getByRole('button', { name: 'Save active project Saved State Renamed' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toContainText('Saved in project');
  await expect(page.getByRole('button', { name: 'Load Saved State Renamed' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save active project Saved State Renamed' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save copy of Saved State Renamed' }).click();
  await expect(page.getByRole('button', { name: 'Load Saved State Renamed copy' })).toHaveCount(1);
  await expectNoBrowserIssues(page);
});

test('v0.34 local workspace stays usable in node mode with healthy active work', async ({ page }) => {
  await page.goto('/app?new=blank');

  await page.getByRole('tab', { name: 'Switch to nodes view' }).click();
  await assertNoSaveOrStorageDanger(page);
  await clickEditorControl(page.getByRole('button', { name: 'Add node' }));
  await expect(page.locator('.add-library-node-menu')).toBeVisible();
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
  const inputBox = await projects.locator('.project-name-field').boundingBox();
  const saveBox = await projects.getByRole('button', { name: 'CREATE PROJECT' }).boundingBox();

  expect(inputBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(Math.abs((inputBox?.y ?? 0) - (saveBox?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((inputBox?.height ?? 0) - (saveBox?.height ?? 0))).toBeLessThanOrEqual(1);
}

async function assertNoSaveOrStorageDanger(page: Page) {
  const warning = page.getByLabel('Local workspace warning');
  if ((await warning.count()) === 0) return;
  await expect(warning).not.toContainText(/Autosave blocked|Storage needs attention/);
}
