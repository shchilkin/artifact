import type { CloudProjectRepository, CloudProjectRow, UpsertCloudProjectInput } from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[]; rowCount?: number | null }>;
}

const projectColumns = `
  id,
  user_id,
  name,
  doc_json,
  thumbnail,
  created_at,
  updated_at
`;

export class PostgresCloudProjectRepository implements CloudProjectRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async listForUser(userId: string): Promise<CloudProjectRow[]> {
    const result = await this.client.query<CloudProjectRow>(
      `
        SELECT ${projectColumns}
        FROM cloud_projects
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `,
      [userId],
    );
    return result.rows;
  }

  async upsert(input: UpsertCloudProjectInput): Promise<CloudProjectRow> {
    const result = await this.client.query<CloudProjectRow>(
      `
        INSERT INTO cloud_projects (id, user_id, name, doc_json, thumbnail)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            doc_json = EXCLUDED.doc_json,
            thumbnail = EXCLUDED.thumbnail,
            updated_at = now()
        WHERE cloud_projects.user_id = EXCLUDED.user_id
        RETURNING ${projectColumns}
      `,
      [input.id, input.userId, input.name, input.docJson, input.thumbnail ?? null],
    );
    return requireSingleRow(result.rows, `Cloud project was not saved: ${input.id}`);
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const result = await this.client.query(
      `
        DELETE FROM cloud_projects
        WHERE id = $1 AND user_id = $2
      `,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function requireSingleRow<Row>(rows: Row[], message: string): Row {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
