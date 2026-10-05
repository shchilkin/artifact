#!/usr/bin/env node
// Editor UX gate: builds the production web app, measures layout stability and edit latency in Chromium
// (scripts/editor-ux/measure.mjs), and fails on any violation of docs/editor-ux/editor-ux-contract.json.
//
//   npm run ux:gate                      # build, measure, check
//   npm run ux:gate -- --skip-build      # reuse apps/web/build
//   npm run ux:gate -- --measurement f   # check an existing measurement only
//
// The measurement is written to apps/web/build/editor-ux.json (CI uploads it as an artifact). When
// GITHUB_STEP_SUMMARY is set, the budget table and any violations are appended to the job summary.

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { checkMeasurement, evaluate, staleExceptions, summaryTable } from './contract.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = process.argv.slice(2);
const measurementIndex = args.indexOf('--measurement');
const measurementPath = measurementIndex >= 0 ? args[measurementIndex + 1] : 'apps/web/build/editor-ux.json';

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (measurementIndex < 0) {
  if (!args.includes('--skip-build')) run(npm, ['--workspace', '@artifact/web', 'run', 'build']);
  run(process.execPath, ['scripts/editor-ux/measure.mjs', '--out', measurementPath]);
}

const contract = JSON.parse(readFileSync('docs/editor-ux/editor-ux-contract.json', 'utf8'));
const measurement = JSON.parse(readFileSync(measurementPath, 'utf8'));
const violations = checkMeasurement(contract, measurement);
const table = summaryTable(contract, measurement);
// Latency budgets are defined for the CI runner, so an unused latency exception only means something there.
const notices = (measurement.environment?.ci ? staleExceptions(contract, evaluate(contract, measurement)) : [])
  .filter(({ exception }) => !exception.deterministic)
  .map(({ exception }) => `${exception.key}: within budget in this run; exception ${exception.owner} may be removable`);

console.log(`\nEditor UX (${measurementPath}) against docs/editor-ux/editor-ux-contract.json:\n`);
console.log(table);
for (const notice of notices) console.log(`\nNotice: ${notice}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const list = (items) => items.map((item) => `- ${item}`).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Editor UX gate\n\n${table}\n\n${violations.length ? `### Violations\n\n${list(violations)}\n` : 'No violations.\n'}${notices.length ? `\n### Notices\n\n${list(notices)}\n` : ''}`,
  );
}

if (violations.length) {
  console.error(`\nEditor UX gate failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    '\nFix the regression, or review an intentional change as one update to docs/editor-ux/editor-ux-contract.json and docs/editor-ux/editor-ux-baseline.md.',
  );
  process.exit(1);
}
console.log('\nEditor UX gate passed.');
