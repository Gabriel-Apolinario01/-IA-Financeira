import { readFile } from 'node:fs/promises';
import { getMigrations } from 'better-auth/db/migration';
import { createPostgresPool } from '../lib/postgres-config.mjs';
import { createEmailAuth } from '../lib/auth-config.mjs';

const pool = createPostgresPool();
const lock = await pool.connect();
try {
  await lock.query("SELECT pg_advisory_lock(1940026117)");
  await lock.query(await readFile(new URL('../db/azure-postgresql.sql', import.meta.url), 'utf8'));
  if (process.env.AZURE_AUTH_MODE === 'email') {
    const { runMigrations } = await getMigrations(createEmailAuth(pool).options);
    await runMigrations();
  }
  console.log('Banco preparado; tabelas e dados existentes preservados.');
} finally {
  await lock.query("SELECT pg_advisory_unlock(1940026117)").catch(() => undefined);
  lock.release();
  await pool.end();
}
