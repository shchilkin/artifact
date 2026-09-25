#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readText, releasePlan, verifyVersions } from './release/components.mjs';

export function verifyRelease(
  root,
  { component, version, action = 'verify', skipTagCheck = false },
  git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
) {
  assert.ok(!skipTagCheck || action === 'verify', 'Tag checks may only be skipped for verification');
  const versions = verifyVersions(root);
  const plan = releasePlan(component, version ?? versions[component], action);
  assert.equal(plan.version, versions[component], `${component} metadata does not match requested release`);
  const notes = readText(root, plan.notes);
  for (const heading of [
    `# ${plan.tag} Release Notes`,
    '## Highlights',
    '## Scope Boundaries',
    '## Compatibility',
    '## Validation',
    '## Manual QA',
    '## Accepted Risks',
  ]) {
    assert.ok(notes.includes(heading), `${plan.notes} is missing ${heading}`);
    const section = notes.split(heading)[1]?.split(/\n## /)[0].trim();
    assert.ok(section, `${heading} must be filled`);
  }
  assert.ok(
    !/\[(?:TODO|TBD|release name|YYYY-MM-DD|scope item|describe\b|record\b|Manual check|Known risk|N\] passed)[^\]\n]*\]/i.test(
      notes,
    ),
    'Release notes contain template placeholders',
  );
  assert.ok(
    !/Internal release checklist|Internal maintenance notes|^- \[[ xX]\]/im.test(notes),
    'Release notes contain internal checklist',
  );
  const versionPlan = readText(root, plan.versionPlan);
  assert.ok(!/- \[ \]/.test(versionPlan), `${plan.versionPlan} has incomplete acceptance criteria`);
  assert.match(
    versionPlan,
    /^Status: (?:release-ready|released)\.?$/m,
    'Version plan must be release-ready or released',
  );
  assert.ok(
    readText(root, 'docs/production-readiness.md').includes(`### ${plan.tag} Release Prep`),
    'Missing component release prep entry',
  );
  assert.ok(readText(root, 'docs/roadmap.md').includes(plan.tag), 'Missing component roadmap status');
  if (!skipTagCheck) {
    let taggedSha;
    try {
      taggedSha = git(['rev-parse', '--verify', `refs/tags/${plan.tag}^{commit}`]);
    } catch {
      /* absent tag */
    }
    if (plan.requiresTag) {
      assert.ok(taggedSha, `Expected release tag ${plan.tag} to exist`);
      assert.equal(taggedSha, git(['rev-parse', 'HEAD']), 'Release tag must resolve to the exact checked commit');
    } else {
      assert.ok(!taggedSha, `Release tag ${plan.tag} already exists`);
    }
  }
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      component: { type: 'string' },
      version: { type: 'string' },
      action: { type: 'string', default: 'verify' },
      'metadata-only': { type: 'boolean' },
      'skip-tag-check': { type: 'boolean' },
    },
  });
  if (values['metadata-only'] || !values.component) {
    assert.ok(!values.version && values.action === 'verify', '--component is required for a release action/version');
    console.log(JSON.stringify({ metadata: verifyVersions(process.cwd()) }, null, 2));
  } else {
    assert.ok(
      !values['skip-tag-check'] || values.action === 'verify',
      'Tag checks may only be skipped for verification',
    );
    console.log(
      JSON.stringify(verifyRelease(process.cwd(), { ...values, skipTagCheck: values['skip-tag-check'] }), null, 2),
    );
  }
}
