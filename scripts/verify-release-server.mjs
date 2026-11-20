// Test harness runs outside the unpacked application. Only the harness has devDependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import EmbeddedPostgres from 'embedded-postgres';

const port = 55437;
const password = randomBytes(24).toString('hex');
const cluster = new EmbeddedPostgres({databaseDir:path.join(process.argv[2],'postgres'),port,
  user:'postgres',password,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],
  autoRehydrateSymlinks:true,onLog:()=>{},onError:()=>{}});
const origin = 'http://127.0.0.1:5177';
const env = { PATH:process.env.PATH, HOME:process.env.HOME, PORT:'5177',NODE_ENV:'production',
  AZURE_AUTH_MODE:'email',BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
  AZURE_POSTGRES_CONNECTION_STRING:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,AZURE_POSTGRES_SSL:'false',
  AI_ENABLED:'false',DOCUMENT_VISION_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1' };
let server;
async function start() {
  server = spawn(process.execPath,['scripts/start-azure.mjs'],{env,detached:true,stdio:'inherit'});
  for (let i=0;i<90;i++) {
    if (server.exitCode !== null) throw Error('O pacote encerrou durante a inicialização.');
    const health = await fetch(origin+'/api/health').catch(()=>null);
    if (health?.ok && (await health.json()).authentication) return;
    await wait(500);
  }
  throw Error('Prazo de inicialização excedido.');
}
async function stop() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server,'exit');
    process.kill(-server.pid,'SIGTERM'); // private group containing the wrapper and its Next child
    await stopped;
  }
  server = undefined;
}
let cookie = '';
async function request(route, body, mime='application/json') {
  const response = await fetch(origin+route,{method:body === undefined ? 'GET':'POST',
    headers:{origin,cookie,'content-type':mime},body:body === undefined || Buffer.isBuffer(body) ? body : JSON.stringify(body),
    signal:AbortSignal.timeout(60_000)});
  assert.equal(response.status,200,route+' HTTP '+response.status);
  return response;
}
await cluster.initialise();
await cluster.start();
try {
  await start();
  const registered = await request('/api/auth/sign-up/email',{email:'release@example.test',name:'Teste',password:randomBytes(24).toString('hex')});
  cookie = registered.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(cookie);
  const state = async () => (await request('/api/state')).json();
  const initial = await state();
  const docs = [['conta-sintetica.jpg','image/jpeg','ocr',18234],['cupom-sintetico.pdf','application/pdf','text',2000]];
  const [receipt] = await Promise.all(docs.map(async ([name,mime,method,amount]) => {
    const bytes = await readFile(new URL('../docs/evidencias-final/'+name,import.meta.url));
    const reading = await (await request('/api/document',bytes,mime)).json();
    assert.equal(reading.pages[0].method,method); assert.equal(reading.rows[0].amount,amount);
    return reading;
  }));
  assert.deepEqual(await state(),initial);
  const row = receipt.rows[0];
  await request('/api/command',{generation:initial.generation,revision:initial.revision,command:{id:'approved-test',
    type:'document.confirm',payload:{hash:receipt.hash,rows:[{...row,type:'expense'}]}}});
  await stop();
  await start();
  const after = await state();
  assert.equal(after.state.transactions.length,1); assert.equal(after.state.transactions[0].amount,18234);
  console.log('Release ZIP: cadastro, duas leituras simultâneas, confirmação e sessão com PostgreSQL após reiniciar aprovados.');
} finally {
  try { await stop(); } finally { await cluster.stop(); }
}
