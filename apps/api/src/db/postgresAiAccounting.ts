import { normalizeMicroUsd, normalizeProviderUsageMetrics, requiredText } from './accountingValues.js';
import type {
  AdminAuditEventRow,
  AdminAuditRepository,
  AiUsageCostSummary,
  AiUsageEventRepository,
  AiUsageEventRow,
  CreateAdminAuditEventInput,
  CreateAiUsageEventInput,
  CreateProviderReconciliationInput,
  ProviderReconciliationRepository,
  ProviderReconciliationRow,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export class PostgresAiUsageEventRepository implements AiUsageEventRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async append(input: CreateAiUsageEventInput): Promise<AiUsageEventRow> {
    const result = await this.client.query<AiUsageEventRow>(
      `
        WITH inserted AS (
        INSERT INTO ai_usage_events (
          id,
          operation_id,
          user_id,
          feature,
          provider,
          model,
          status,
          provider_request_id,
          usage_json,
          cost_micro_usd,
          pricing_version,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::bigint, $11, COALESCE($12, now()))
        ON CONFLICT (id) DO NOTHING
        RETURNING *
        ), aggregated AS (
          INSERT INTO ai_usage_monthly (
            user_id, period, generation_limit, generation_count, estimated_cost,
            provider_cost_micro_usd, input_tokens, output_tokens, failed_call_count, updated_at
          )
          SELECT
            user_id,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM'),
            0, 0, 0,
            cost_micro_usd,
            COALESCE((usage_json ->> 'inputTokens')::bigint, 0),
            COALESCE((usage_json ->> 'outputTokens')::bigint, 0),
            CASE WHEN status = 'failed' THEN 1 ELSE 0 END,
            created_at
          FROM inserted
          ON CONFLICT (user_id, period)
          DO UPDATE SET
            provider_cost_micro_usd = ai_usage_monthly.provider_cost_micro_usd + EXCLUDED.provider_cost_micro_usd,
            input_tokens = ai_usage_monthly.input_tokens + EXCLUDED.input_tokens,
            output_tokens = ai_usage_monthly.output_tokens + EXCLUDED.output_tokens,
            failed_call_count = ai_usage_monthly.failed_call_count + EXCLUDED.failed_call_count,
            updated_at = EXCLUDED.updated_at
          RETURNING user_id
        )
        SELECT * FROM inserted
        UNION ALL
        SELECT * FROM ai_usage_events WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      `,
      [
        input.id,
        input.operationId ?? null,
        input.userId,
        input.feature,
        input.provider,
        input.model,
        input.status,
        input.providerRequestId ?? null,
        normalizeProviderUsageMetrics(input.usage),
        normalizeMicroUsd(input.costMicroUsd),
        requiredText(input.pricingVersion, 'pricingVersion'),
        input.createdAt ?? null,
      ],
    );
    return requireSingleRow(result.rows, `Usage event was not appended: ${input.id}`);
  }

  async sumCost(input: { from: Date; to: Date; provider?: string }): Promise<AiUsageCostSummary> {
    const result = await this.client.query<{ cost_micro_usd: string }>(
      `
        SELECT COALESCE(SUM(cost_micro_usd), 0)::text AS cost_micro_usd
        FROM ai_usage_events
        WHERE created_at >= $1
          AND created_at < $2
          AND ($3::text IS NULL OR provider = $3)
      `,
      [input.from, input.to, input.provider ?? null],
    );
    return { costMicroUsd: result.rows[0]?.cost_micro_usd ?? '0' };
  }
}

export class PostgresAdminAuditRepository implements AdminAuditRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async append(input: CreateAdminAuditEventInput): Promise<AdminAuditEventRow> {
    const result = await this.client.query<AdminAuditEventRow>(
      `
        INSERT INTO admin_audit_events (
          id,
          admin_user_id,
          target_user_id,
          action,
          entity_type,
          entity_id,
          reason,
          before_json,
          after_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        RETURNING *
      `,
      [
        input.id,
        input.adminUserId,
        input.targetUserId ?? null,
        requiredText(input.action, 'action'),
        requiredText(input.entityType, 'entityType'),
        requiredText(input.entityId, 'entityId'),
        requiredText(input.reason, 'reason'),
        input.beforeJson ?? null,
        input.afterJson ?? null,
      ],
    );
    return requireSingleRow(result.rows, `Admin audit event was not appended: ${input.id}`);
  }
}

export class PostgresProviderReconciliationRepository implements ProviderReconciliationRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async upsert(input: CreateProviderReconciliationInput): Promise<ProviderReconciliationRow> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.usageDate)) throw new Error('usageDate must use YYYY-MM-DD');
    const result = await this.client.query<ProviderReconciliationRow>(
      `
        INSERT INTO provider_reconciliations (
          id,
          provider,
          usage_date,
          status,
          provider_cost_micro_usd,
          internal_cost_micro_usd,
          error_code,
          synced_at
        )
        VALUES ($1, $2, $3::date, $4, $5::bigint, $6::bigint, $7, $8)
        ON CONFLICT (provider, usage_date)
        DO UPDATE SET
          status = EXCLUDED.status,
          provider_cost_micro_usd = EXCLUDED.provider_cost_micro_usd,
          internal_cost_micro_usd = EXCLUDED.internal_cost_micro_usd,
          error_code = EXCLUDED.error_code,
          synced_at = EXCLUDED.synced_at
        RETURNING *
      `,
      [
        input.id,
        requiredText(input.provider, 'provider'),
        input.usageDate,
        input.status,
        input.providerCostMicroUsd === null || input.providerCostMicroUsd === undefined
          ? null
          : normalizeMicroUsd(input.providerCostMicroUsd),
        normalizeMicroUsd(input.internalCostMicroUsd),
        input.errorCode ?? null,
        input.syncedAt ?? null,
      ],
    );
    return requireSingleRow(
      result.rows,
      `Provider reconciliation was not upserted: ${input.provider}:${input.usageDate}`,
    );
  }
}

function requireSingleRow<Row>(rows: Row[], message: string): Row {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
