import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const root = new URL('../../', import.meta.url);

describe('production deployment configuration', () => {
  it('keeps the CI contract expectation aligned with the shared API contract', async () => {
    const [releaseWorkflow, sharedContract] = await Promise.all([
      readFile(new URL('.github/workflows/release.yml', root), 'utf8'),
      readFile(new URL('packages/shared/src/index.ts', root), 'utf8'),
    ]);
    const workflowVersion = releaseWorkflow.match(/EXPECTED_API_CONTRACT_VERSION: "(\d+)"/)?.[1];
    const sharedVersion = sharedContract.match(/ARTIFACT_API_CONTRACT_VERSION = (\d+) as const/)?.[1];

    assert.ok(workflowVersion, 'Release workflow must declare EXPECTED_API_CONTRACT_VERSION');
    assert.ok(sharedVersion, 'Shared package must declare ARTIFACT_API_CONTRACT_VERSION');
    assert.equal(workflowVersion, sharedVersion);
  });

  it('keeps automatic Vercel production deploys disabled for release branches', async () => {
    const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
    assert.equal(config.git?.deploymentEnabled?.development, false);
    assert.equal(config.git?.deploymentEnabled?.main, false);
  });

  it('keeps production deployment behind the release gate and promotes web last', async () => {
    const releaseWorkflow = await readFile(new URL('.github/workflows/release.yml', root), 'utf8');
    const stagedWeb = releaseWorkflow.indexOf('Deploy staged web without production domains');
    const deployVps = releaseWorkflow.indexOf('Deploy VPS stack from the verified commit');
    const verifyApi = releaseWorkflow.indexOf('Verify production API revision and contract');
    const promoteWeb = releaseWorkflow.indexOf('Promote staged web deployment');

    assert.match(releaseWorkflow, /deploy-production:\n[\s\S]*?needs: gate/);
    assert.match(releaseWorkflow, /--gate new-only/);
    assert.doesNotMatch(releaseWorkflow, /--gate all/);
    assert.ok(stagedWeb < deployVps, 'Vercel must be staged before the VPS changes');
    assert.ok(deployVps < verifyApi, 'The public API must be checked after the VPS changes');
    assert.ok(verifyApi < promoteWeb, 'Vercel must be promoted only after the API passes verification');
  });

  it('requires the release tag to exist before production deployment', async () => {
    const releaseWorkflow = await readFile(new URL('.github/workflows/release.yml', root), 'utf8');

    assert.match(
      releaseWorkflow,
      /create-draft\|publish-draft\|deploy-production\)\n\s+tag_policy=\(--require-existing-tag\)/,
    );
    assert.doesNotMatch(releaseWorkflow, /verify\|tag-and-create-draft\|deploy-production\)/);
  });

  it('embeds the verified commit and authenticates staged Vercel verification', async () => {
    const releaseWorkflow = await readFile(new URL('.github/workflows/release.yml', root), 'utf8');
    const buildStep = releaseWorkflow.match(/- name: Build staged web deployment\n([\s\S]*?)(?=\n\s+- name:)/)?.[1];
    const verifyStep = releaseWorkflow.match(/- name: Verify staged web deployment\n([\s\S]*?)(?=\n\s+- name:)/)?.[1];

    assert.ok(buildStep, 'Release workflow must build the staged Vercel deployment');
    assert.match(buildStep, /VITE_APP_COMMIT: \$\{\{ github\.sha \}\}/);
    assert.ok(verifyStep, 'Release workflow must verify the staged Vercel deployment');
    assert.match(verifyStep, /vercel curl \/ --deployment "\$\{STAGED_WEB_URL\}"/);
    assert.match(verifyStep, /WEB_DEPLOYMENT_HTML_PATH=/);
  });

  it('keeps standalone image publishing manual and behind its quality job', async () => {
    const workflow = await readFile(new URL('.github/workflows/container-images.yml', root), 'utf8');

    assert.doesNotMatch(workflow, /^\s{2}push:/m);
    assert.match(workflow, /build:\n[\s\S]*?needs: quality/);
  });

  it('expands the CI container matrix only after the explicit prerequisite gate', async () => {
    const workflow = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');
    const gateStart = workflow.indexOf('  container-gate:');
    const matrixStart = workflow.indexOf('  container-images:');

    assert.ok(gateStart >= 0, 'CI must define a non-matrix container gate');
    assert.ok(matrixStart > gateStart, 'The container matrix must follow the prerequisite gate');
    assert.match(workflow, /container-gate:\n[\s\S]*?needs: \[quality, browser-changes, browser, container-changes\]/);
    assert.match(workflow, /should_build: \$\{\{ steps\.gate\.outputs\.should_build \}\}/);
    assert.match(
      workflow,
      /container-images:\n[\s\S]*?needs: container-gate\n\s+if: needs\.container-gate\.outputs\.should_build == 'true'/,
    );
  });
});
