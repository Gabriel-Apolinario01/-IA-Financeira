import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../lib/demo';
import { applyCommand } from '../lib/commands';
import { executeFinanceCommand } from '../lib/imports';
import { monthMetrics } from '../lib/finance';
import type { FinanceState, Transaction } from '../lib/types';

const month = '2026-11';
const tx = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, amount, description: 'Fictício', type: 'expense', category: 'outros', date: `${month}-16`, status: 'realized', expenseKind: 'variable', ...extra });
const save = (state: FinanceState, value: Transaction) => applyCommand(state, { id: `cmd-${value.id}`, type: 'transaction.save', payload: { ...value } });

for (const [income, expense, expected] of [[300000,240000,80],[200000,250000,125],[300000,0,0]]) {
  test(`commitment uses recognized income ${income} and consumption ${expense}`, () => {
    let state = save(emptyState(), tx('income',income,{type:'income'}));
    if (expense) state = save(state,tx('expense',expense));
    assert.equal(monthMetrics(state,month).commitment.percent,expected);
    assert.equal(state.transactions[0].nature,undefined);
  });
}
test('unknown income and explicitly confirmed zero have no percentage; profile estimates are not receipts', () => {
  const state = emptyState(); state.profile.expectedIncome = 300000;
  assert.equal(monthMetrics(state,month).commitment.status,'unknown');
  assert.equal(monthMetrics(state,month).commitment.percent,null);
  state.profile.confirmedNoIncomeMonths.push(month);
  assert.equal(monthMetrics(state,month).commitment.status,'zero');
  assert.equal(monthMetrics(state,month).commitment.percent,null);
  assert.equal(monthMetrics(state,'2026-10').commitment.status,'unknown');
});
test('commitment survives reload, excludes transfers and invoice payments, and nets linked refunds', () => {
  let state = save(emptyState(),tx('income',300000,{type:'income',nature:'income'}));
  state = save(state,tx('expense',240000,{nature:'expense'}));
  for (const nature of ['transfer','invoice_payment'] as const) state=save(state,tx(nature,80000,{nature}));
  assert.equal(monthMetrics(state,month).commitment.percent,80);
  state=save(state,tx('refund',60000,{nature:'refund',type:'income',refundOf:'expense'}));
  assert.equal(monthMetrics(JSON.parse(JSON.stringify(state)),month).commitment.percent,60);
});
test('planned commitment is separate from realized and never uses transfer predictions', () => {
  let state = save(emptyState(),tx('income',100000,{type:'income'}));
  state = save(state,tx('expense',50000));
  state = save(state,tx('planned',25000,{status:'planned'}));
  state = save(state,tx('transfer',90000,{status:'planned',nature:'transfer'}));
  const metrics=monthMetrics(state,month);
  assert.equal(metrics.commitment.percent,50); assert.equal(metrics.projectedCommitment.percent,75);
});
test('reviewed import updates commitment and reimport cannot increase it twice', async () => {
  const state=save(emptyState(),tx('income',300000,{type:'income'}));
  const payload={name:'ficticio.csv',content:'data;descricao;valor\n2026-11-16;Compra;-2400,00\n2026-11-16;Fatura;-2400,00',account:'Teste',locale:'br',accepted:[2,3],natures:{'2':'expense','3':'invoice_payment'}};
  const result=await executeFinanceCommand(state,{id:'import',type:'import.commit',payload});
  assert.equal(monthMetrics(result,month).commitment.percent,80);
  await assert.rejects(executeFinanceCommand(result,{id:'reimport',type:'import.commit',payload}));
  assert.equal(monthMetrics(result,month).commitment.percent,80);
});
