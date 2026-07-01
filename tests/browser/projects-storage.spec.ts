import { expect, type Locator, type Page, test } from '@playwright/test';

import { clickEditorControl, expectNoBrowserIssues, setupBrowserTestPage, switchToNodeView } from './helpers';

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test('Projects panel shows work state first and keeps storage diagnostics collapsed', async ({ page }) => {
  await page.goto('/app?new=blank');

  await expect(page.getByLabel('Local workspace warning')).toHaveCount(0);

  const projects = await openProjectsPanel(page);
  await expectSaveFormToAlign(projects);
  await expect(projects).toContainText('Projects save editable work in this browser');
  await expect(projects).toContainText('Local draft');
  await expect(projects.getByText('Local storage')).toBeHidden();
  await expect(projects.getByText('Offline app')).toBeHidden();
  await projects.getByText('Storage details').click();
  await expect(projects.getByText('Local storage')).toBeVisible();
  await expect(projects.getByText('Offline app')).toBeVisible();
  await expect(projects.getByRole('button', { name: 'Create new project from projects' })).toHaveClass(
    /project-new-blank-action/,
  );
  await expectNoBrowserIssues(page);
});

test('active project save updates the current project after edits', async ({ page }) => {
  const projects = await createNamedProject(page, 'Saved State Smoke');
  await expect(projects).toContainText('Saved project');
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
  await openProjectsPanel(page);
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toContainText('Unsaved project');
  await expect(page.getByRole('button', { name: 'Save active project Saved State Renamed' })).toBeEnabled();

  await page.getByRole('button', { name: 'Save active project Saved State Renamed' }).click();
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toContainText('Saved project');
  await expect(page.getByRole('button', { name: 'Load Saved State Renamed' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save active project Saved State Renamed' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save copy of Saved State Renamed' }).click();
  await expect(page.getByRole('button', { name: 'Load Saved State Renamed copy' })).toHaveCount(1);
  await expectNoBrowserIssues(page);
});

test('dedicated Projects page opens local projects back in the editor', async ({ page }) => {
  const projects = await createNamedProject(page, 'Projects Page Smoke');
  await expect(projects).toContainText('Saved project');

  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.locator('.projects-page-header')).toHaveCSS('border-bottom-width', '0px');
  await expect(
    page.getByRole('navigation', { name: 'Site navigation' }).getByRole('link', { name: 'Projects' }),
  ).toBeVisible();
  await expect(page.getByLabel('Projects summary')).toContainText('1 saved project');
  await expect(page.getByLabel('Projects summary')).not.toContainText('/ 30');
  await expect(page.getByText('Data')).toHaveCount(0);
  const localProjects = page.getByRole('region', { name: 'Local projects' });
  await expect(localProjects).toContainText('Projects Page Smoke', {
    timeout: 15_000,
  });
  await expect(localProjects.getByRole('img', { name: 'Projects Page Smoke' })).toHaveJSProperty('naturalWidth', 1080);
  await expect(localProjects.getByText('LOAD')).toHaveCount(0);
  await expect(localProjects.getByText('DEL')).toHaveCount(0);
  await expect(localProjects.getByText('ACTIVE', { exact: true })).toBeVisible();
  await localProjects.getByRole('button', { name: 'Project actions for Projects Page Smoke' }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete project' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete project' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete project?' })).toBeVisible();
  await page.getByRole('button', { name: 'CANCEL' }).click();
  await localProjects.getByRole('button', { name: 'Load Projects Page Smoke' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await openProjectsPanel(page);
  await expect(page.getByRole('dialog', { name: 'PROJECTS' })).toContainText('Saved project');
  await expect(page.getByRole('button', { name: 'Save active project Projects Page Smoke' })).toBeDisabled();
  await expectNoBrowserIssues(page);
});

test('local workspace stays usable in node mode with healthy active work', async ({ page }) => {
  await page.goto('/app?new=blank');

  await switchToNodeView(page);
  await assertNoSaveOrStorageDanger(page);
  await clickEditorControl(page.getByRole('button', { name: 'Add node' }));
  await expect(page.locator('.add-library-node-menu')).toBeVisible();
  await expectNoBrowserIssues(page);
});

test('PWA assets are served for install and app shell support', async ({ page }) => {
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

async function createNamedProject(page: Page, name: string) {
  await page.goto('/app?new=blank');
  const projects = await openProjectsPanel(page);
  await projects.getByLabel('Project name').fill(name);
  await projects.getByRole('button', { name: 'CREATE PROJECT' }).click();
  return projects;
}

async function openProjectsPanel(page: Page) {
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached({ timeout: 15_000 });
  await clickEditorControl(page.locator('.project-workspace-button').first());
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await expect(projects).toBeVisible({ timeout: 15_000 });
  return projects;
}
