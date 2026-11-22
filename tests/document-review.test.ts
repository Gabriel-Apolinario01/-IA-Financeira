import test from 'node:test';
import assert from 'node:assert/strict';
import { documentDrafts } from '../lib/document-drafts';
import { applyCommand } from '../lib/commands';
import { emptyState } from '../lib/demo';
import { monthMetrics } from '../lib/finance';
import { offerSecondReadings, redeemSecondReading } from '../lib/document-offers';

test('segunda leitura só para páginas ambíguas, vinculada ao dono e documento uma vez', () => {
  const rows = documentDrafts([
    {text:'Conta de energia\nTotal R$ 92,00\nVencimento 11/11/2026'},
    {text:'Boleto\nTotal 12,00\nTotal 25,00\nEmissão 11/11/2026\nEmissão 12/11/2026'},
  ]);
  assert.deepEqual(rows[0].ambiguities,[]);
  for (const signal of [/valor total/,/Moeda/,/Vencimento/,/Datas conflitantes/]) assert.match(rows[1].ambiguities.join(' '),signal);
  const offers = offerSecondReadings('alice','arquivo-A',rows);
  assert.deepEqual(offers.map(o => o.page),[2]);
  const token = offers[0].token;
  assert.equal(redeemSecondReading(token,'alice','arquivo-B'),null);
  assert.equal(redeemSecondReading(token,'bob','arquivo-A'),null);
  assert.equal(redeemSecondReading(token,'alice','arquivo-A'),2);
  assert.equal(redeemSecondReading(token,'alice','arquivo-A'),null);
});

test('extrai duas contas distintas e mantém o vencimento como previsto', () => {
  const rows = documentDrafts([{text: 'CONTA DE ENERGIA\nEmissor: Luz Fictícia\nTotal R$ 182,34\nVencimento 25/11/2026\nCONTA DE ÁGUA\nValor do documento R$ 63,10\nVencimento 24/11/2026'}]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].issuer, 'Luz Fictícia'); assert.equal(rows[0].category, 'moradia');
  assert.equal(rows[0].date, '2026-11-25'); assert.equal(rows[0].paidDate, '');
  assert.equal(rows[0].amount, 18234); assert.equal(rows[0].status, 'planned');
  assert.equal(rows[1].amount, 6310);
});
test('cupom com itens usa o total; valores conflitantes, moeda estrangeira e documento ilegível exigem correção', () => {
  const draft = (text: string) => documentDrafts([{text}])[0];
  assert.equal(draft('Cupom fiscal\nProduto 12,34\nProduto 20,00\nTotal R$ 32,34').amount, 3234);
  assert.equal(draft('Fatura\nTotal R$ 12,34\nTotal R$ 23,45').amount, null);
  assert.equal(draft('Boleto\nTotal US$ 1.234,56').amount, null);
  assert.equal(draft('').date, ''); assert.equal(draft('').nature, 'unidentified');
  assert.equal(draft('Comprovante PIX\nPIX enviado\nValor pago R$ 90,00\nPago em 22/11/2026').paidDate, '2026-11-22');
  assert.equal(draft('Comprovante PIX\nPagamento agendado\nValor pago R$ 90,00').status, 'planned');
});
test('tabela de fatura separa compras, preserva linha ambígua para revisão e exclui total do consumo',()=>{
  const rows=documentDrafts([{text:'Fatura\nData Descrição Valor\n19/11/2026 Padaria R$ 12,34\n20/11/2026 Farmácia R$ 20,00\nLinha ilegível\nTotal R$ 32,34'}]);
  assert.deepEqual(rows.map(r=>r.amount),[1234,2000,null]);
  assert.equal(rows[0].description,'Padaria');assert.equal(rows[0].nature,'expense');
  assert.equal(rows[2].nature,'unidentified');
});
test('confirmação atômica preserva correções, observações, total e identidade após recarga', () => {
  const initial = emptyState();
  const rows = [{line:1, nature:'expense', type:'expense', category:'moradia', amount:18234,
    date:'2026-11-25', description:'Energia revisada', note:'Mês de outubro', status:'planned'}];
  const command = {id:'confirm', type:'document.confirm', payload:{hash:'a'.repeat(64),rows}};
  const state = JSON.parse(JSON.stringify(applyCommand(initial, command)));
  assert.equal(state.transactions[0].note,'Mês de outubro');
  assert.equal(monthMetrics(state,'2026-11').pendingExpenses,18234);
  assert.equal(monthMetrics(state,'2026-11').expenses,0);
  assert.throws(() => applyCommand(state,command), /já adicionado/);
  assert.throws(() => applyCommand(initial,{...command,payload:{...command.payload,rows:[...rows,{...rows[0],line:2,nature:'unidentified'}]}}),/natureza/);
  assert.equal(initial.transactions.length,0);
});


test('OCR com valores plausíveis oferece releitura visual opcional e exige consentimento específico', () => {
  const rows = documentDrafts([{text: 'Conta de energia\nTotal R$ 182,34\nVencimento 25/11/2026'}]);
  assert.equal(rows[0].ambiguities.length, 0);
  const suggestions = offerSecondReadings('ocr-account', 'ocr-safe-hash', rows, [{method:'ocr'}]);
  assert.deepEqual(suggestions.map(item => item.page), [1]);
  assert.equal(redeemSecondReading(suggestions[0].token, 'other-account', 'ocr-safe-hash'), null);
  assert.equal(redeemSecondReading(suggestions[0].token, 'ocr-account', 'ocr-safe-hash'), 1);
  assert.equal(redeemSecondReading(suggestions[0].token, 'ocr-account', 'ocr-safe-hash'), null);
  assert.deepEqual(offerSecondReadings('pdf-text-account', 'pdf-text-hash', rows, [{method:'text'}]), []);
});
