import type { AssetRepository, AssetRow, CreateAssetInput } from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const assetColumns = `
  id,
  user_id,
  kind,
  storage_key,
  public_uri,
  mime_type,
  width,
  height,
  size_bytes,
  metadata_json,
  created_at,
  deleted_at
`;

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async create(input: CreateAssetInput): Promise<AssetRow> {
    const result = await this.client.query<AssetRow>(
      `
        INSERT INTO assets (
          id,
          user_id,
          kind,
          storage_key,
          public_uri,
          mime_type,
          width,
          height,
          size_bytes,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        RETURNING ${assetColumns}
      `,
      [
        input.id,
        input.userId,
        input.kind,
        input.storageKey,
        input.publicUri ?? null,
        input.mimeType,
        input.width,
        input.height,
        input.sizeBytes,
        input.metadataJson,
      ],
    );
    return requireRow(result.rows, `Asset was not created: ${input.id}`);
  }

  // fallow-ignore-next-line unused-class-member
  async findByIdForUser(id: string, userId: string): Promise<AssetRow | null> {
    const result = await this.client.query<AssetRow>(
      `
        SELECT ${assetColumns}
        FROM assets
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  async softDelete(id: string, userId: string, deletedAt: Date): Promise<AssetRow> {
    const result = await this.client.query<AssetRow>(
      `
        UPDATE assets
        SET deleted_at = $3
        WHERE id = $1 AND user_id = $2
        RETURNING ${assetColumns}
      `,
      [id, userId, deletedAt],
    );
    return requireRow(result.rows, `Asset not found: ${id}`);
  }
}

function requireRow<TRow>(rows: readonly TRow[], message: string): TRow {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
