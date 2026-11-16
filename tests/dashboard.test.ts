import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../lib/demo';
import { applyCommand } from '../lib/commands';
import { executeFinanceCommand } from '../lib/imports';
import { bettingSummary, monthMetrics } from '../lib/finance';
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

test('optional betting expense supports blank description, edits, reload and deletion once', () => {
  let state=save(emptyState(),tx('optional',10000,{category:'apostas',description:'',nature:'expense'}));
  assert.equal(state.transactions[0].description,'Gasto com apostas');
  assert.equal(bettingSummary(state,month).amount,10000);
  assert.equal(bettingSummary(state,month).share,100);
  state=save(state,{...state.transactions[0],amount:1234,description:'Registro opcional'});
  state=JSON.parse(JSON.stringify(state));
  assert.equal(bettingSummary(state,month).amount,1234);
  assert.equal(monthMetrics(state,month).expenses,1234);
  state=save(state,{...state.transactions[0],category:'lazer'});
  assert.equal(bettingSummary(state,month).records,0);
  state=applyCommand(state,{id:'delete',type:'transaction.delete',payload:{id:'optional'}});
  assert.equal(monthMetrics(state,month).expenses,0);
});
test('betting category uses net consumption and preserves absence, plans and legacy records', () => {
  let state=emptyState();
  assert.deepEqual(bettingSummary(state,month),{records:0,amount:0,pending:0,share:null});
  state=save(state,tx('original',20000,{category:'apostas'}));
  state=save(state,tx('refund',5000,{nature:'refund',type:'income',refundOf:'original'}));
  state=save(state,tx('transfer',80000,{nature:'transfer',category:'apostas'}));
  state=save(state,tx('planned',9000,{category:'apostas',status:'planned'}));
  state=save(state,tx('other',15000,{description:'Nome associado a apostas'}));
  assert.deepEqual(bettingSummary(state,month),{records:1,amount:15000,pending:9000,share:50});
  assert.equal(state.transactions[0].nature,undefined);
});
test('reviewed betting category persists, is not inferred, and cannot duplicate consumption', async () => {
  const payload={name:'ficticio.csv',content:'data;descricao;valor\n2026-11-16;Nome de casa de apostas;-100,00',account:'Teste',locale:'br',accepted:[2],natures:{'2':'expense'}};
  const unclassified=await executeFinanceCommand(emptyState(),{id:'unclassified',type:'import.commit',payload});
  assert.equal(bettingSummary(unclassified,month).records,0);
  const state=await executeFinanceCommand(emptyState(),{id:'review',type:'import.commit',payload:{...payload,edits:{'2':{category:'apostas'}}}});
  assert.equal(bettingSummary(JSON.parse(JSON.stringify(state)),month).amount,10000);
  assert.equal(monthMetrics(state,month).expenses,10000);
  await assert.rejects(executeFinanceCommand(state,{id:'replay',type:'import.commit',payload}));
});
