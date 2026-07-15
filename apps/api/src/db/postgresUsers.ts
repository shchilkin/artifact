import type { CreateUserInput, UpsertAuthenticatedUserInput, UserRepository, UserRow } from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const userColumns = `
  id,
  email,
  role,
  ai_enabled,
  plus_status,
  created_at,
  updated_at,
  disabled_at
`;

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.client.query<UserRow>(
      `
        SELECT ${userColumns}
        FROM users
        WHERE id = $1
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.client.query<UserRow>(
      `
        SELECT ${userColumns}
        FROM users
        WHERE email = $1
      `,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRow> {
    const result = await this.client.query<UserRow>(
      `
        INSERT INTO users (id, email, role, ai_enabled, plus_status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ${userColumns}
      `,
      [input.id, input.email, input.role ?? 'user', input.aiEnabled ?? false, input.plusStatus ?? 'none'],
    );
    return requireSingleRow(result.rows, `User was not created: ${input.id}`);
  }

  async upsertFromAuth(input: UpsertAuthenticatedUserInput): Promise<UserRow> {
    const result = await this.client.query<UserRow>(
      `
        INSERT INTO users (id, email, role, ai_enabled, plus_status)
        VALUES ($1, $2, 'user', false, 'none')
        ON CONFLICT (id) DO UPDATE
        SET email = COALESCE(EXCLUDED.email, users.email),
            updated_at = now()
        RETURNING ${userColumns}
      `,
      [input.id, input.email ?? null],
    );
    return requireSingleRow(result.rows, `User was not upserted from auth: ${input.id}`);
  }

  async setAiEnabled(id: string, aiEnabled: boolean): Promise<UserRow> {
    const result = await this.client.query<UserRow>(
      `
        UPDATE users
        SET ai_enabled = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING ${userColumns}
      `,
      [id, aiEnabled],
    );
    return requireSingleRow(result.rows, `User not found: ${id}`);
  }

  async setRole(id: string, role: UserRow['role']): Promise<UserRow> {
    const result = await this.client.query<UserRow>(
      `
        UPDATE users
        SET role = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING ${userColumns}
      `,
      [id, role],
    );
    return requireSingleRow(result.rows, `User not found: ${id}`);
  }
}

function requireSingleRow<Row>(rows: Row[], message: string): Row {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
