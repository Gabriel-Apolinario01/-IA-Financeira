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
import { POST as chat } from '../../app/api/chat/route';
import { POST as documentPost } from '../../app/api/document/route';
import { PDFDocument } from 'pdf-lib';

test('PostgreSQL real: cadastro, senha, sessão, isolamento, persistência, CSRF, exclusão e logout', { timeout: 120_000 }, async (t) => {
  const root = path.resolve('.test-data');
  const databaseDir = path.resolve(root, randomUUID());
  assert.ok(databaseDir.startsWith(root + path.sep));
  await mkdir(root, { recursive: true });
  const port = Number(process.env.TEST_POSTGRES_PORT || 55439), password = randomBytes(24).toString('hex');
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
  process.env.AI_ENABLED = 'false';
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
  const document = await PDFDocument.create();
  document.addPage().drawText('Conta de energia\nTotal R$ 182,34\nVencimento 25/11/2026',{x:30,y:600});
  const bytes = Buffer.from(await document.save());
  const upload = (cookie: string, body = bytes, extra: Record<string,string> = {}) => new Request(process.env.BETTER_AUTH_URL + '/api/document', {
    method:'POST', headers:{origin:process.env.BETTER_AUTH_URL!,cookie,'content-type':'application/pdf',...extra},body,
  });
  assert.equal((await documentPost(upload(''))).status,401);
  const extracted = await documentPost(upload(alice));
  assert.equal(extracted.status,200); const preview = await extracted.json();
  assert.equal(preview.rows[0].amount,18234); assert.equal(preview.rows[0].status,'planned');
  assert.equal((await (await documentPost(upload(alice))).json()).hash,preview.hash);
  const snapshot = async (cookie: string) => (await readState(request('/api/state',undefined,cookie))).json();
  const beforeDoc = await snapshot(alice);
  assert.equal(beforeDoc.state.transactions.length,1);
  const confirmed = {generation:beforeDoc.generation,revision:beforeDoc.revision,command:{
    id:'doc-receipt',type:'document.confirm',payload:{hash:preview.hash, rows:[{...preview.rows[0],type:'expense',description:'Energia corrigida'}]},
  }};
  assert.equal((await command(request('/api/command',confirmed,alice))).status,200);
  assert.equal((await command(request('/api/command',confirmed,alice))).status,200);
  const afterDoc = await snapshot(alice);
  assert.equal(afterDoc.state.transactions.length,2); assert.equal(afterDoc.state.transactions[1].description,'Energia corrigida');
  assert.equal((await snapshot(bob)).state.transactions.length,0);
  const chatBody={month:'2026-11',question:'Quanto gastei em moradia?',history:[],shareMessages:false,shareMetrics:true};
  assert.equal((await chat(request('/api/chat',chatBody))).status,401);
  assert.equal((await chat(request('/api/chat',{...chatBody,ownerId:'outra'},bob))).status,400);
  const balance = {...chatBody,question:'Como está minha renda?'};
  const aliceChat = await (await chat(request('/api/chat',balance,alice))).json();
  const bobChat = await (await chat(request('/api/chat',balance,bob))).json();
  assert.match(aliceChat.facts.join(' '),/123,45/); assert.doesNotMatch(bobChat.facts.join(' '),/123,45/);
  assert.equal((await snapshot(alice)).revision,afterDoc.revision);
  // Only the injected transport receives an image. No real provider or credentials in this test.
  process.env.DOCUMENT_VISION_ENABLED = 'true';
  process.env.GROQ_VISION_MODEL = 'qwen/qwen3.8-27b'; process.env.GROQ_API_KEY = 'test-only';
  let calls = 0;
  t.mock.method(globalThis,'fetch',async (url: string) => {
    assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
    calls++;
    return calls === 1 ? new Response(null,{status:503}) : Response.json({choices:[{finish_reason:'stop',message:{content:'{"text":"Boleto fictício"}'}}]});
  });
  const ambiguous = await PDFDocument.create();
  ambiguous.addPage().drawText('Boleto ficticio sem valor',{x:30,y:600});
  const scan = Buffer.from(await ambiguous.save());
  const local = async () => (await documentPost(upload(bob,scan))).json();
  const second = (token: string) => documentPost(upload(bob,scan,{'x-document-vision-consent':'once','x-document-offer':token}));
  const beforeReading = await snapshot(bob);
  const first = await local();
  assert.equal(calls,0); assert.equal(first.rows[0].amount,null);
  assert.equal((await second(first.offers[0].token)).status,503);
  const retry = await local();
  const accepted = await second(retry.offers[0].token);
  assert.equal(accepted.status,200); assert.equal((await accepted.json()).page,1);
  assert.equal((await second(retry.offers[0].token)).status,400);
  assert.equal(calls,2); assert.deepEqual(await snapshot(bob),beforeReading);
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'groq';
  process.env.GROQ_MODEL = 'test-only';
  process.env.AI_GLOBAL_DAILY_LIMIT = '3';
  const interpret = (consent:boolean) => documentPost(upload(alice,bytes,{
    'x-document-action':'interpret','x-document-page':'1',...(consent ? {'x-document-text-consent':'once'} : {}),
  }));
  const beforeText = await snapshot(alice);
  assert.equal((await interpret(false)).status,403);
  assert.equal(calls,2);
  t.mock.method(globalThis,'fetch',async (_url:string,options:RequestInit) => {
    calls++;
    const payload = JSON.parse(String(options.body));
    assert.match(payload.messages[1].content,/182,34/);
    assert.doesNotMatch(payload.messages[1].content,/image_url|base64/);
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"transactions":[]}'}}]});
  });
  assert.equal((await interpret(true)).status,200);
  assert.equal((await interpret(true)).status,429);
  assert.equal(calls,3);
  assert.deepEqual(await snapshot(alice),beforeText);
});
