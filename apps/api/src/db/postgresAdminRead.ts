import type {
  AdminAccountDetailRow,
  AdminAccountRow,
  AdminAuditEventRow,
  AdminOverviewRow,
  AdminReadRepository,
  AdminUsageQuery,
  AiUsageEventRow,
  ProviderReconciliationRow,
  QuotaGrantReversalRow,
  QuotaGrantRow,
  TierAssignmentRow,
} from './types.js';

interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export class PostgresAdminReadRepository implements AdminReadRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async getOverview(period: string): Promise<AdminOverviewRow> {
    const result = await this.client.query<AdminOverviewRow>(
      `
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(access.tier, 'free') = 'free')::int AS free_count,
          COUNT(*) FILTER (WHERE access.tier = 'creator')::int AS creator_count,
          COUNT(*) FILTER (WHERE access.tier = 'founder')::int AS founder_count,
          COALESCE(SUM(usage.committed_generation_count), 0)::int AS committed_generation_count,
          COALESCE(SUM(usage.reserved_generation_count), 0)::int AS reserved_generation_count,
          COALESCE(SUM(usage.provider_cost_micro_usd), 0)::text AS provider_cost_micro_usd,
          COALESCE(SUM(usage.input_tokens), 0)::text AS input_tokens,
          COALESCE(SUM(usage.output_tokens), 0)::text AS output_tokens,
          COALESCE(SUM(usage.failed_call_count), 0)::int AS failed_call_count
        FROM users
        LEFT JOIN account_access access ON access.user_id = users.id
        LEFT JOIN ai_usage_monthly usage ON usage.user_id = users.id AND usage.period = $1
      `,
      [monthlyPeriod(period)],
    );
    return result.rows[0] ?? emptyOverview();
  }

  async listAccounts(input: { period: string; search?: string; limit: number; offset: number }) {
    const result = await this.client.query<AdminAccountRow & { total_count: string }>(
      `
        SELECT
          users.id,
          users.email,
          users.role,
          COALESCE(access.tier, 'free') AS tier,
          COALESCE(access.version, 0)::int AS tier_version,
          COALESCE(usage.committed_generation_count, 0)::int AS committed_generation_count,
          COALESCE(usage.reserved_generation_count, 0)::int AS reserved_generation_count,
          COALESCE(usage.provider_cost_micro_usd, 0)::text AS provider_cost_micro_usd,
          COALESCE(usage.failed_call_count, 0)::int AS failed_call_count,
          users.created_at,
          GREATEST(users.updated_at, COALESCE(access.updated_at, users.updated_at)) AS updated_at,
          COUNT(*) OVER()::text AS total_count
        FROM users
        LEFT JOIN account_access access ON access.user_id = users.id
        LEFT JOIN ai_usage_monthly usage ON usage.user_id = users.id AND usage.period = $1
        WHERE ($2::text IS NULL OR users.id ILIKE $2 OR users.email ILIKE $2)
        ORDER BY users.created_at DESC, users.id
        LIMIT $3 OFFSET $4
      `,
      [monthlyPeriod(input.period), searchPattern(input.search), input.limit, input.offset],
    );
    return {
      rows: result.rows.map(withoutTotalCount),
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async getAccount(userId: string, period: string): Promise<AdminAccountDetailRow | null> {
    const accounts = await this.listAccounts({ period, search: userId, limit: 20, offset: 0 });
    const account = accounts.rows.find((row) => row.id === userId);
    if (!account) return null;
    const assignments = await this.client.query<TierAssignmentRow>(
      'SELECT * FROM tier_assignments WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    const grants = await this.client.query<QuotaGrantRow>(
      'SELECT * FROM quota_grants WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    const reversals = await this.client.query<QuotaGrantReversalRow>(
      `SELECT reversals.* FROM quota_grant_reversals reversals
         JOIN quota_grants grants ON grants.id = reversals.grant_id
         WHERE grants.user_id = $1 ORDER BY reversals.created_at DESC`,
      [userId],
    );
    const audits = await this.client.query<AdminAuditEventRow>(
      'SELECT * FROM admin_audit_events WHERE target_user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return {
      account,
      assignments: assignments.rows,
      grants: grants.rows,
      reversals: reversals.rows,
      audits: audits.rows,
    };
  }

  async listUsage(input: AdminUsageQuery) {
    const result = await this.client.query<AiUsageEventRow & { total_count: string }>(
      `
        SELECT events.*, COUNT(*) OVER()::text AS total_count
        FROM ai_usage_events events
        WHERE ($1::text IS NULL OR events.user_id = $1)
          AND ($2::text IS NULL OR events.provider = $2)
          AND ($3::text IS NULL OR events.status = $3)
        ORDER BY events.created_at DESC, events.id
        LIMIT $4 OFFSET $5
      `,
      [input.userId ?? null, input.provider ?? null, input.status ?? null, input.limit, input.offset],
    );
    return {
      rows: result.rows.map(withoutTotalCount),
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async listReconciliations(limit: number) {
    const result = await this.client.query<ProviderReconciliationRow>(
      'SELECT * FROM provider_reconciliations ORDER BY usage_date DESC, provider LIMIT $1',
      [limit],
    );
    return result.rows;
  }
}

function searchPattern(search: string | undefined) {
  const value = search?.trim();
  return value ? `%${value}%` : null;
}

function withoutTotalCount<Row extends { total_count: string }>(input: Row): Omit<Row, 'total_count'> {
  const { total_count, ...row } = input;
  void total_count;
  return row;
}

function monthlyPeriod(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('period must use YYYY-MM');
  return value;
}

function emptyOverview(): AdminOverviewRow {
  return {
    free_count: 0,
    creator_count: 0,
    founder_count: 0,
    committed_generation_count: 0,
    reserved_generation_count: 0,
    provider_cost_micro_usd: '0',
    input_tokens: '0',
    output_tokens: '0',
    failed_call_count: 0,
  };
}
