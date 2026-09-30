#!/usr/bin/env node
// Route-loading gate: builds the production web app with client source maps, measures every contract state
// in Chromium (scripts/loading/route-loading-baseline.mjs), and fails on any violation of
// docs/loading/route-loading-contract.json.
//
//   npm run loading:gate                      # build, measure, check
//   npm run loading:gate -- --skip-build      # reuse apps/web/build (must be built with --sourcemapClient)
//   npm run loading:gate -- --measurement f   # check an existing measurement only
//
// The measurement is written to apps/web/build/route-loading.json (CI uploads it as an artifact). When
// GITHUB_STEP_SUMMARY is set, a budget table and any violations are appended to the job summary.

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { checkMeasurement, summaryTable } from './contract.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = process.argv.slice(2);
const measurementIndex = args.indexOf('--measurement');
const measurementPath = measurementIndex >= 0 ? args[measurementIndex + 1] : 'apps/web/build/route-loading.json';

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (measurementIndex < 0) {
  if (!args.includes('--skip-build')) {
    run(npm, ['--workspace', '@artifact/web', 'run', 'build', '--', '--sourcemapClient']);
  }
  run(process.execPath, ['scripts/loading/route-loading-baseline.mjs', '--out', measurementPath]);
}

const contract = JSON.parse(readFileSync('docs/loading/route-loading-contract.json', 'utf8'));
const measurement = JSON.parse(readFileSync(measurementPath, 'utf8'));
const violations = checkMeasurement(contract, measurement);
const table = summaryTable(contract, measurement);

console.log(`\nRoute loading (${measurementPath}), gzip KiB against docs/loading/route-loading-contract.json:\n`);
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  const failures = violations.map((violation) => `- ${violation}`).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Route loading gate\n\n${table}\n\n${violations.length ? `### Violations\n\n${failures}\n` : 'No violations.\n'}`,
  );
}

if (violations.length) {
  console.error(`\nRoute loading gate failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    '\nFix the regression, or review an intentional change as one update to docs/loading/route-loading-contract.json and docs/loading/route-loading-matrix.md.',
  );
  process.exit(1);
}
console.log('\nRoute loading gate passed.');
