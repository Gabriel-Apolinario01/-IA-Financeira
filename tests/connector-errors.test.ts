import test from 'node:test';
import assert from 'node:assert/strict';
import { connectorResponse } from '../lib/connector-errors.mjs';

test('connector output retains validated content and removes private envelope fields', async () => {
  const response = connectorResponse({
    status: 'success', requestId: 'request-1', privateToken: 'must-not-leak',
    result: { content: [{ type: 'text', text: 'Confirmed' }], structuredContent: { count: 1 } },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    status: 'success', requestId: 'request-1',
    result: { content: [{ type: 'text', text: 'Confirmed' }], structuredContent: { count: 1 } },
  });
});

test('invalid or contradictory connector output never becomes a confirmed success', async () => {
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const result of [
    { status: 'success', result: { content: [{ type: 42 }] } },
    { status: 'success', error: 'unconfirmed', result: { content: [] } },
    { status: 'success', result: { content: [], structuredContent: cyclic } },
  ]) {
    const response = connectorResponse(result);
    assert.equal(response.status, 502);
    const body = await response.json() as { status: string; message: string };
    assert.equal(body.status, 'upstream_error');
    assert.match(body.message, /check before trying again/);
  }
});

test('connector failure preserves the retry contract without reporting success', async () => {
  const response = connectorResponse({
    status: 'rate_limited', message: 'Try later', retryAfterMs: 1000, requestId: 'request-2',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'rate_limited', message: 'Try later', retryAfterMs: 1000, requestId: 'request-2',
  });
});
