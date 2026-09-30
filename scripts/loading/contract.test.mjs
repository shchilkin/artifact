import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contract = JSON.parse(readFileSync(new URL('../../docs/loading/route-loading-contract.json', import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL('../../docs/loading/route-loading-baseline.json', import.meta.url)));

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
const kib = (bytes) => Math.round((bytes / 1024) * 10) / 10;

test('contract covers every representative route and activation state', () => {
  assert.deepEqual([...statesByName.keys()].sort(), [...REQUIRED_STATES].sort());
});

test('every state names an owner, a delivery mode, and initial loading rules', () => {
  for (const state of contract.states) {
    assert.ok(state.owner?.shell, `${state.state} has no owning shell`);
    assert.ok(['prerender', 'spa-fallback'].includes(state.delivery), `${state.state} has no delivery mode`);
    const initial = state.initial.sameAs ? statesByName.get(state.initial.sameAs).initial : state.initial;
    assert.ok(initial.budget.jsGzipKiB > 0 && initial.budget.cssGzipKiB > 0, `${state.state} has no initial budget`);
    assert.ok(Array.isArray(initial.prohibited), `${state.state} has no prohibited list`);
  }
});

test('activation-only dependencies are absent from, or prohibited in, the initial load', () => {
  for (const state of contract.states.filter((s) => s.activation)) {
    assert.ok(state.activation.trigger, `${state.state} activation has no trigger`);
    const initial = state.initial.sameAs ? statesByName.get(state.initial.sameAs).initial : state.initial;
    const prohibited = new Set([...initial.prohibited, ...contract.sharedInitial.prohibitedEverywhere]);
    const measuredInitial = new Set(baseline.browser[state.state].initial.js.assets.map((a) => a.name));
    for (const asset of state.activation.allowed) {
      assert.ok(
        prohibited.has(asset) || !measuredInitial.has(asset),
        `${state.state}: activation-only ${asset} is loaded initially without being prohibited`,
      );
    }
  }
});

test('every chunk measured on an initial load is classified', () => {
  const { groups } = contract.sharedInitial;
  for (const state of contract.states.filter((s) => !s.initial.sameAs)) {
    const allowed = new Set(state.initial.allowed.flatMap((entry) => groups[entry] ?? [entry]));
    const known = new Set([
      ...allowed,
      ...state.initial.prohibited,
      ...contract.sharedInitial.prohibitedEverywhere,
      ...(state.exceptions ?? []).map((e) => e.asset),
    ]);
    for (const asset of baseline.browser[state.state].initial.js.assets) {
      assert.ok(
        known.has(asset.name),
        `${state.state}: ${asset.name} is neither allowed, prohibited, nor an exception`,
      );
    }
    for (const entry of state.initial.allowed) {
      assert.ok(groups[entry] || entry.endsWith('.js'), `${state.state}: unknown allowed group ${entry}`);
    }
  }
});

test('recorded baselines match the checked-in browser measurement', () => {
  for (const state of contract.states) {
    const measured = baseline.browser[state.state];
    assert.ok(measured, `${state.state} missing from baseline`);
    if (state.initial.baseline) {
      assert.equal(state.initial.baseline.jsGzipKiB, kib(measured.initial.js.total.gzip), `${state.state} JS baseline`);
      assert.equal(
        state.initial.baseline.cssGzipKiB,
        kib(measured.initial.css.total.gzip),
        `${state.state} CSS baseline`,
      );
    }
    if (state.activation?.baseline) {
      assert.equal(state.activation.baseline.jsGzipKiB, kib(measured.activation.js.total.gzip));
      assert.equal(state.activation.baseline.cssGzipKiB, kib(measured.activation.css.total.gzip));
    }
  }
});

test('prerender and SPA fallback paths do not overlap', () => {
  const prerender = new Set(contract.delivery.prerender);
  for (const path of contract.delivery.spaFallback) {
    assert.ok(!prerender.has(path), `${path} is both prerendered and SPA fallback`);
  }
  for (const state of contract.states) {
    const inPrerender = prerender.has(state.url);
    assert.equal(state.delivery === 'prerender', inPrerender, `${state.state} delivery disagrees with path lists`);
  }
});
