#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const options = new Set();
const values = new Map();

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) {
    throw new Error(`Unknown argument: ${arg}`);
  }

  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    values.set(arg, next);
    index += 1;
  } else {
    options.add(arg);
  }
}

const readJson = (filePath) => {
  return JSON.parse(readFileSync(path.join(ROOT, filePath), 'utf8'));
};

const readText = (filePath) => {
  return readFileSync(path.join(ROOT, filePath), 'utf8');
};

const fail = (message) => {
  throw new Error(message);
};

const gitTagExists = (tag) => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};

const rootPackage = readJson('package.json');
const webPackage = readJson('apps/web/package.json');
const packageLock = readJson('package-lock.json');
const version = values.get('--version') ?? rootPackage.version;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`Release version must look like X.Y.Z. Received: ${version}`);
}

const majorMinor = version.split('.').slice(0, 2).join('.');
const tag = `v${version}`;
const releaseNotesPath = `docs/releases/${tag}.md`;
const versionPlanPath = `docs/version-plans/v${majorMinor}.md`;

const packageVersions = [
  ['package.json', rootPackage.version],
  ['apps/web/package.json', webPackage.version],
  ['package-lock.json root package', packageLock.packages?.['']?.version],
  ['package-lock.json apps/web package', packageLock.packages?.['apps/web']?.version],
];

for (const [label, packageVersion] of packageVersions) {
  if (packageVersion !== version) {
    fail(`${label} is ${packageVersion ?? 'missing'}, expected ${version}`);
  }
}

if (!existsSync(path.join(ROOT, releaseNotesPath))) {
  fail(`Missing release notes: ${releaseNotesPath}`);
}

if (!existsSync(path.join(ROOT, versionPlanPath))) {
  fail(`Missing active version plan: ${versionPlanPath}`);
}

const releaseNotes = readText(releaseNotesPath);
const versionPlan = readText(versionPlanPath);
const productionReadiness = readText('docs/production-readiness.md');
const roadmap = readText('docs/roadmap.md');

const requiredReleaseSections = [
  `# ${tag} Release Notes`,
  '## Highlights',
  '## Scope Boundaries',
  '## Validation',
  '## Manual QA',
  '## Accepted Risks',
];

for (const section of requiredReleaseSections) {
  if (!releaseNotes.includes(section)) {
    fail(`${releaseNotesPath} is missing required section: ${section}`);
  }
}

const templatePlaceholders = [
  '[release name]',
  '[One or two sentences',
  '[state the main boundary',
  '[User-visible',
  '[scope item]',
  '[explicitly deferred item]',
  '[YYYY-MM-DD]',
  '[N] passed',
  '[Manual check',
  '[Known risk',
];

for (const placeholder of templatePlaceholders) {
  if (releaseNotes.includes(placeholder)) {
    fail(`${releaseNotesPath} still contains template placeholder: ${placeholder}`);
  }
}

const forbiddenReleaseNotesPatterns = [/Internal release checklist/i, /Internal maintenance notes/i, /^- \[[ xX]\]/m];

for (const pattern of forbiddenReleaseNotesPatterns) {
  if (pattern.test(releaseNotes)) {
    fail(`${releaseNotesPath} contains internal checklist or maintenance notes`);
  }
}

if (versionPlan.includes('- [ ]')) {
  fail(`${versionPlanPath} still has unchecked release-plan items`);
}

if (!productionReadiness.includes(`### ${tag} Release Prep`)) {
  fail(`docs/production-readiness.md is missing release prep entry for ${tag}`);
}

if (!roadmap.includes(`v${majorMinor}`)) {
  fail(`docs/roadmap.md does not mention v${majorMinor}`);
}

if (!options.has('--skip-tag-check')) {
  const tagExists = gitTagExists(tag);
  if (options.has('--require-existing-tag') && !tagExists) {
    fail(`Expected release tag ${tag} to exist`);
  }
  if (!options.has('--require-existing-tag') && !options.has('--allow-existing-tag') && tagExists) {
    fail(`Release tag ${tag} already exists`);
  }
}

console.log(`Release metadata verified for ${tag}`);
