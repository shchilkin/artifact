import { bootstrapFirstAdmin } from './adminBootstrap.js';
import { parseAdminBootstrapArgs } from './adminBootstrapArgs.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './db/pool.js';
import { createPostgresRepositories } from './db/postgres.js';
import { loadApiEnv } from './env.js';

loadApiEnv();
const args = parseAdminBootstrapArgs(process.argv.slice(2));
const config = loadConfig();
if (config.databaseDriver !== 'postgres') throw new Error('Admin bootstrap requires the Postgres database driver.');

const pool = createPostgresPool(config.databaseUrl);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const result = await bootstrapFirstAdmin({
    repositories: createPostgresRepositories(client),
    userId: args.userId,
    confirmedUserId: args.confirmedUserId,
    confirmed: args.confirmed,
  });
  await client.query('COMMIT');
  console.log(
    JSON.stringify({
      changed: result.changed,
      user: { id: result.user.id, email: result.user.email, role: result.user.role },
      audit: result.audit
        ? { id: result.audit.id, action: result.audit.action, createdAt: result.audit.created_at.toISOString() }
        : null,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
