import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../lib/demo';
import { applyCommand } from '../lib/commands';
import { monthMetrics } from '../lib/finance';
import type { FinanceState, Transaction } from '../lib/types';

const tx = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, amount, description:'Fictício', type:'expense', category:'outros', date:'2026-11-16', status:'realized', expenseKind:'variable', ...extra,
});
const save = (state: FinanceState, transaction: Transaction) => applyCommand(state,{id:`save-${transaction.id}`,type:'transaction.save',payload:{...transaction}});

test('nature separates income and consumption from transfer cash flow and card settlement', () => {
  let state = save(emptyState(),tx('income',300000,{type:'income',nature:'income'}));
  state=save(state,tx('purchase',60000,{nature:'expense'}));
  state=save(state,tx('card',60000,{nature:'invoice_payment'}));
  state=save(state,tx('out',80000,{nature:'transfer'}));
  state=save(state,tx('in',80000,{nature:'transfer',type:'income'}));
  state=save(state,tx('unknown',10000,{nature:'unidentified'}));
  const metrics=monthMetrics(state,'2026-11');
  assert.equal(metrics.income,300000);assert.equal(metrics.expenses,60000);
  assert.equal(metrics.result,240000);assert.equal(metrics.cashResult,170000);
  assert.equal(metrics.categoryExpenses.outros,60000);assert.equal(metrics.pendingReview,1);
});

test('linked partial refund reduces consumption but unlinked refund never becomes income', () => {
  let state=save(emptyState(),tx('purchase',20000,{nature:'expense',category:'lazer'}));
  state=save(state,tx('refund',5000,{nature:'refund',type:'income',refundOf:'purchase'}));
  state=save(state,tx('pending',7000,{nature:'refund',type:'income'}));
  const metrics=monthMetrics(JSON.parse(JSON.stringify(state)),'2026-11');
  assert.equal(metrics.expenses,15000);assert.equal(metrics.income,0);
  assert.equal(metrics.categoryExpenses.lazer,15000);assert.equal(metrics.pendingReview,1);
  assert.equal(state.transactions[0].amount,20000);
});

test('refunds cannot exceed the original, cross direction/month, or leave dangling links', () => {
  let state=save(emptyState(),tx('purchase',20000));
  state=save(state,tx('refund',5000,{nature:'refund',type:'income',refundOf:'purchase'}));
  for(const patch of [{amount:16000},{refundOf:'missing'},{type:'expense' as const},{date:'2026-12-01'},{nature:'transfer' as const}]) {
    assert.throws(()=>save(state,tx('bad',5000,{nature:'refund',type:'income',refundOf:'purchase',...patch})));
  }
  assert.throws(()=>applyCommand(state,{id:'delete',type:'transaction.delete',payload:{id:'purchase'}}));
  assert.equal(monthMetrics(state,'2026-11').expenses,15000);
});

test('legacy transactions and planned items retain their prior accounting', () => {
  let state=save(emptyState(),tx('income',300000,{type:'income'}));
  state=save(state,tx('purchase',270000));
  assert.equal(monthMetrics(state,'2026-11').result,30000);
  state=save(state,tx('extra',1234));
  state=save(state,tx('planned-transfer',5000,{nature:'transfer',status:'planned'}));
  assert.equal(monthMetrics(state,'2026-11').result,28766);
  assert.equal(monthMetrics(state,'2026-11').pendingExpenses,0);
});
