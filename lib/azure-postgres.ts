import { DefaultAzureCredential } from "@azure/identity";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { SqlGateway, SqlStatement, SqlValue } from "./repository";

const POSTGRES_SCOPE = "https://ossrdbms-aad.database.windows.net/.default";
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
  if (globalForAzure.iaFinanceiraAzurePool) return globalForAzure.iaFinanceiraAzurePool;

  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING?.trim();
  if (connectionString) {
    globalForAzure.iaFinanceiraAzurePool = new Pool({
      connectionString,
      ssl: process.env.AZURE_POSTGRES_SSL === "false" ? false : { rejectUnauthorized: true },
      max: Number(process.env.AZURE_POSTGRES_POOL_SIZE || 5),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    return globalForAzure.iaFinanceiraAzurePool;
  }

  const host = process.env.AZURE_POSTGRES_HOST?.trim();
  const database = process.env.AZURE_POSTGRES_DATABASE?.trim();
  const user = process.env.AZURE_POSTGRES_USER?.trim();
  if (!host || !database || !user) {
    throw new Error("Configure a conexão do Azure Database for PostgreSQL.");
  }

  const credential = new DefaultAzureCredential();
  globalForAzure.iaFinanceiraAzurePool = new Pool({
    host,
    database,
    user,
    port: Number(process.env.AZURE_POSTGRES_PORT || 5432),
    password: async () => {
      const token = await credential.getToken(POSTGRES_SCOPE);
      if (!token?.token) throw new Error("Não foi possível obter a identidade gerenciada do Azure.");
      return token.token;
    },
    ssl: { rejectUnauthorized: true },
    max: Number(process.env.AZURE_POSTGRES_POOL_SIZE || 5),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return globalForAzure.iaFinanceiraAzurePool;
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
