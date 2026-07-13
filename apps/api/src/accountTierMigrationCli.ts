import pg from 'pg';
import { type AccountTierMigrationUser, buildAccountTierMigrationReport } from './accountTierMigration.js';

const databaseUrl = process.env.DATABASE_URL;
const founderAccountId = process.env.FOUNDER_ACCOUNT_ID;

if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!founderAccountId) throw new Error('FOUNDER_ACCOUNT_ID is required.');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const result = await pool.query<{
    id: string;
    email: string | null;
    aiEnabled: boolean;
  }>('SELECT id, email, ai_enabled AS "aiEnabled" FROM users ORDER BY id');
  const users: AccountTierMigrationUser[] = result.rows;
  process.stdout.write(`${JSON.stringify(buildAccountTierMigrationReport(users, founderAccountId), null, 2)}\n`);
} finally {
  await pool.end();
}
