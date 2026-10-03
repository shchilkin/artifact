import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { budgetKeys, checkMeasurement, evaluate, matchesKey, staleExceptions, summaryTable } from './contract.mjs';
import { REFERENCE_DOCUMENTS } from './documents.mjs';

const readJson = (relative) => JSON.parse(readFileSync(new URL(`../../${relative}`, import.meta.url)));
const contract = readJson('docs/editor-ux/editor-ux-contract.json');
const baseline = readJson(contract.baselineFile);

const INTERACTIONS = ['select-layer', 'switch-to-nodes', 'switch-to-layers', 'open-add-library'];
const budgetOf = (metric) => contract.budgets.find((budget) => budget.metric === metric);
const allKeys = contract.budgets.flatMap((budget) => budgetKeys(contract, budget));

test('contract covers desktop and mobile for every reference document', () => {
  assert.deepEqual(contract.viewports.desktop, { width: 1440, height: 900 });
  assert.equal(contract.viewports.mobile.width, 375);
  assert.deepEqual(
    contract.documents,
    REFERENCE_DOCUMENTS.map((reference) => reference.name),
  );
});

test('layout shift is budgeted at 0.05 or less for every interaction on both viewports', () => {
  const budget = budgetOf('layoutShift');
  assert.ok(budget.max <= 0.05);
  assert.deepEqual(budget.subjects, INTERACTIONS);
  assert.deepEqual(budget.viewports, ['desktop', 'mobile']);
});

test('slider input-to-preview latency and node-preview settle time are budgeted', () => {
  for (const metric of ['inputToPreviewMs', 'durationMs', 'settleMs', 'entrySettleMs', 'sliderSettleMs']) {
    assert.ok(budgetOf(metric)?.max > 0, `${metric} has no budget`);
  }
});

test('latency is scaled to the baseline run, which is the reference machine', () => {
  assert.ok(contract.calibration.referenceMs > 0);
  assert.equal(baseline.environment.calibrationMs, contract.calibration.referenceMs);
  assert.equal(baseline.environment.speed, 1);
});

test('every budget names a unit, known viewports, subjects, and whether it is deterministic', () => {
  for (const budget of contract.budgets) {
    assert.ok(budget.unit, `${budget.metric} has no unit`);
    assert.equal(typeof budget.deterministic, 'boolean', `${budget.metric} does not say whether it is deterministic`);
    assert.ok(budget.subjects.length > 0, `${budget.metric} has no subjects`);
    for (const viewport of budget.viewports) assert.ok(contract.viewports[viewport], `unknown viewport ${viewport}`);
  }
  assert.equal(new Set(allKeys).size, allKeys.length, 'two budgets cover the same metric key');
});

