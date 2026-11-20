import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultReview, importDuplicate, reviewIssue, selectedImportTotals } from '../lib/import-review';
import { parseImport, executeFinanceCommand } from '../lib/imports';
import { emptyState } from '../lib/demo';

const content='data;descricao;valor\n2026-11-16;Renda;3000,00\n2026-11-16;Compra;-200,00\n2026-11-16;Transferencia;-800,00\n2026-11-16;Fatura;-200,00';
test('default review stays pending and selection totals do not confuse cash with consumption', () => {
  const rows=parseImport('a.csv',content).rows, state=emptyState(), before=JSON.stringify(state);
  assert.ok(reviewIssue(rows[0],defaultReview(rows[0])));
  assert.ok(selectedImportTotals(state,rows,{},[2]).error);
  const reviews=Object.fromEntries(rows.map((row,i)=>[row.line,{...defaultReview(row),nature:(['income','expense','transfer','invoice_payment'] as const)[i]}]));
  assert.deepEqual(selectedImportTotals(state,rows,reviews,[2,3,4,5]),{income:300000,expenses:20000,error:null});
  assert.equal(JSON.stringify(state),before);
});
test('preview reserves legacy and undone rows within the same account only', async () => {
  const state=await executeFinanceCommand(emptyState(),{id:'old',type:'import.commit',payload:{name:'a.csv',content,account:'Teste',accepted:[2]}});
  const row=parseImport('a.csv',content).rows[0], batch=state.importBatches![0];
  assert.equal(importDuplicate(row,[batch],'Teste','csv',batch.hash),'exact');
  assert.equal(importDuplicate(row,[{...batch,status:'ignored'}],'Teste','csv',batch.hash),'exact');
  assert.equal(importDuplicate(row,[batch],'Outra','csv',batch.hash),null);
  assert.equal(importDuplicate(row,[batch],'Teste','csv','other'),null);
});
test('preview validates collective refund amounts and the original category', async () => {
  const state=await executeFinanceCommand(emptyState(),{id:'purchase',type:'import.commit',payload:{name:'a.csv',content,account:'Teste',accepted:[3]}});
  const original=state.transactions[0];
  const rows=parseImport('refund.csv','data;descricao;valor\n2026-11-16;Estorno;50,00\n2026-11-16;Estorno;160,00').rows;
  const reviews=Object.fromEntries(rows.map(row=>[row.line,{...defaultReview(row),nature:'refund' as const,refundOf:original.id}]));
  assert.equal(selectedImportTotals(state,rows,reviews,[2]).expenses,-5000);
  assert.match(selectedImportTotals(state,rows,reviews,[2,3]).error!,/ultrapassam/);
});
