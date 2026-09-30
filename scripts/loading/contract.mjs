// Checks a route-loading measurement (scripts/loading/route-loading-baseline.mjs output) against
// docs/loading/route-loading-contract.json. Every violation names the route/state, the observed chunk or size,
// and the contract field that owns the rule, so a failure says what to fix or which budget to review.

export const kib = (bytes) => Math.round((bytes / 1024) * 10) / 10;

const statesByName = (contract) => new Map(contract.states.map((state) => [state.state, state]));

/** Initial rules for a state and the contract path that owns them (`sameAs` states borrow another state's). */
export function initialRules(contract, state) {
  const owner = state.initial.sameAs ? statesByName(contract).get(state.initial.sameAs) : state;
  return { rules: owner.initial, path: `states[${owner.state}].initial` };
}

const familiesOf = (summary) => new Set(summary.assets.flatMap((asset) => asset.families ?? []));
const withFamily = (assets, family) => assets.filter((asset) => asset.families?.includes(family)).map((a) => a.name);
const gzipKiB = (assets) => kib(assets.reduce((sum, asset) => sum + asset.gzip, 0));
const largest = (assets) =>
  [...assets]
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 5)
    .map((asset) => `${asset.name} ${kib(asset.gzip)}`)
    .join(', ');

/** What a route loads before it renders: the first visit minus files dynamically imported afterwards. */
export function staticLoad(measured) {
  const after = new Set(measured.afterRender.js.assets.map((a) => a.name));
  const afterCss = new Set(measured.afterRender.css.assets.map((a) => a.name));
  const js = measured.initial.js.assets.filter((a) => !after.has(a.name));
  const css = measured.initial.css.assets.filter((a) => !afterCss.has(a.name));
  return { js, css, jsGzipKiB: gzipKiB(js), cssGzipKiB: gzipKiB(css) };
}

function checkBudget(violations, label, assets, observed, budget, path) {
  if (observed <= budget) return;
  violations.push(`${label}: ${observed} KiB > budget ${budget} KiB [${path}]; largest: ${largest(assets)}`);
}

function checkStates(contract, measurement, violations) {
  const known = new Set(Object.keys(contract.families));
  for (const state of contract.states) {
    const measured = measurement.browser?.[state.state];
    if (!measured) {
      violations.push(`${state.state} (${state.url}): not measured [states[${state.state}]]`);
      continue;
    }
    const label = `${state.state} (${state.url})`;

    for (const phase of ['initial', 'afterRender', 'activation']) {
      for (const family of measured[phase] ? familiesOf(measured[phase].js) : []) {
        if (!known.has(family)) violations.push(`${label} ${phase}: unknown family ${family} [families]`);
      }
    }

    const { rules, path } = initialRules(contract, state);
    const loaded = staticLoad(measured);
    checkBudget(
      violations,
      `${label} before render JS`,
      loaded.js,
      loaded.jsGzipKiB,
      rules.budget.jsGzipKiB,
      `${path}.budget.jsGzipKiB`,
    );
    if (contract.enforcement.cssBudgets) {
      checkBudget(
        violations,
        `${label} before render CSS`,
        loaded.css,
        loaded.cssGzipKiB,
        rules.budget.cssGzipKiB,
        `${path}.budget.cssGzipKiB`,
      );
    }
    for (const family of rules.prohibitedFamilies) {
      const chunks = withFamily(loaded.js, family);
      if (chunks.length) {
        violations.push(
          `${label} before render: prohibited family ${family} in ${chunks.join(', ')} [${path}.prohibitedFamilies]`,
        );
      }
    }

    const activationPath = `states[${state.state}].activation`;
    const allowed = new Set(state.activation?.allowedFamilies ?? []);
    for (const family of familiesOf(measured.afterRender.js)) {
      if (!allowed.has(family)) {
        const chunks = withFamily(measured.afterRender.js.assets, family).join(', ');
        violations.push(
          `${label} after render: family ${family} in ${chunks} has no activation rule [${activationPath}.allowedFamilies]`,
        );
      }
    }
    const later = measured.activation ?? (state.activation ? measured.afterRender : null);
    if (!later) continue;
    if (!state.activation) {
      violations.push(`${label}: measured an activation the contract does not define [${activationPath}]`);
      continue;
    }
    const phase = measured.activation ? 'activation' : 'after render';
    for (const family of familiesOf(later.js)) {
      if (!allowed.has(family)) {
        const chunks = withFamily(later.js.assets, family).join(', ');
        violations.push(
          `${label} ${phase}: family ${family} in ${chunks} is not allowed [${activationPath}.allowedFamilies]`,
        );
      }
    }
    const { budget } = state.activation;
    checkBudget(
      violations,
      `${label} ${phase} JS`,
      later.js.assets,
      kib(later.js.total.gzip),
      budget.jsGzipKiB,
      `${activationPath}.budget.jsGzipKiB`,
    );
    if (contract.enforcement.cssBudgets) {
      checkBudget(
        violations,
        `${label} ${phase} CSS`,
        later.css.assets,
        kib(later.css.total.gzip),
        budget.cssGzipKiB,
        `${activationPath}.budget.cssGzipKiB`,
      );
    }
  }
}

