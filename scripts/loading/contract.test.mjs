import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkMeasurement, initialRules, kib } from './contract.mjs';

const readJson = (relative) => JSON.parse(readFileSync(new URL(`../../${relative}`, import.meta.url)));
const contract = readJson('docs/loading/route-loading-contract.json');
const baselineV0481 = readJson(contract.baselineFile);

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
const initialOf = (state) => initialRules(contract, state).rules;

test('contract covers every representative route and activation state', () => {
  assert.deepEqual([...statesByName.keys()].sort(), [...REQUIRED_STATES].sort());
});

test('every state names an owner, a delivery mode, budgets, and known families', () => {
  for (const state of contract.states) {
    assert.ok(state.owner?.shell, `${state.state} has no owning shell`);
    assert.ok(['prerender', 'spa-fallback'].includes(state.delivery), `${state.state} has no delivery mode`);
    const initial = initialOf(state);
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

const asset = (name, gzipKiB, families = []) => ({ name, raw: gzipKiB * 3072, gzip: gzipKiB * 1024, families });
const summary = (assets) => ({
  total: assets.reduce((sum, a) => ({ raw: sum.raw + a.raw, gzip: sum.gzip + a.gzip }), { raw: 0, gzip: 0 }),
  assets,
});
const phase = (js = [], css = []) => ({ js: summary(js), css: summary(css) });

/** A measurement that satisfies the contract: small initial loads and one allowed family per activation. */
function passingMeasurement() {
  const browser = {};
  for (const state of contract.states) {
    const loaded = phase([asset('entry.client.js', 10, ['react'])], [asset('root.css', 2)]);
    const allowed = state.activation?.allowedFamilies ?? [];
    browser[state.state] = {
      url: state.url,
      initial: loaded,
      afterRender: phase(),
      ...(state.activation ? { activation: phase(allowed.map((family) => asset(`${family}.js`, 1, [family]))) } : {}),
    };
  }
  return {
    browser,
    rootGraph: {
      entryImports: ['chunk.js'],
      imports: [asset('chunk.js', 1, ['react']), asset('authClient.js', 1)],
    },
  };
}

test('checkMeasurement passes a measurement within the contract', () => {
  assert.deepEqual(checkMeasurement(contract, passingMeasurement()), []);
});

test('checkMeasurement names the state, observed size, largest chunk, and owning budget', () => {
  const measurement = passingMeasurement();
  measurement.browser.docs.initial.js = summary([asset('docs.js', 200)]);
  const [violation, ...rest] = checkMeasurement(contract, measurement);
  assert.equal(rest.length, 0);
  assert.match(violation, /^docs \(\/docs\) before render JS: 200 KiB > budget 170 KiB/);
  assert.match(violation, /\[states\[docs\]\.initial\.budget\.jsGzipKiB\]; largest: docs\.js 200$/);
});

test('checkMeasurement reports prohibited families before render with the chunk that carries them', () => {
  const measurement = passingMeasurement();
  measurement.browser.docs.initial.js.assets.push(asset('lib.js', 1, ['renderer']));
  assert.deepEqual(checkMeasurement(contract, measurement), [
    'docs (/docs) before render: prohibited family renderer in lib.js [states[docs].initial.prohibitedFamilies]',
  ]);
});

test('checkMeasurement does not count files loaded after render against the initial budget', () => {
  const measurement = passingMeasurement();
  const hero = asset('home.hero.js', 150, ['renderer']);
  measurement.browser.home.initial.js.assets.push(hero);
  measurement.browser.home.afterRender = phase([hero]);
  delete measurement.browser.home.activation;
  assert.deepEqual(checkMeasurement(contract, measurement), []);
});

test('checkMeasurement reports sameAs states against the owning state budget', () => {
  const measurement = passingMeasurement();
  measurement.browser['editor-nodes'].initial.js = summary([asset('react-flow.js', 1, ['react-flow'])]);
  assert.deepEqual(checkMeasurement(contract, measurement), [
    'editor-nodes (/app) before render: prohibited family react-flow in react-flow.js [states[editor-layers-blank].initial.prohibitedFamilies]',
  ]);
});

test('checkMeasurement reports activation families and budgets', () => {
  const measurement = passingMeasurement();
  measurement.browser['first-3d-activation'].activation = phase([asset('three.js', 300, ['three', 'pixi'])]);
  assert.deepEqual(checkMeasurement(contract, measurement), [
    'first-3d-activation (/app) activation: family pixi in three.js is not allowed [states[first-3d-activation].activation.allowedFamilies]',
    'first-3d-activation (/app) activation JS: 300 KiB > budget 215 KiB [states[first-3d-activation].activation.budget.jsGzipKiB]; largest: three.js 300',
  ]);
});

test('checkMeasurement enforces the root graph', () => {
  const measurement = passingMeasurement();
  measurement.rootGraph.imports.push(
    asset('SiteNav.js', 1),
    asset('surprise.js', 1),
    asset('commands.js', 1, ['motion']),
  );
  const violations = checkMeasurement(contract, measurement);
  assert.deepEqual(violations.slice(0, 2), [
    'root: static import SiteNav.js is prohibited [rootGraph.prohibited]',
    'root: static import surprise.js is not allowed [rootGraph.allowed]',
  ]);
  assert.ok(violations.slice(2).length > 0);
  for (const violation of violations.slice(2)) {
    assert.match(violation, /^root: family motion in commands\.js reaches public route /);
  }
});

test('checkMeasurement reports missing states and missing source-map families', () => {
  const measurement = passingMeasurement();
  delete measurement.browser.projects;
  assert.deepEqual(checkMeasurement(contract, measurement), ['projects (/projects): not measured [states[projects]]']);
  for (const state of Object.values(measurement.browser)) {
    for (const a of state.initial.js.assets) a.families = [];
  }
  assert.deepEqual(checkMeasurement(contract, measurement), [
    'measurement has no dependency families; build the web app with --sourcemapClient',
  ]);
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
