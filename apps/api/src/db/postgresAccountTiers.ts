import { requiredText } from './accountingValues.js';
import { AccountTierVersionConflictError, QuotaGrantReversalExceededError } from './errors.js';
import {
  assertQuotaGrantRetry,
  assertQuotaGrantReversalRetry,
  assertTierAssignmentRetry,
} from './idempotencyInputs.js';
import type {
  AccountAccessRow,
  AccountTierRepository,
  CreateQuotaGrantInput,
  CreateQuotaGrantReversalInput,
  CreateTierAssignmentInput,
  LegacyAiEnabledUser,
  QuotaGrantReversalRow,
  QuotaGrantRow,
  TierAssignmentRow,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const accessColumns = `
  user_id,
  tier,
  version,
  created_at,
  updated_at
`;

const assignmentColumns = `
  id,
  user_id,
  previous_tier,
  new_tier,
  reason,
  admin_user_id,
  idempotency_key,
  created_at
`;

const grantColumns = `
  id,
  user_id,
  period,
  amount,
  reversed_amount,
  reason,
  admin_user_id,
  idempotency_key,
  created_at
`;

const reversalColumns = `
  id,
  grant_id,
  amount,
  reason,
  admin_user_id,
  idempotency_key,
  created_at
`;

export class PostgresAccountTierRepository implements AccountTierRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async findAccess(userId: string): Promise<AccountAccessRow | null> {
    const result = await this.client.query<AccountAccessRow>(
      `
        SELECT ${accessColumns}
        FROM account_access
        WHERE user_id = $1
      `,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async ensureAccess(userId: string): Promise<AccountAccessRow> {
    const result = await this.client.query<AccountAccessRow>(
      `
        WITH inserted AS (
          INSERT INTO account_access (user_id, tier)
          SELECT $1, 'free'
          FROM users
          WHERE id = $1
          ON CONFLICT (user_id) DO NOTHING
          RETURNING ${accessColumns}
        )
        SELECT ${accessColumns} FROM inserted
        UNION ALL
        SELECT ${accessColumns} FROM account_access WHERE user_id = $1
        LIMIT 1
      `,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`User not found: ${userId}`);
    return row;
  }

  async listLegacyAiEnabledUsers(): Promise<LegacyAiEnabledUser[]> {
    const result = await this.client.query<LegacyAiEnabledUser>(
      `
        SELECT id AS "userId", email
        FROM users
        WHERE ai_enabled = true
        ORDER BY id
      `,
    );
    return result.rows;
  }

  async assignTier(input: CreateTierAssignmentInput): Promise<{ row: TierAssignmentRow; assigned: boolean }> {
    await this.ensureAccess(input.userId);
    const result = await this.client.query<TierAssignmentRow & { assigned: boolean }>(
      `
        WITH existing AS MATERIALIZED (
          SELECT ${assignmentColumns}
          FROM tier_assignments
          WHERE admin_user_id = $7 AND idempotency_key = $8
        ), updated AS (
          UPDATE account_access
          SET tier = $5,
              version = account_access.version + 1,
              updated_at = now()
          WHERE user_id = $2
            AND tier = $3 AND version = $4
            AND NOT EXISTS (SELECT 1 FROM existing)
          RETURNING user_id
        ), inserted AS (
          INSERT INTO tier_assignments (
            id, user_id, previous_tier, new_tier, reason, admin_user_id, idempotency_key
          )
          SELECT $1, $2, $3, $5, $6, $7, $8
          FROM updated
          ON CONFLICT (admin_user_id, idempotency_key) DO NOTHING
          RETURNING ${assignmentColumns}
        )
        SELECT ${assignmentColumns}, true AS assigned FROM inserted
        UNION ALL
        SELECT ${assignmentColumns}, false AS assigned FROM existing
        LIMIT 1
      `,
      [
        input.id,
        input.userId,
        input.expectedTier,
        input.expectedVersion,
        input.newTier,
        requiredText(input.reason, 'reason'),
        input.adminUserId,
        input.idempotencyKey,
      ],
    );
    const claimed = result.rows[0];
    if (claimed) {
      const { assigned, ...row } = claimed;
      if (!assigned) assertTierAssignmentRetry(row, input);
      return { row, assigned };
    }
    const existing = await this.findTierAssignmentByIdempotency(input.adminUserId, input.idempotencyKey);
    if (existing) {
      assertTierAssignmentRetry(existing, input);
      return { row: existing, assigned: false };
    }
    throw new AccountTierVersionConflictError(input.userId);
  }

  async createQuotaGrant(input: CreateQuotaGrantInput): Promise<{ row: QuotaGrantRow; created: boolean }> {
    const result = await this.client.query<QuotaGrantRow & { created: boolean }>(
      `
        WITH inserted AS (
          INSERT INTO quota_grants (
            id, user_id, period, amount, reason, admin_user_id, idempotency_key
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (admin_user_id, idempotency_key) DO NOTHING
          RETURNING ${grantColumns}
        )
        SELECT ${grantColumns}, true AS created FROM inserted
        UNION ALL
        SELECT ${grantColumns}, false AS created
        FROM quota_grants
        WHERE admin_user_id = $6 AND idempotency_key = $7
        LIMIT 1
      `,
      [
        input.id,
        input.userId,
        monthlyPeriod(input.period),
        positiveInteger(input.amount, 'amount'),
        requiredText(input.reason, 'reason'),
        input.adminUserId,
        input.idempotencyKey,
      ],
    );
    const claimed = result.rows[0];
    if (claimed) {
      const { created, ...row } = claimed;
      if (!created) assertQuotaGrantRetry(row, input);
      return { row, created };
    }
    const existing = await this.findQuotaGrantByIdempotency(input.adminUserId, input.idempotencyKey);
    if (!existing)
      throw new Error(`Quota grant idempotency winner not found: ${input.adminUserId}:${input.idempotencyKey}`);
    assertQuotaGrantRetry(existing, input);
    return { row: existing, created: false };
  }

  async createQuotaGrantReversal(
    input: CreateQuotaGrantReversalInput,
  ): Promise<{ row: QuotaGrantReversalRow; created: boolean }> {
    let result: { rows: (QuotaGrantReversalRow & { created: boolean })[] };
    try {
      result = await this.client.query<QuotaGrantReversalRow & { created: boolean }>(
        `
        WITH inserted AS (
          INSERT INTO quota_grant_reversals (
            id, grant_id, amount, reason, admin_user_id, idempotency_key
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (admin_user_id, idempotency_key) DO NOTHING
          RETURNING ${reversalColumns}
        )
        SELECT ${reversalColumns}, true AS created FROM inserted
        UNION ALL
        SELECT ${reversalColumns}, false AS created
        FROM quota_grant_reversals
        WHERE admin_user_id = $5 AND idempotency_key = $6
        LIMIT 1
      `,
        [
          input.id,
          input.grantId,
          positiveInteger(input.amount, 'amount'),
          requiredText(input.reason, 'reason'),
          input.adminUserId,
          input.idempotencyKey,
        ],
      );
    } catch (error) {
      const code = postgresErrorCode(error);
      if (code === 'P0001') throw new QuotaGrantReversalExceededError(input.grantId, { cause: error });
      if (code === 'P0002' || code === '23503') {
        throw new Error(`Quota grant not found: ${input.grantId}`, { cause: error });
      }
      throw error;
    }
    const claimed = result.rows[0];
    if (claimed) {
      const { created, ...row } = claimed;
      if (!created) assertQuotaGrantReversalRetry(row, input);
      return { row, created };
    }
    const existing = await this.findQuotaGrantReversalByIdempotency(input.adminUserId, input.idempotencyKey);
    if (existing) {
      assertQuotaGrantReversalRetry(existing, input);
      return { row: existing, created: false };
    }
    if (!(await this.findQuotaGrantById(input.grantId))) throw new Error(`Quota grant not found: ${input.grantId}`);
    throw new QuotaGrantReversalExceededError(input.grantId);
  }

  async sumQuotaAdjustments(userId: string, period: string): Promise<{ granted: number; reversed: number }> {
    const result = await this.client.query<{ granted: string; reversed: string }>(
      `
        SELECT
          COALESCE(SUM(amount), 0)::text AS granted,
          COALESCE(SUM(reversed_amount), 0)::text AS reversed
        FROM quota_grants
        WHERE user_id = $1 AND period = $2
      `,
      [userId, monthlyPeriod(period)],
    );
    const row = result.rows[0] ?? { granted: '0', reversed: '0' };
    return { granted: Number(row.granted), reversed: Number(row.reversed) };
  }

  private async findTierAssignmentByIdempotency(
    adminUserId: string,
    idempotencyKey: string,
  ): Promise<TierAssignmentRow | null> {
    const result = await this.client.query<TierAssignmentRow>(
      `SELECT ${assignmentColumns} FROM tier_assignments WHERE admin_user_id = $1 AND idempotency_key = $2`,
      [adminUserId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  private async findQuotaGrantByIdempotency(
    adminUserId: string,
    idempotencyKey: string,
  ): Promise<QuotaGrantRow | null> {
    const result = await this.client.query<QuotaGrantRow>(
      `SELECT ${grantColumns} FROM quota_grants WHERE admin_user_id = $1 AND idempotency_key = $2`,
      [adminUserId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  private async findQuotaGrantById(id: string): Promise<QuotaGrantRow | null> {
    const result = await this.client.query<QuotaGrantRow>(`SELECT ${grantColumns} FROM quota_grants WHERE id = $1`, [
      id,
    ]);
    return result.rows[0] ?? null;
  }

  private async findQuotaGrantReversalByIdempotency(
    adminUserId: string,
    idempotencyKey: string,
  ): Promise<QuotaGrantReversalRow | null> {
    const result = await this.client.query<QuotaGrantReversalRow>(
      `SELECT ${reversalColumns} FROM quota_grant_reversals WHERE admin_user_id = $1 AND idempotency_key = $2`,
      [adminUserId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function monthlyPeriod(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('period must use YYYY-MM');
  return value;
}