/**
 * Root route static imports: framework chunks shared with `entry.client` are implied, anything else must be
 * listed in `rootGraph.allowed`, never in `rootGraph.prohibited`, and carry no family a public route prohibits.
 */
function checkRootGraph(contract, measurement, violations) {
  const root = measurement.rootGraph;
  if (!root) {
    violations.push('root: measurement has no rootGraph; re-measure with scripts/loading/route-loading-baseline.mjs');
    return;
  }
  const { allowed, prohibited } = contract.rootGraph;
  const entry = new Set(root.entryImports);
  for (const asset of root.imports) {
    if (prohibited.includes(asset.name)) {
      violations.push(`root: static import ${asset.name} is prohibited [rootGraph.prohibited]`);
    } else if (!allowed.includes(asset.name) && !entry.has(asset.name)) {
      violations.push(`root: static import ${asset.name} is not allowed [rootGraph.allowed]`);
    }
  }
  for (const state of contract.states.filter((s) => s.owner.shell === 'public')) {
    const { rules, path } = initialRules(contract, state);
    for (const family of rules.prohibitedFamilies) {
      const chunks = withFamily(root.imports, family);
      if (chunks.length) {
        violations.push(
          `root: family ${family} in ${chunks.join(', ')} reaches public route ${state.state} (${state.url}) [${path}.prohibitedFamilies]`,
        );
      }
    }
  }
}

/** All contract violations in a measurement; empty when the build passes. */
export function checkMeasurement(contract, measurement) {
  const violations = [];
  const attributed = Object.values(measurement.browser ?? {}).some((state) =>
    state.initial.js.assets.some((asset) => asset.families?.length),
  );
  if (!attributed) {
    violations.push('measurement has no dependency families; build the web app with --sourcemapClient');
    return violations;
  }
  checkStates(contract, measurement, violations);
  checkRootGraph(contract, measurement, violations);
  return violations;
}

/** One markdown row per state: observed before-render and activation sizes against their budgets. */
export function summaryTable(contract, measurement) {
  const rows = [
    '| State | Before render JS / CSS (KiB) | Budget | Later JS / CSS (KiB) | Budget |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const state of contract.states) {
    const measured = measurement.browser?.[state.state];
    if (!measured) continue;
    const { rules } = initialRules(contract, state);
    const loaded = staticLoad(measured);
    const later = measured.activation ?? (state.activation ? measured.afterRender : null);
    const laterCell = later ? `+${kib(later.js.total.gzip)} / +${kib(later.css.total.gzip)}` : '—';
    const laterBudget = state.activation
      ? `+${state.activation.budget.jsGzipKiB} / +${state.activation.budget.cssGzipKiB}`
      : '—';
    rows.push(
      `| ${state.state} | ${loaded.jsGzipKiB} / ${loaded.cssGzipKiB} | ${rules.budget.jsGzipKiB} / ${rules.budget.cssGzipKiB} | ${laterCell} | ${laterBudget} |`,
    );
  }
  return rows.join('\n');
}
