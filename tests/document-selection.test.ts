import test from 'node:test';
import assert from 'node:assert/strict';
import { documentDrafts } from '../lib/document-drafts';
import { comparePage, confirmedRows, editReview, eligible, selectReviews, startReview, startReviews } from '../lib/document-review';

const [draft] = documentDrafts([{text:'Conta de energia\nTotal R$ 3.896,88\nVencimento 11/07/2018'}]);
const row = startReview(draft);
const blocked = new Set([4]);
test('seleciona somente válidos, ignora incompletos, ambiguidades e duplicidades e desmarca todos', () => {
  const input = [row,{...row,line:2,date:''},{...row,line:3,ambiguities:['Valor contraditório']},{...row,line:4},{...row,line:5}];
  const selected = selectReviews(input,true,blocked);
  assert.deepEqual(selected.map(r => r.selected),[true,false,false,false,true]);
  assert.ok(input.every(r => !r.selected));
  const individual = selected.map(r => r.line === 1 ? editReview(r,{selected:false},blocked) : r);
  assert.deepEqual(confirmedRows(individual,blocked).map(r => r.line),[5]);
  assert.deepEqual(confirmedRows(selectReviews(selected,false,blocked),blocked),[]);
});
test('corrigir libera seleção, editar incorretamente remove seleção até novo clique', () => {
  const chosen = editReview(row,{selected:true},blocked);
  const invalid = editReview(chosen,{value:'-1'},blocked);
  assert.equal(invalid.selected,false);
  assert.deepEqual(confirmedRows([{...invalid,selected:true}],blocked),[]);
  const fixed = editReview(invalid,{value:'12,45'},blocked);
  assert.ok(eligible(fixed,blocked));
  assert.equal(fixed.selected,false);
  assert.equal(confirmedRows([editReview(fixed,{selected:true},blocked)],blocked)[0].amount,1245);
});
test('moeda, descrição, natureza, direção e situação são validadas antes de confirmar', () => {
  for (const invalid of [{currency:null},{description:' '},{nature:'income'},{status:''},{value:'0'},{date:'2018-02-30'}]) {
    assert.deepEqual(confirmedRows([{...row,...invalid,selected:true} as typeof row],blocked),[]);
  }
});
test('duas leituras plausíveis divergentes preservam edição manual e exigem revisão explícita', () => {
  const manual = editReview(row,{value:'3.896,33',description:'Corrigida',note:'Minha nota',selected:true},blocked);
  const [pending] = comparePage([manual],[draft],1,[{...draft,amount:389633}]);
  assert.deepEqual([pending.value,pending.note,pending.description],['3.896,33','Minha nota','Corrigida']);
  assert.equal(pending.selected,false);
  assert.equal(eligible(pending,blocked),false);
  assert.equal(eligible(editReview(pending,{reviewed:true},blocked),blocked),true);
  assert.equal(comparePage([manual],[draft],1,[draft])[0],manual);
});


test('linhas repetidas exigem conferência antes da seleção em massa', () => {
  const repeated = startReviews([draft,{...draft,line:2}]);
  assert.deepEqual(selectReviews(repeated,true,blocked).map(r => r.selected),[true,false]);
});
