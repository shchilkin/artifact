// Checks an editor UX measurement (scripts/editor-ux/measure.mjs output) against
// docs/editor-ux/editor-ux-contract.json. Every violation names the metric key, the observed value, and the
// contract field that owns the rule, so a failure says what to fix or which budget to review.

/** Metric keys a budget covers: `viewport/document/subject/metric`. */
export function budgetKeys(contract, budget) {
  const keys = [];
  for (const viewport of budget.viewports) {
    for (const document of contract.documents) {
      for (const subject of budget.subjects) keys.push(`${viewport}/${document}/${subject}/${budget.metric}`);
    }
  }
  return keys;
}

// Exception keys may use `*` for a whole segment, e.g. `desktop/*/select-layer/frameMovePx`.
export function matchesKey(pattern, key) {
  const want = pattern.split('/');
  const have = key.split('/');
  return want.length === have.length && want.every((segment, index) => segment === '*' || segment === have[index]);
}

/** One row per budgeted metric key: its value, budget, matching exception, and status. */
export function evaluate(contract, measurement) {
  const rows = [];
  contract.budgets.forEach((budget, budgetIndex) => {
    for (const key of budgetKeys(contract, budget)) {
      const value = measurement.metrics?.[key] ?? null;
      const exceptionIndex = contract.exceptions.findIndex((exception) => matchesKey(exception.key, key));
      const exception = exceptionIndex >= 0 ? contract.exceptions[exceptionIndex] : null;
      let status = 'ok';
      if (value === null) status = 'missing';
      else if (value > budget.max)
        status = !exception ? 'over-budget' : value > exception.max ? 'over-exception' : 'exception';
      rows.push({ key, value, budget, budgetIndex, exception, exceptionIndex, status });
    }
  });
  return rows;
}

export function checkMeasurement(contract, measurement) {
  const rows = evaluate(contract, measurement);
  const violations = [];
  for (const { key, value, budget, budgetIndex, exception, exceptionIndex, status } of rows) {
    const path = `budgets[${budgetIndex}] ${budget.metric}`;
    if (status === 'missing') violations.push(`${key}: not measured [${path}]`);
    if (status === 'over-budget') {
      violations.push(`${key}: ${value} ${budget.unit} > budget ${budget.max} ${budget.unit} [${path}]`);
    }
    if (status === 'over-exception') {
      violations.push(
        `${key}: ${value} ${budget.unit} > exception ceiling ${exception.max} ${budget.unit} (budget ${budget.max}, owner ${exception.owner}) [exceptions[${exceptionIndex}]]`,
      );
    }
  }
  // A layout exception that nothing needs any more must be removed, so fixed behavior cannot regress unnoticed.
  // Timing values vary between runs, so unused timing exceptions are reported as notices instead.
  for (const { exception, exceptionIndex } of staleExceptions(contract, rows)) {
    if (!exception.deterministic) continue;
    violations.push(
      `${exception.key}: every matching value is within budget; remove the exception [exceptions[${exceptionIndex}]]`,
    );
  }
  return violations;
}

/** Exceptions whose matching metrics are all within budget (or that match no budgeted metric). */
export function staleExceptions(contract, rows = []) {
  return contract.exceptions
    .map((exception, exceptionIndex) => {
      const matched = rows.filter((row) => row.exceptionIndex === exceptionIndex);
      const deterministic = matched.every((row) => row.budget.deterministic);
      return { exception: { ...exception, deterministic }, exceptionIndex, matched };
    })
    .filter(({ matched }) => matched.every((row) => row.status === 'ok'));
}

const STATUS_LABEL = {
  ok: 'ok',
  missing: 'NOT MEASURED',
  'over-budget': 'OVER BUDGET',
  'over-exception': 'OVER EXCEPTION',
};

/** Markdown table of every budgeted metric for the job summary and the console. */
export function summaryTable(contract, measurement) {
  const lines = ['| Metric | Value | Budget | Status |', '| --- | ---: | ---: | --- |'];
  for (const { key, value, budget, exception, status } of evaluate(contract, measurement)) {
    const label =
      status === 'exception' ? `exception ${exception.owner} (ceiling ${exception.max})` : STATUS_LABEL[status];
    lines.push(`| \`${key}\` | ${value ?? '-'} | ${budget.max} ${budget.unit} | ${label} |`);
  }
  return lines.join('\n');
}