test('every exception has an owning issue, a reason, a ceiling above the budget, and a budgeted metric', () => {
  for (const exception of contract.exceptions) {
    assert.match(exception.owner, /^#\d+$/, `${exception.key} has no owning issue`);
    assert.ok(exception.reason?.length > 20, `${exception.key} has no reason`);
    const matched = allKeys.filter((key) => matchesKey(exception.key, key));
    assert.ok(matched.length > 0, `${exception.key} matches no budgeted metric`);
    const budget = budgetOf(exception.key.split('/').at(-1));
    assert.ok(exception.max > budget.max, `${exception.key} ceiling is not above the budget`);
  }
  const patterns = contract.exceptions.map((exception) => exception.key);
  for (const key of allKeys) {
    assert.ok(patterns.filter((pattern) => matchesKey(pattern, key)).length <= 1, `${key} has two exceptions`);
  }
});

// The baseline records v0.49.0 before any v0.50 fix, so its values may exceed budgets whose exceptions later
// deliveries removed. It must still measure every budgeted metric.
test('the checked-in baseline measures every budgeted metric', () => {
  assert.deepEqual(baseline.viewports, contract.viewports);
  assert.deepEqual(baseline.documents, contract.documents);
  assert.deepEqual(
    checkMeasurement(contract, baseline).filter((violation) => violation.includes('not measured')),
    [],
  );
});

const fixtureContract = {
  documents: ['doc'],
  budgets: [
    {
      metric: 'layoutShift',
      max: 0.05,
      unit: 'score',
      deterministic: true,
      viewports: ['desktop'],
      subjects: ['a', 'b'],
    },
    { metric: 'settleMs', max: 100, unit: 'ms', deterministic: false, viewports: ['desktop'], subjects: ['drag'] },
  ],
  exceptions: [
    { key: 'desktop/*/b/layoutShift', max: 0.2, owner: '#1', reason: 'known shift' },
    { key: 'desktop/doc/drag/settleMs', max: 300, owner: '#2', reason: 'known latency' },
  ],
};
const fixtureMetrics = (overrides = {}) => ({
  metrics: {
    'desktop/doc/a/layoutShift': 0.01,
    'desktop/doc/b/layoutShift': 0.15,
    'desktop/doc/drag/settleMs': 250,
    ...overrides,
  },
});

test('values within budget or within an exception ceiling pass', () => {
  assert.deepEqual(checkMeasurement(fixtureContract, fixtureMetrics()), []);
  const statuses = evaluate(fixtureContract, fixtureMetrics()).map((row) => row.status);
  assert.deepEqual(statuses, ['ok', 'exception', 'exception']);
});

test('a value over budget without an exception fails and names the budget', () => {
  const violations = checkMeasurement(fixtureContract, fixtureMetrics({ 'desktop/doc/a/layoutShift': 0.3 }));
  assert.deepEqual(violations, ['desktop/doc/a/layoutShift: 0.3 score > budget 0.05 score [budgets[0] layoutShift]']);
});

test('a value over its exception ceiling fails and names the exception', () => {
  const violations = checkMeasurement(fixtureContract, fixtureMetrics({ 'desktop/doc/drag/settleMs': 301 }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /301 ms > exception ceiling 300 ms \(budget 100, owner #2\) \[exceptions\[1\]\]/);
});

test('a metric that was not measured fails', () => {
  const measurement = fixtureMetrics({ 'desktop/doc/a/layoutShift': null });
  assert.deepEqual(checkMeasurement(fixtureContract, measurement), [
    'desktop/doc/a/layoutShift: not measured [budgets[0] layoutShift]',
  ]);
});

test('an unneeded layout exception fails; an unneeded timing exception is only a notice', () => {
  const fixed = fixtureMetrics({ 'desktop/doc/b/layoutShift': 0, 'desktop/doc/drag/settleMs': 80 });
  const violations = checkMeasurement(fixtureContract, fixed);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^desktop\/\*\/b\/layoutShift: .* remove the exception \[exceptions\[0\]\]$/);
  const stale = staleExceptions(fixtureContract, evaluate(fixtureContract, fixed));
  assert.deepEqual(
    stale.map(({ exception }) => exception.owner),
    ['#1', '#2'],
  );
});

test('exception keys match whole segments only', () => {
  assert.ok(matchesKey('desktop/*/b/layoutShift', 'desktop/doc/b/layoutShift'));
  assert.ok(!matchesKey('desktop/*/b/layoutShift', 'mobile/doc/b/layoutShift'));
  assert.ok(!matchesKey('desktop/*/layoutShift', 'desktop/doc/b/layoutShift'));
});

test('the summary table lists every budgeted metric with its status', () => {
  const table = summaryTable(fixtureContract, fixtureMetrics({ 'desktop/doc/a/layoutShift': 0.3 }));
  assert.match(table, /\| `desktop\/doc\/a\/layoutShift` \| 0.3 \| 0.05 score \| OVER BUDGET \|/);
  assert.match(table, /\| `desktop\/doc\/b\/layoutShift` \| 0.15 \| 0.05 score \| exception #1 \(ceiling 0.2\) \|/);
});
