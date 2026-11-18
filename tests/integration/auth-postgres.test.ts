import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { getMigrations } from 'better-auth/db/migration';
import { createEmailAuth } from '../../lib/auth-config.mjs';
import { azurePostgresPool, closeAzurePostgresPool } from '../../lib/azure-postgres';
import { POST as authPost } from '../../app/api/auth/[...all]/route';
import { GET as readState } from '../../app/api/state/route';
import { POST as command } from '../../app/api/command/route';
import { POST as logout } from '../../app/api/logout/route';
import { DELETE as deleteData } from '../../app/api/account/route';

test('PostgreSQL real: cadastro, senha, sessão, isolamento, persistência, CSRF, exclusão e logout', { timeout: 120_000 }, async (t) => {
  const root = path.resolve('.test-data');
  const databaseDir = path.resolve(root, randomUUID());
  assert.ok(databaseDir.startsWith(root + path.sep));
  await mkdir(root, { recursive: true });
  const port = 55439, password = randomBytes(24).toString('hex');
  const cluster = new EmbeddedPostgres({ databaseDir, port, user: 'postgres', password,
    // Windows/OneDrive may still hold cluster files after shutdown. Keep ignored test files.
    persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'],
    autoRehydrateSymlinks: true, onLog: () => {}, onError: () => {} });
  await cluster.initialise();
  await cluster.start();
  t.after(async () => { await closeAzurePostgresPool(); await cluster.stop(); });
  process.env.AZURE_POSTGRES_CONNECTION_STRING = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  process.env.AZURE_POSTGRES_SSL = 'false'; process.env.AZURE_AUTH_MODE = 'email';
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
  process.env.BETTER_AUTH_URL = 'http://localhost:5174';
  const pool = azurePostgresPool();
  const sql = await readFile(new URL('../../db/azure-postgresql.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  const auth = createEmailAuth(pool);
  await (await getMigrations(auth.options)).runMigrations();
  const request = (route: string, body?: unknown, cookie = '', origin = process.env.BETTER_AUTH_URL!) => new Request(`${process.env.BETTER_AUTH_URL}${route}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookieOf = (response: Response) => response.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
  const credential = { email: 'alice@example.test', name: 'Alice', password: 'Test-only-passphrase-42!' };
  const register = await authPost(request('/api/auth/sign-up/email', credential));
  assert.equal(register.status, 200, await register.clone().text());
  const alice = cookieOf(register); assert.ok(alice.includes('session_token')); assert.match(register.headers.get('set-cookie')!, /HttpOnly/i);
  const bobResponse = await authPost(request('/api/auth/sign-up/email', { ...credential, email: 'bob@example.test', name: 'Bob' }));
  assert.equal(bobResponse.status, 200); const bob = cookieOf(bobResponse);
  const stored = await pool.query('SELECT password FROM account');
  assert.equal(stored.rows.length, 2); for (const row of stored.rows) assert.notEqual(row.password, credential.password);
  assert.equal((await readState(request('/api/state'))).status, 401);
  assert.equal((await readState(request('/api/state', undefined, 'better-auth.session_token=forged'))).status, 401);
  const initial = await (await readState(request('/api/state', undefined, alice))).json();
  assert.equal(initial.state.transactions.length, 0);
  const change = { generation: initial.generation, revision: initial.revision, ownerId: 'bob', command: { id: 'test-income', type: 'transaction.save', payload: {
    id: 'income-1', type: 'income', description: 'Entrada teste', amount: 12345, category: 'outros', date: '2026-11-01', status: 'realized', expenseKind: 'variable',
  } } };
  assert.equal((await command(request('/api/command', change, alice, 'https://attacker.invalid'))).status, 403);
  assert.equal((await command(request('/api/command', change, alice))).status, 200);
  assert.equal((await command(request('/api/command', change, alice))).status, 200); // idempotent retry
  const aliceState = await (await readState(request('/api/state', undefined, alice))).json();
  const bobState = await (await readState(request('/api/state', undefined, bob))).json();
  assert.equal(aliceState.state.transactions[0].amount, 12345); assert.equal(aliceState.state.transactions.length, 1);
  assert.equal(bobState.state.transactions.length, 0);
  assert.equal((await command(request('/api/command', { ...change, generation: initial.generation, command: { ...change.command, id: 'different' } }, bob))).status, 409);
  await pool.query(sql); await (await getMigrations(auth.options)).runMigrations();
  assert.equal((await (await readState(request('/api/state', undefined, alice))).json()).state.transactions.length, 1);
  const badLogin = await authPost(request('/api/auth/sign-in/email', { email: credential.email, password: 'wrong-password-value' }));
  assert.equal(badLogin.status, 401);
  const newLogin = await authPost(request('/api/auth/sign-in/email', credential)); assert.equal(newLogin.status, 200);
  const alice2 = cookieOf(newLogin);
  assert.equal((await (await readState(request('/api/state', undefined, alice2))).json()).state.transactions.length, 1);
  const deletion = request('/api/account', { confirmation: 'EXCLUIR' }, bob);
  assert.equal((await deleteData(new Request(deletion, { method: 'DELETE' }))).status, 200);
  assert.equal((await (await readState(request('/api/state', undefined, alice))).json()).state.transactions.length, 1);
  assert.equal((await logout(request('/api/logout', {}, alice2))).status, 200);
  assert.equal((await readState(request('/api/state', undefined, alice2))).status, 401);
  // No route exposes the auth library's unrelated administrative or account endpoints.
  assert.equal((await authPost(request('/api/auth/delete-user', {}, alice))).status, 404);
});
