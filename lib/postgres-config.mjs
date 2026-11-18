import { DefaultAzureCredential } from '@azure/identity';
import { Pool } from 'pg';

export function createPostgresPool() {
  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING?.trim();
  const host = process.env.AZURE_POSTGRES_HOST?.trim();
  const database = process.env.AZURE_POSTGRES_DATABASE?.trim();
  const user = process.env.AZURE_POSTGRES_USER?.trim();
  if (!connectionString && (!host || !database || !user)) {
    throw new Error('Configure a conexão PostgreSQL antes de iniciar o acesso por conta.');
  }
  const ssl = process.env.AZURE_POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: true };
  // Plaintext is permitted only for a database on this computer, including integration tests.
  let destination = host;
  if (connectionString) {
    try {
      const parsed = new URL(connectionString);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error();
      destination = parsed.hostname;
      // pg otherwise lets URL sslmode parameters override certificate validation.
      for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) {
        if (parsed.searchParams.has(key)) throw new Error();
      }
    } catch { throw new Error('URL PostgreSQL inválida. Configure TLS por AZURE_POSTGRES_SSL, sem parâmetros SSL na URL.'); }
  }
  if (!ssl && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(destination ?? '')) {
    throw new Error('PostgreSQL remoto exige TLS com certificado válido.');
  }
  const max = Number(process.env.AZURE_POSTGRES_POOL_SIZE || 5);
  if (!Number.isInteger(max) || max < 2 || max > 20) throw new Error('Pool PostgreSQL deve ter entre 2 e 20 conexões.');
  const credential = connectionString ? undefined : new DefaultAzureCredential();
  const pool = new Pool({
    ...(connectionString ? { connectionString } : {
      host, database, user, port: Number(process.env.AZURE_POSTGRES_PORT || 5432),
      password: async () => {
        const token = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
        if (!token?.token) throw new Error('Identidade gerenciada indisponível.');
        return token.token;
      },
    }),
    ssl, max, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
    statement_timeout: 10_000, idle_in_transaction_session_timeout: 15_000,
  });
  // An idle connection error must not crash the web process or expose connection parameters.
  pool.on('error', () => console.error('postgres_idle_connection_error'));
  return pool;
}
