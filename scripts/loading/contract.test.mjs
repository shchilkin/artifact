import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (relative) => JSON.parse(readFileSync(new URL(`../../${relative}`, import.meta.url)));
const contract = readJson('docs/loading/route-loading-contract.json');
const baselineV0481 = readJson(contract.baselineFile);
const current = readJson(contract.currentFile);

const REQUIRED_STATES = [
  'home',
  'docs',
  'account-recovery',
  'projects',
  'editor-layers-blank',
  'editor-nodes',
  'style-guide',
  'first-3d-activation',
];

const statesByName = new Map(contract.states.map((state) => [state.state, state]));
const knownFamilies = new Set(Object.keys(contract.families));
const kib = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const initialRules = (state) => (state.initial.sameAs ? statesByName.get(state.initial.sameAs).initial : state.initial);
const familiesOf = (summary) => new Set(summary.assets.flatMap((asset) => asset.families ?? []));

/** What a route loads before it renders: the first visit minus files dynamically imported afterwards. */
function staticLoad(measured) {
  const after = new Set(measured.afterRender.js.assets.map((a) => a.name));
  const afterCss = new Set(measured.afterRender.css.assets.map((a) => a.name));
  const js = measured.initial.js.assets.filter((a) => !after.has(a.name));
  const css = measured.initial.css.assets.filter((a) => !afterCss.has(a.name));
  const gzip = (assets) => kib(assets.reduce((sum, a) => sum + a.gzip, 0));
  return { jsGzipKiB: gzip(js), cssGzipKiB: gzip(css), families: new Set(js.flatMap((a) => a.families ?? [])) };
}

test('contract covers every representative route and activation state', () => {
  assert.deepEqual([...statesByName.keys()].sort(), [...REQUIRED_STATES].sort());
});

test('every state names an owner, a delivery mode, budgets, and known families', () => {
  for (const state of contract.states) {
    assert.ok(state.owner?.shell, `${state.state} has no owning shell`);
    assert.ok(['prerender', 'spa-fallback'].includes(state.delivery), `${state.state} has no delivery mode`);
    const initial = initialRules(state);
    assert.ok(initial.budget.jsGzipKiB > 0 && initial.budget.cssGzipKiB > 0, `${state.state} has no initial budget`);
    for (const family of initial.prohibitedFamilies) assert.ok(knownFamilies.has(family), `unknown family ${family}`);
    for (const family of state.activation?.allowedFamilies ?? []) {
      assert.ok(knownFamilies.has(family), `unknown family ${family}`);
    }
    if (state.activation) assert.ok(state.activation.trigger, `${state.state} activation has no trigger`);
  }
});

test('v0.48.1 reference numbers match the checked-in reference measurement', () => {
  for (const state of contract.states) {
    const measured = baselineV0481.browser[state.state];
    if (state.initial.baselineV0481) {
      assert.equal(state.initial.baselineV0481.jsGzipKiB, kib(measured.initial.js.total.gzip), `${state.state} JS`);
      assert.equal(state.initial.baselineV0481.cssGzipKiB, kib(measured.initial.css.total.gzip), `${state.state} CSS`);
    }
    if (state.activation?.baselineV0481) {
      assert.equal(state.activation.baselineV0481.jsGzipKiB, kib(measured.activation.js.total.gzip));
      assert.equal(state.activation.baselineV0481.cssGzipKiB, kib(measured.activation.css.total.gzip));
    }
  }
});

test('the current measurement attributes chunks to dependency families', () => {
  const attributed = Object.values(current.browser).some((state) =>
    state.initial.js.assets.some((asset) => asset.families?.length),
  );
  assert.ok(attributed, 'route-loading-current.json was measured without source maps; run npm run loading:current');
  for (const state of Object.values(current.browser)) {
    for (const family of familiesOf(state.initial.js)) assert.ok(knownFamilies.has(family), `unknown family ${family}`);
  }
});

test('current initial loads stay within budget and avoid prohibited families', () => {
  for (const state of contract.states) {
    const measured = current.browser[state.state];
    assert.ok(measured, `${state.state} missing from current measurement`);
    const rules = initialRules(state);
    const loaded = staticLoad(measured);
    assert.ok(
      loaded.jsGzipKiB <= rules.budget.jsGzipKiB,
      `${state.state}: ${loaded.jsGzipKiB} KiB JS > ${rules.budget.jsGzipKiB}`,
    );
    assert.ok(
      !contract.enforcement.cssBudgets || loaded.cssGzipKiB <= rules.budget.cssGzipKiB,
      `${state.state}: ${loaded.cssGzipKiB} KiB CSS > ${rules.budget.cssGzipKiB}`,
    );
    for (const family of rules.prohibitedFamilies) {
      assert.ok(!loaded.families.has(family), `${state.state}: ${family} loads before the route renders`);
    }
  }
});

test('dependencies that load after render or on activation are allowed and within budget', () => {
  for (const state of contract.states) {
    const measured = current.browser[state.state];
    const allowed = new Set(state.activation?.allowedFamilies ?? []);
    for (const family of familiesOf(measured.afterRender.js)) {
      assert.ok(allowed.has(family), `${state.state}: ${family} loads after render without an activation rule`);
    }
    const later = measured.activation ?? (state.activation ? measured.afterRender : null);
    if (!later) continue;
    for (const family of familiesOf(later.js)) {
      assert.ok(allowed.has(family), `${state.state}: activation loads unexpected family ${family}`);
    }
    assert.ok(
      kib(later.js.total.gzip) <= state.activation.budget.jsGzipKiB,
      `${state.state}: activation JS over budget`,
    );
    assert.ok(
      !contract.enforcement.cssBudgets || kib(later.css.total.gzip) <= state.activation.budget.cssGzipKiB,
      `${state.state}: activation CSS over budget`,
    );
  }
});

test('prerender and SPA fallback paths do not overlap', () => {
  const prerender = new Set(contract.delivery.prerender);
  for (const path of contract.delivery.spaFallback) {
    assert.ok(!prerender.has(path), `${path} is both prerendered and SPA fallback`);
  }
  for (const state of contract.states) {
    assert.equal(state.delivery === 'prerender', prerender.has(state.url), `${state.state} delivery disagrees`);
  }
});

test('root graph rules name allowed and prohibited chunks without overlap', () => {
  const { allowed, prohibited } = contract.rootGraph;
  assert.ok(allowed.length > 0 && prohibited.length > 0);
  for (const asset of prohibited)
    assert.ok(!allowed.includes(asset), `${asset} is both allowed and prohibited in root`);
});
