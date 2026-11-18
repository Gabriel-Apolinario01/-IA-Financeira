import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const folder = path.resolve('.local-postgres');
await mkdir(folder, { recursive: true });
const credentialsFile = path.join(folder, 'credentials.json');
let credentials;
try { credentials = JSON.parse(await readFile(credentialsFile, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = { password: randomBytes(24).toString('hex'), secret: randomBytes(32).toString('hex') };
  await writeFile(credentialsFile, JSON.stringify(credentials), { mode: 0o600, flag: 'wx' });
}
const cluster = new EmbeddedPostgres({ databaseDir: path.join(folder, 'data'), port: 55438,
  user: 'postgres', password: credentials.password, persistent: true,
  authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'], autoRehydrateSymlinks: true,
  onLog: () => {}, onError: () => console.error('local_postgres_error'),
});
try { await readFile(path.join(folder, 'data', 'PG_VERSION')); }
catch (error) { if (error.code !== 'ENOENT') throw error; await cluster.initialise(); }
await cluster.start();
const env = { ...process.env, AZURE_AUTH_MODE: 'email', AZURE_POSTGRES_SSL: 'false',
  AZURE_POSTGRES_CONNECTION_STRING: `postgresql://postgres:${credentials.password}@127.0.0.1:55438/postgres`,
  BETTER_AUTH_SECRET: credentials.secret, BETTER_AUTH_URL: 'http://localhost:5174',
};
let server;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server?.kill();
  await cluster.stop();
}
process.on('SIGINT', () => { void stop().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { void stop().finally(() => process.exit(0)); });
try {
  const preparation = spawn(process.execPath, ['scripts/prepare-azure-db.mjs'], { env, stdio: 'inherit', windowsHide: true });
  const exit = await new Promise((resolve, reject) => { preparation.on('error', reject); preparation.on('exit', resolve); });
  if (exit !== 0) throw new Error('Falha ao preparar o PostgreSQL local.');
  const production = process.argv.includes('--production');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', production ? 'start' : 'dev', ...(production ? [] : ['--webpack']), '--hostname', '127.0.0.1', '--port', '5174'], { env, stdio: 'inherit', windowsHide: true });
  console.log('Conta com PostgreSQL local em http://localhost:5174/login. Dados ficam nesta máquina.');
  await new Promise((resolve, reject) => { server.on('error', reject); server.on('exit', resolve); });
} finally { await stop(); }
