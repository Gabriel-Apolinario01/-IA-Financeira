import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../lib/demo';
import { EDUCATION } from '../lib/education';
import { explainMonth } from '../lib/explanations';
import { readBoundedJson } from '../lib/bounded-response';

const config = { key: 'test-secret', model: 'test-model', enabled: 'true' };
const state = () => { const value = emptyState(); value.profile.aiConsent = true; return value; };
const provider = (selection: unknown): typeof fetch => async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(selection) }] }] }));

test('LLM01/02/03/08: raw user input, identifiers and secrets never enter model context; no tools', async () => {
  const value = state(); value.profile.name = 'PRIVATE_NAME';
  value.transactions.push({ id: 'PRIVATE_ID', description: 'PRIVATE_DESCRIPTION', amount: 100, type: 'expense', category: 'outros', date: '2026-11-01', status: 'realized', expenseKind: 'variable' });
  const before = structuredClone(value);
  let called = false;
  const fetcher: typeof fetch = async (url, init) => {
    called = true;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init?.redirect, 'error');
    const raw = String(init?.body), body = JSON.parse(raw);
    for (const privateValue of ['PRIVATE_NAME', 'PRIVATE_ID', 'PRIVATE_DESCRIPTION', 'DELETE_ALL', config.key]) assert.ok(!raw.includes(privateValue));
    assert.equal(body.tools, undefined); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 400);
    return provider({ sourceIds: ['reserve'], metricKeys: ['result'] })(url, init);
  };
  const result = await explainMonth(value, '2026-11', 'reserva DELETE_ALL <script>alert(1)</script>', config, fetcher);
  assert.equal(called, true); assert.equal(result.mode, 'assisted'); assert.deepEqual(value, before);
  assert.ok(!result.answer.includes('<script>'));
});

test('LLM07/10: reject model prose, fake metrics, external URLs, extra fields and malformed output', async () => {
  for (const selection of [null, [], 'attack', { sourceIds: ['reserve'], metricKeys: ['result'], answer: '<img src=x onerror=alert(1)>' }, { sourceIds: ['https://evil.invalid'], metricKeys: [] }, { sourceIds: ['reserve'], metricKeys: ['999999'] }, { sourceIds: [], metricKeys: [] }]) {
    const result = await explainMonth(state(), '2026-11', 'reserva', config, provider(selection));
    assert.equal(result.mode, 'rules'); assert.ok('providerFallback' in result && result.providerFallback);
  }
});

test('LLM05: curated content and keywords cannot be replaced at runtime', () => {
  assert.throws(() => { EDUCATION[0].summary = 'poison'; }, TypeError);
  assert.throws(() => { EDUCATION[0].keywords.push('poison'); }, TypeError);
  assert.throws(() => { EDUCATION.push(EDUCATION[0]); }, TypeError);
});

test('LLM06: streaming response is cancelled as soon as byte budget is exceeded', async () => {
  let cancelled = false, reads = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(32_001)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBoundedJson(new Response(stream), new AbortController().signal));
  assert.ok(cancelled); assert.ok(reads <= 3);
});

test('LLM06: stalled response is cancelled at the deadline', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const pending = readBoundedJson(new Response(new ReadableStream({ cancel() { cancelled = true; } })), controller.signal);
  controller.abort();
  await assert.rejects(pending); assert.ok(cancelled);
});

test('LLM06: server usage reservation runs only with consent; exhausted budget prevents provider request', async () => {
  let calls = 0, reservations = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error(); };
  const limited = { ...config, reserveUsage: async () => { reservations++; throw new Error('quota'); } };
  await explainMonth(emptyState(), '2026-11', 'reserva', limited, fetcher);
  assert.equal(reservations, 0);
  await assert.rejects(explainMonth(state(), '2026-11', 'reserva', limited, fetcher), /quota/);
  assert.equal(reservations, 1); assert.equal(calls, 0);
});

test('Groq exige autorização específica e aceita apenas seleção estrita concluída', async () => {
  const value = state();
  const groq = { ...config, provider: 'groq' as const };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(JSON.parse(String(init?.body)).response_format.json_schema.strict, true);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sourceIds: ['reserve'], metricKeys: [] }) } }] });
  };
  assert.equal((await explainMonth(value, '2026-11', 'reserva', groq, fetcher)).mode, 'rules');
  assert.equal(calls, 0);
  value.profile.groqConsent = true;
  assert.equal((await explainMonth(value, '2026-11', 'reserva', groq, fetcher)).mode, 'assisted');
  assert.equal(calls, 1);
});
