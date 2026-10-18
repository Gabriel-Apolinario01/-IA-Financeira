// Integration test for an EMPTY, disposable local Sites identity only.
// Never points to production, never prints financial payloads or cookies.
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5173';
let cookie = '';
let checks = 0;
async function request(path, options = {}) {
  const response = await fetch(base + path, { redirect: 'manual', ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  return { response, data };
}
function check(condition, message) { assert.ok(condition, message); checks++; console.log('OK:', message); }
const anonymous = await request('/api/state');
check(anonymous.response.status === 401, 'anonymous API access is denied');
const forged = await request('/api/state', { headers: { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'forged@example.test' } });
check(forged.response.status === 401, 'local auth middleware strips forged identity headers');
const login = await request('/signin-with-chatgpt?return_to=%2F%3Fmode%3Daccount');
cookie = (login.response.headers.get('set-cookie') || '').split(';')[0];
check(login.response.status === 302 && Boolean(cookie), 'native starter local test sign-in returns a session');
let snapshot = (await request('/api/state')).data;
check(snapshot?.identity?.localPreview === true, 'identity is explicitly marked as local test');
assert.ok(snapshot.state.transactions.length === 0 && snapshot.state.goals.length === 0 && snapshot.state.debts.length === 0 && !snapshot.state.profile.name, 'Use only an empty disposable local identity. No data changed.');
check(snapshot.revision === 0, 'local account starts empty without demo records');
async function command(type, payload, id = crypto.randomUUID(), revision = snapshot.revision) {
  const result = await request('/api/command', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: { id, type, payload }, revision, generation: snapshot.generation }) });
  if (result.response.ok) snapshot = result.data;
  return result;
}
const cross = await request('/api/command', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' });
check(cross.response.status === 403, 'cross-origin writes are denied');
const tx = { id: crypto.randomUUID(), description: 'Teste descartável', amount: 300000, type: 'income', category: 'outros', date: '2026-10-06', status: 'realized', expenseKind: 'variable' };
const commandId = crypto.randomUUID();
const saved = await command('transaction.save', tx, commandId);
check(saved.response.status === 200 && snapshot.state.transactions.length === 1, 'transaction persists through HTTP');
const revision = snapshot.revision;
await command('transaction.save', tx, commandId, 0);
check(snapshot.revision === revision && snapshot.state.transactions.length === 1, 'retried command is applied only once');
const stale = await command('profile.update', { name: 'Descartável' }, crypto.randomUUID(), 0);
check(stale.response.status === 409, 'stale revision cannot overwrite saved data');
const invalid = await command('transaction.save', { ...tx, amount: -1 });
check(invalid.response.status === 400, 'negative monetary input is rejected by server');
const reread = (await request('/api/state')).data;
check(reread.state.transactions[0].amount === 300000 && reread.revision === revision, 'a new HTTP read preserves saved data');
const diagnosis = await request('/api/diagnosis', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-10', question: 'Como posso organizar este mês?' }) });
check(diagnosis.response.status === 200 && diagnosis.data.mode === 'rules' && diagnosis.data.metrics.income === 300000, 'diagnosis reads persisted totals without an AI provider');
const exported = await request('/api/account');
check(exported.response.status === 200 && exported.data.state.transactions.length === 1, 'own account export returns persisted records');
const refused = await request('/api/account', { method: 'DELETE', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'NO' }) });
check(refused.response.status === 400, 'account deletion requires exact confirmation');
const deleted = await request('/api/account', { method: 'DELETE', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'EXCLUIR' }) });
check(deleted.response.status === 200 && deleted.data.deleted, 'disposable local account data can be deleted');
const fresh = (await request('/api/state')).data;
check(fresh.revision === 0 && fresh.state.transactions.length === 0, 'account recreation has no old records');
await request('/signout-with-chatgpt?return_to=%2F');
cookie = '';
check((await request('/api/state')).response.status === 401, 'requests without session remain denied after sign-out');
console.log(`Passed ${checks} local HTTP integration checks. Hosted authentication is not covered by this test.`);
