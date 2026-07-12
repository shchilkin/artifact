import type { AiUsageEventRepository } from './db/types.js';

export type SafetyBudgetState = 'normal' | 'warning' | 'stopped';

export interface SafetyBudgetSnapshot {
  period: string;
  state: SafetyBudgetState;
  spentMicroUsd: string;
  warningMicroUsd: string;
  limitMicroUsd: string;
}

export class SafetyBudgetService {
  private readonly now: () => Date;
  private readonly limitMicroUsd: bigint;
  private readonly warningMicroUsd: bigint;

  constructor(
    private readonly usageEvents: AiUsageEventRepository,
    options: { now?: () => Date; limitMicroUsd?: bigint; warningMicroUsd?: bigint } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.limitMicroUsd = options.limitMicroUsd ?? 30_000_000n;
    this.warningMicroUsd = options.warningMicroUsd ?? 24_000_000n;
    if (this.warningMicroUsd > this.limitMicroUsd) throw new Error('Safety budget warning cannot exceed its limit.');
  }

  async getSnapshot(): Promise<SafetyBudgetSnapshot> {
    const { from, to, period } = utcMonthRange(this.now());
    const total = await this.usageEvents.sumCost({ from, to });
    const spent = BigInt(total.costMicroUsd);
    const state: SafetyBudgetState =
      spent >= this.limitMicroUsd ? 'stopped' : spent >= this.warningMicroUsd ? 'warning' : 'normal';
    return {
      period,
      state,
      spentMicroUsd: spent.toString(),
      warningMicroUsd: this.warningMicroUsd.toString(),
      limitMicroUsd: this.limitMicroUsd.toString(),
    };
  }

  async check() {
    const snapshot = await this.getSnapshot();
    return snapshot.state === 'stopped'
      ? ({ allowed: false, code: 'ai_budget_exhausted' as const, snapshot } as const)
      : ({ allowed: true, snapshot } as const);
  }
}

function utcMonthRange(now: Date) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to, period: from.toISOString().slice(0, 7) };
}
