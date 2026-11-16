import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeImport, executeFinanceCommand, parseImport } from '../lib/imports';
import { emptyState } from '../lib/demo';

const row = (value: string, locale: 'br'|'us'|'auto' = 'br') => parseImport('synthetic.csv',`data;descricao;valor\n16/11/2026;Padaria;${value}`,locale).rows[0];
for (const [input,cents] of [['-R$ 42,35',-4235],['R$ -1.234,56',-123456],['R$\u00a012,34',1234],['+12,34',1234],['-0,01',-1]] as const) {
  test(`BR currency decoration preserves exact cents: ${input}`, () => {assert.equal(row(input).amount,cents);assert.equal(row(input).error,undefined);});
}
test('dot decimals require matching format; no silent fallback from explicit BR', () => {
  assert.match(row('-42.35').error!,/formato/);
  assert.equal(row('-42.35','us').amount,-4235);
  assert.equal(row('-42.35','auto').amount,-4235);
  assert.ok(row('12,3456').error);
  assert.ok(row('R$ 1 234,56').error);
});
test('auto mode refuses ambiguous numbers and inconsistent file conventions', () => {
  assert.match(row('1.234','auto').error!,/ambíguo/);
  assert.match(row('1,234','auto').error!,/ambíguo/);
  assert.equal(row('1.234','br').amount,123400);
  assert.equal(row('1,234','us').amount,123400);
  const parsed=parseImport('mixed.csv','data;descricao;valor\n2026-11-16;Um;-12,34\n2026-11-16;Dois;-12.34','auto');
  assert.ok(parsed.rows.every(r=>r.error?.includes('inconsistentes')));
});
test('comma-delimited quoted values, reordered alias headers, BOM and quotes parse', () => {
  const parsed=parseImport('quoted.csv','\uFEFF"Histórico","Valor do lançamento","Data de lançamento"\r\n"Padaria, loja ""Centro""","-R$ 12,34",16/11/2026');
  assert.equal(parsed.rows[0].description,'Padaria, loja "Centro"');assert.equal(parsed.rows[0].amount,-1234);
  assert.equal(parsed.rows[0].date,'2026-11-16');
  assert.equal(parseImport('a.tsv','descricao\tvalor\tdata\nFarmácia\t-10,50\t2026-11-16').rows[0].amount,-1050);
});
test('separate debit and credit columns set direction and reject contradictory entries', () => {
  const parsed=parseImport('columns.csv','data;historico;entrada;saida;saldo\n2026-11-16;Recebido;1000,00;;1000,00\n2026-11-16;Mercado;0,00;R$ 12,34;987,66\n2026-11-16;Ambos;10,00;10,00;987,66\n2026-11-16;Vazio;;;987,66');
  assert.deepEqual(parsed.rows.slice(0,2).map(r=>r.amount),[100000,-1234]);
  assert.ok(parsed.rows[2].error);assert.ok(parsed.rows[3].error);
  assert.throws(()=>parseImport('a.csv','data;descricao;valor;debito;credito\n2026-11-16;Loja;10,00;;10,00'),/cabeçalhos/);
});
test('balances and totals cannot become income even when dated and selected directly', async () => {
  const content='data;descricao;valor\n2026-11-16;Saldo anterior;3000,00\n2026-11-16;Total;3000,00\n2026-11-16;Padaria;-10,00';
  const parsed=parseImport('a.csv',content);assert.ok(parsed.rows[0].error);assert.ok(parsed.rows[1].error);assert.equal(parsed.rows[2].amount,-1000);
  await assert.rejects(executeFinanceCommand(emptyState(),{id:'balance',type:'import.commit',payload:{name:'a.csv',content,locale:'br',account:'Teste',accepted:[2],natures:{'2':'income'}}}),/inválidas/);
});
test('missing amounts, malformed CSV, ambiguous headers and excessive input stay invalid', () => {
  assert.ok(row('').error);
  for (const content of ['data;descricao;valor\n2026-11-16;"aberto;12,00','data;date;descricao;valor\n2026-11-16;2026-11-16;Loja;12,00','data;descricao;valor\n'+Array(301).fill('2026-11-16;Loja;12,00').join('\n'),'x'.repeat(100001)]) assert.throws(()=>parseImport('a.csv',content));
  assert.ok(parseImport('a.csv','data,descricao,valor\n2026-11-16,Loja,-12,34').rows[0].error);
});
test('encoding is explicit: strict UTF-8, Windows-1252, BOM and binary rejection', () => {
  const bytes=new Uint8Array([70,97,114,109,225,99,105,97]);
  assert.throws(()=>decodeImport(bytes.buffer),/Codificação incompatível/);
  assert.equal(decodeImport(bytes.buffer,'windows-1252'),'Farmácia');
  assert.equal(decodeImport(new TextEncoder().encode('\uFEFFFarmácia').buffer),'Farmácia');
  assert.throws(()=>decodeImport(new Uint8Array([255,254,65,0]).buffer,'windows-1252'),/incompatível/);
  assert.throws(()=>parseImport('a.csv','data;descricao;valor\n2026-11-16;Farm\uFFFDcia;12,00'),/inválido/);
});
