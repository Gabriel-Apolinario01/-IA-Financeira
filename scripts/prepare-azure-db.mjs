import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential } from "@azure/identity";
import { Pool } from "pg";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));

function createPool() {
  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING?.trim();
  const ssl = process.env.AZURE_POSTGRES_SSL === "false" ? false : { rejectUnauthorized: true };
  if (connectionString) return new Pool({ connectionString, ssl, max: 2, connectionTimeoutMillis: 10_000 });

  const host = process.env.AZURE_POSTGRES_HOST?.trim();
  const database = process.env.AZURE_POSTGRES_DATABASE?.trim();
  const user = process.env.AZURE_POSTGRES_USER?.trim();
  if (!host || !database || !user) {
    throw new Error("Configure AZURE_POSTGRES_HOST, AZURE_POSTGRES_DATABASE e AZURE_POSTGRES_USER.");
  }

  const credential = new DefaultAzureCredential();
  return new Pool({
    host,
    database,
    user,
    port: Number(process.env.AZURE_POSTGRES_PORT || 5432),
    password: async () => {
      const token = await credential.getToken("https://ossrdbms-aad.database.windows.net/.default");
      if (!token?.token) throw new Error("Não foi possível obter a identidade gerenciada do Azure.");
      return token.token;
    },
    ssl: { rejectUnauthorized: true },
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
}

const pool = createPool();
try {
  const sql = await readFile(new URL("../db/azure-postgresql.sql", import.meta.url), "utf8");
  await pool.query(sql);
  console.log("Schema do Azure Database for PostgreSQL preparado; tabelas existentes preservadas.");
} finally {
  await pool.end();
}
