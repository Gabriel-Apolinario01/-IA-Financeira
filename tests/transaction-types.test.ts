import test from 'node:test';
import assert from 'node:assert/strict';
import type { FinanceState, Transaction, TransactionNature } from '../lib/types';
import { emptyState } from '../lib/demo';

const legacy: Transaction = {
  id: 'legacy-expense', description: 'Despesa fictícia', amount: 1234,
  type: 'expense', category: 'outros', date: '2026-11-16',
  status: 'realized', expenseKind: 'variable',
};

test('all six transaction natures survive JSON serialization without changing cash direction', () => {
  const natures = ['income', 'expense', 'transfer', 'invoice_payment', 'refund', 'unidentified'] as const satisfies readonly TransactionNature[];
  for (const nature of natures) {
    const transaction: Transaction = { ...legacy, id: `nature-${nature}`, nature };
    const restored = JSON.parse(JSON.stringify(transaction)) as Transaction;
    assert.deepEqual(restored, transaction);
    assert.equal(restored.nature, nature);
    assert.equal(restored.type, 'expense');
    assert.equal(restored.amount, 1234);
  }
});

test('legacy transactions remain valid and do not acquire an inferred nature after serialization', () => {
  const restored = JSON.parse(JSON.stringify(legacy)) as Transaction;
  assert.deepEqual(restored, legacy);
  assert.equal(restored.nature, undefined);
  assert.equal(Object.hasOwn(restored, 'nature'), false);
});

test('a financial state can persist legacy and explicitly classified transactions together', () => {
  const state: FinanceState = emptyState();
  state.transactions = [legacy, { ...legacy, id: 'transfer', nature: 'transfer' }];
  const restored = JSON.parse(JSON.stringify(state)) as FinanceState;
  assert.deepEqual(restored, state);
  assert.equal(Object.hasOwn(restored.transactions[0], 'nature'), false);
  assert.equal(restored.transactions[1].nature, 'transfer');
});
