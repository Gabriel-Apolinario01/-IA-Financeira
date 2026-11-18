import { createPostgresPool } from "./postgres-config.mjs";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { SqlGateway, SqlStatement, SqlValue } from "./repository";

const globalForAzure = globalThis as typeof globalThis & {
  iaFinanceiraAzurePool?: Pool;
  iaFinanceiraAzureGateway?: SqlGateway;
};

export function hasAzurePostgresConfig(): boolean {
  return Boolean(
    process.env.AZURE_POSTGRES_CONNECTION_STRING?.trim() ||
      (process.env.AZURE_POSTGRES_HOST?.trim() &&
        process.env.AZURE_POSTGRES_DATABASE?.trim() &&
        process.env.AZURE_POSTGRES_USER?.trim()),
  );
}

export function azurePostgresPool(): Pool {
  return globalForAzure.iaFinanceiraAzurePool ??= createPostgresPool();
}

function postgresParameters(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export function azurePostgresGateway(): SqlGateway {
  if (globalForAzure.iaFinanceiraAzureGateway) return globalForAzure.iaFinanceiraAzureGateway;
  const pool = azurePostgresPool();

  globalForAzure.iaFinanceiraAzureGateway = {
    async get<T>(sql: string, values: SqlValue[]): Promise<T | null> {
      const result = await pool.query<QueryResultRow>(postgresParameters(sql), values);
      return (result.rows[0] as T | undefined) ?? null;
    },
    async run(sql: string, values: SqlValue[]) {
      const result = await pool.query(postgresParameters(sql), values);
      return { changes: result.rowCount ?? 0 };
    },
    async batch(statements: SqlStatement[]) {
      const client = await pool.connect();
      await commitBatch(client, statements);
    },
  };
  return globalForAzure.iaFinanceiraAzureGateway;
}

async function commitBatch(client: PoolClient, statements: SqlStatement[]): Promise<void> {
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(postgresParameters(statement.sql), statement.values);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeAzurePostgresPool(): Promise<void> {
  const pool = globalForAzure.iaFinanceiraAzurePool;
  globalForAzure.iaFinanceiraAzurePool = undefined;
  globalForAzure.iaFinanceiraAzureGateway = undefined;
  if (pool) await pool.end();
}
