import type { FullResult, Reporter, Suite } from '@playwright/test/reporter';

/**
 * Fails a run in which every selected test skipped. The runtime specs skip when the browser has no WebGL2, so a CI job
 * on a browser without it would otherwise pass without testing anything (issue #404). Enabled by
 * `PLAYWRIGHT_FAIL_ON_ALL_SKIPPED=1` in `playwright.config.ts`.
 */
export default class RequireRunReporter implements Reporter {
  private root: Suite | undefined;

  onBegin(_config: unknown, suite: Suite) {
    this.root = suite;
  }

  onEnd(result: FullResult): { status: FullResult['status'] } | undefined {
    const tests = this.root?.allTests() ?? [];
    if (result.status !== 'passed' || tests.length === 0) return undefined;
    if (tests.some((test) => test.outcome() !== 'skipped')) return undefined;
    console.error(
      `Every one of the ${tests.length} selected tests skipped, so this run tested nothing. ` +
        'Check the skip reasons (for the runtime specs: does this browser have WebGL2?).',
    );
    return { status: 'failed' };
  }

  printsToStdio() {
    return false;
  }
}
