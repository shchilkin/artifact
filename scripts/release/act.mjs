// Mutations are separate from verification. Only the protected workflow calls this entry point.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease } from '../verify-release.mjs';

const archiveInspector = fileURLToPath(new URL('./archive-contents.mjs', import.meta.url));

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function verifyDraftAsset(run, root, tag, asset) {
  const local = path.join(root, 'release-artifacts', asset);
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'artifact-publish-'));
  const downloadDirectory = path.join(workspace, 'download');
  mkdirSync(downloadDirectory);
  try {
    run('gh', ['release', 'download', tag, '--pattern', asset, '--dir', downloadDirectory]);
    const attached = path.join(downloadDirectory, asset);
    if (asset === 'Artifact-macOS.zip') {
      // Inspect ZIP entries without extracting an untrusted draft attachment.
      // Container timestamps may differ; paths, modes and app bytes may not.
      assert.deepEqual(
        JSON.parse(run('node', [archiveInspector, attached])),
        JSON.parse(run('node', [archiveInspector, local])),
        `Draft ${asset} differs from verified app contents`,
      );
    } else {
      assert.equal(sha256(attached), sha256(local), `Draft ${asset} differs from verified artifact`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function performRelease(
  root,
  options,
  run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim(),
) {
  assert.ok(
    ['tag-and-create-draft', 'create-draft', 'publish-draft'].includes(options.action),
    'Not a publication action',
  );
  const git = (args) => run('git', args);
  assert.equal(git(['symbolic-ref', '--short', 'HEAD']), 'main', 'Production releases must run from main');
  assert.equal(git(['status', '--porcelain']), '', 'Release worktree must be clean');
  const plan = verifyRelease(root, options, git);
  const asset =
    plan.component === 'macos' ? 'Artifact-macOS.zip' : plan.component === 'web' ? 'build-identity.json' : null;
  if (asset) assert.ok(existsSync(path.join(root, 'release-artifacts', asset)), `Missing verified ${asset}`);
  let release;
  // API errors must fail closed; listing drafts avoids treating auth/network errors as absence.
  const releases = JSON.parse(
    run('gh', ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/releases?per_page=100']),
  ).flat();
  release = releases.find((entry) => entry.tag_name === plan.tag);
  if (options.action === 'publish-draft') {
    assert.equal(release?.draft, true, 'Publication requires an existing draft');
    if (asset)
      assert.ok(
        release.assets.some((entry) => entry.name === asset),
        `Draft is missing ${asset}`,
      );
    assert.equal(
      release.body.trim(),
      run('git', ['show', `HEAD:${plan.notes}`]).trim(),
      'Draft body differs from verified release notes',
    );
    if (asset) verifyDraftAsset(run, root, plan.tag, asset);
    run('gh', ['release', 'edit', plan.tag, '--draft=false', '--latest=false']);
  } else {
    assert.ok(!release, 'Release already exists');
    if (options.action === 'tag-and-create-draft') {
      run('git', ['tag', '-a', plan.tag, '-m', plan.tag]);
      run('git', ['push', 'origin', `refs/tags/${plan.tag}`]);
    }
    run('gh', [
      'release',
      'create',
      plan.tag,
      '--draft',
      '--verify-tag',
      '--title',
      plan.tag,
      '--notes-file',
      plan.notes,
      '--latest=false',
      ...(asset ? [`release-artifacts/${asset}`] : []),
    ]);
  }
  return plan;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  performRelease(process.cwd(), {
    component: process.env.RELEASE_COMPONENT,
    version: process.env.RELEASE_VERSION,
    action: process.env.RELEASE_ACTION,
  });
}
