import assert from 'node:assert/strict';
import test from 'node:test';
import { parseImport, executeFinanceCommand, possibleMatches } from '../lib/imports';
import { emptyState } from '../lib/demo';
import type { Command } from '../lib/types';

const csv = 'data;descricao;valor\n29/10/2026;Mercado;-42,35\n2026-10-29;Salário;1.234,56';
const command = (content = csv, id = 'import1'): Command => ({ id, type: 'import.commit', payload: { name: 'extrato.csv', content, account: 'Principal', locale: 'br', accepted: [2,3] } });
test('CSV parses exact cents, quoted delimiters, TSV and rejects malformed data', () => {
  assert.deepEqual(parseImport('a.csv', csv).rows.map(r => r.amount), [-4235,123456]);
  assert.equal(parseImport('a.csv', 'data;descricao;valor\n2026-10-29;"Loja; Centro";-0,01').rows[0].description, 'Loja; Centro');
  assert.equal(parseImport('a.tsv', 'data\tdescricao\tvalor\n2026-10-29\tLoja\t-0,01').rows[0].amount, -1);
  assert.ok(parseImport('a.csv', 'data;descricao;valor\n2026-02-30;Loja;12,00').rows[0].error);
  assert.ok(parseImport('a.csv', 'data;descricao;valor\n2026-10-29;Loja;12,345').rows[0].error);
  assert.throws(() => parseImport('a.csv', 'data;descricao;valor\n2026-10-29;"Loja;12,00'));
  assert.throws(() => parseImport('a.xlsm', csv));
  assert.throws(() => parseImport('a.csv', '\0binary'));
});
test('commit has immutable provenance, hashes content server-side, and can undo/restore', async () => {
  const original = emptyState();
  const state = await executeFinanceCommand(original, command());
  assert.equal(original.transactions.length, 0);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.transactions[0].origin?.line, 2);
  assert.match(state.importBatches![0].hash, /^[a-f0-9]{64}$/);
  await assert.rejects(executeFinanceCommand(state, command(csv, 'import2')), /já importado/);
  await assert.rejects(executeFinanceCommand(state, { id:'edit', type:'transaction.save', payload:{ ...state.transactions[0], amount:1 } }), /importado/);
  const undone = await executeFinanceCommand(state, { id:'undo', type:'import.revert', payload:{ id:'import1' } });
  assert.equal(undone.transactions.length, 0);
  const restored = await executeFinanceCommand(undone, { id:'restore', type:'import.restore', payload:{ id:'import1' } });
  assert.deepEqual(restored.transactions, state.transactions);
  assert.equal(restored.importBatches![0].audit.length, 3);
});
const ofx = (fitid: string, memo = 'Mercado') => `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN><DTPOSTED>20261029120000[-3:BRT]<TRNAMT>-42.35<FITID>${fitid}<MEMO>${memo}</STMTTRN></BANKTRANLIST></STMTRS></OFX>`;
test('OFX SGML/XML parses and FITID is scoped to the named account', async () => {
  const request = (content: string, account = 'Principal', id = 'ofx1'): Command => ({ id, type:'import.commit', payload:{ name:'a.ofx', content, account, accepted:[1] } });
  const first = await executeFinanceCommand(emptyState(), request(ofx('fit1')));
  assert.equal(first.transactions[0].amount, 4235);
  await assert.rejects(executeFinanceCommand(first, request(ofx('fit1').replace('-42.35', '-99.99'), 'Principal', 'conflict')), /identificador externo/);
  const second = await executeFinanceCommand(first, request(ofx('fit1','Mercado alterado'), 'Principal', 'ofx2'));
  assert.equal(second.transactions.length, 1);
  assert.equal(second.importBatches![1].duplicates, 1);
  const other = await executeFinanceCommand(second, request(ofx('fit1','Outra conta'), 'Secundaria', 'ofx3'));
  assert.equal(other.transactions.length, 2);
  assert.equal(parseImport('a.ofx', ofx('x').replace('<CURDEF>BRL', '<CURDEF>BRL</CURDEF>').replace('<TRNAMT>-42.35', '<TRNAMT>-42.35</TRNAMT>')).rows[0].amount, -4235);
  assert.throws(() => parseImport('a.ofx', ofx('x').replace('BRL','USD')));
  assert.throws(() => parseImport('a.ofx', '<!DOCTYPE x>'+ofx('x')));
});
test('ambiguous rows need selection; possible matches never delete another record', async () => {
  const state = await executeFinanceCommand(emptyState(), command());
  assert.equal(possibleMatches(parseImport('a.csv', csv).rows[0],state.transactions).length, 1);
  const request = command(csv+'\n2026-10-30;Café;-10,00','second');
  request.payload.accepted = [4];
  const next = await executeFinanceCommand(state, request);
  assert.equal(next.transactions.length, 3);
  assert.equal(next.importBatches![1].ignored, 2);
  request.payload.accepted = [999];
  await assert.rejects(executeFinanceCommand(emptyState(), request), /inválidas/);
});
