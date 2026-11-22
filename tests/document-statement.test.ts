import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentDrafts } from '../lib/document-drafts';
import { readDocument } from '../lib/document-reader';
import { applyCommand } from '../lib/commands';
import { emptyState } from '../lib/demo';

// Original user-supplied, explicitly fictitious statement; no real banking data.
const fixture = readFileSync(new URL('./fixtures/extrato_bancario_teste.txt', import.meta.url), 'utf8');
const expected = [
  ['2026-11-02', 'PIX RECEBIDO - EMPRESA EXEMPLO', 350000, 'income'],
  ['2026-11-03', 'SUPERMERCADO CENTRAL', 24590, 'expense'],
  ['2026-11-04', 'PIX ENVIADO - MARIA SILVA', 15000, 'expense'],
  ['2026-11-05', 'ASSINATURA STREAMING', 3990, 'expense'],
  ['2026-11-06', 'FARMACIA POPULAR', 6250, 'expense'],
  ['2026-11-08', 'RESTAURANTE SABOR', 7800, 'expense'],
  ['2026-11-10', 'TRANSFERENCIA RECEBIDA', 45000, 'income'],
  ['2026-11-11', 'POSTO COMBUSTIVEL', 18000, 'expense'],
  ['2026-11-12', 'COMPRA ONLINE - LIVRARIA', 8990, 'expense'],
  ['2026-11-14', 'CONTA DE ENERGIA', 21035, 'expense'],
  ['2026-11-15', 'PIX ENVIADO - JOAO COSTA', 9500, 'expense'],
  ['2026-11-17', 'REEMBOLSO COMPRA', 6500, 'income'],
  ['2026-11-18', 'INTERNET RESIDENCIAL', 10990, 'expense'],
  ['2026-11-19', 'PADARIA DO BAIRRO', 2780, 'expense'],
];
const parse = (text: string) => documentDrafts([{ text }]);

function checkStatement(rows: ReturnType<typeof documentDrafts>) {
  assert.deepEqual(rows.map(r => [r.date, r.description, r.amount, r.direction]), expected);
  assert.ok(rows.every(r => r.currency === 'BRL' && r.kind === 'Extrato bancário' && r.status === 'realized'));
  assert.ok(rows.every(r => r.ambiguities.length === 0 && r.dueDate === '' && r.paidDate === r.date));
  assert.equal(rows.filter(r => r.direction === 'income').reduce((s, r) => s + r.amount!, 0), 401500);
  assert.equal(rows.filter(r => r.direction === 'expense').reduce((s, r) => s + r.amount!, 0), 128925);
  assert.equal(rows[0].nature, 'unidentified'); // Cash direction alone cannot establish PIX's purpose.
  assert.equal(rows[11].nature, 'refund');
  assert.equal(rows[9].category, 'moradia');
}

test('extrato fictício identifica as 14 movimentações sem importar saldos, totais ou rodapé', () => {
  checkStatement(parse(fixture));
  checkStatement(parse(fixture.replace(/ {2,}/g, ' '))); // OCR may collapse spacing.
});

test('PDF original passa pelo leitor real até os campos de revisão', async () => {
  const bytes = readFileSync(new URL('./fixtures/extrato_bancario_teste.pdf', import.meta.url));
  const pages = await readDocument(bytes, 'application/pdf');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].method, 'text');
  checkStatement(documentDrafts(pages));
});

test('colunas invertidas, crédito/débito, zeros e saldo negativo preservam a direção', () => {
  const rows = parse('Extrato BRL\nData Histórico Saldo Débito Crédito\n02/11/2026 Salário -100,00 0,00 900,00\n03/11/2026 Padaria -120,00 20,00 —');
  assert.deepEqual(rows.map(r => [r.description, r.amount, r.direction]), [['Salário', 90000, 'income'], ['Padaria', 2000, 'expense']]);
});

test('moeda do cabeçalho vale para tabela de valor e saldo, sem supor pagamento de fatura', () => {
  const rows = parse('Fatura em reais\nData Descrição Valor Saldo\n02/11/2026 Padaria 12,34 100,00');
  assert.equal(rows[0].amount, 1234);
  assert.equal(rows[0].date, '2026-11-02');
  assert.equal(rows[0].paidDate, '');
  assert.equal(rows[0].status, 'planned');
  assert.deepEqual(rows[0].ambiguities, []);
  const signed = parse('Extrato BRL\nData Descrição Valor Saldo\n02/11/2026 Salário +900,00 900,00\n03/11/2026 Padaria -20,00 880,00');
  assert.deepEqual(signed.map(r => [r.amount, r.direction]), [[90000, 'income'], [2000, 'expense']]);
});

test('linhas incertas ficam disponíveis para revisão sem aproveitar o saldo como valor', () => {
  const rows = parse('Extrato BRL\nData Descrição Entrada Saída Saldo\n02/11/2026 Conflito 100,00 50,00 900,00\n03/11/2026 Célula ausente 20,00 880,00\n04/11/2026 Célula extra - 10,00 20,00 850,00\n05/11/2026 Zero - 0,00 850,00\n31/11/2026 Padaria - 20,00 830,00\nLinha ilegível');
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.slice(0, 4).map(r => r.amount), [null, null, null, null]);
  assert.equal(rows[4].date, '');
  assert.equal(rows[4].amount, 2000);
  assert.equal(rows[5].nature, 'unidentified');
  assert.ok(rows.every(r => r.ambiguities.length > 0));
});

test('ausência de moeda e moeda estrangeira não são convertidas silenciosamente para reais', () => {
  for (const currency of ['', 'USD', 'R$ USD']) {
    assert.equal(parse(`Extrato ${currency}\nData Descrição Entrada Saída Saldo\n02/11/2026 Padaria - 20,00 830,00`)[0].amount, null);
  }
});

test('cabeçalhos repetidos, saldo datado e continuação preservam páginas e números das linhas', () => {
  const rows = documentDrafts([
    {text: 'Extrato BRL\nData Descrição Entrada Saída Saldo\n01/11/2026 Saldo anterior - - 100,00\n02/11/2026 Padaria - 20,00 80,00\nData Descrição Entrada Saída Saldo\n03/11/2026 Farmácia - 10,00 70,00'},
    {text: 'Data Descrição Entrada Saída Saldo\n04/11/2026 Mercado - 10,00 60,00'},
    {text: '05/11/2026 Restaurante - 10,00 50,00'},
    {text: 'Data Descrição Entrada (USD) Saída (USD) Saldo (USD)\n06/11/2026 Padaria - 10,00 40,00'},
  ]);
  assert.deepEqual(rows.map(r => [r.line, r.page, r.amount]), [[1,1,2000], [2,1,1000], [3,2,1000], [4,3,1000], [5,4,null]]);
  assert.ok(rows.slice(0, 4).every(r => r.status === 'realized'));
});

test('extrato de lançamentos futuros não comprova pagamento', () => {
  const row = parse('Extrato - lançamentos futuros BRL\nData Descrição Entrada Saída Saldo\n22/11/2026 Padaria - 20,00 100,00')[0];
  assert.equal(row.status, 'planned');
  assert.equal(row.paidDate, '');
});

test('limite de 40 lançamentos continua valendo para o documento inteiro', () => {
  const text = 'Extrato BRL\nData Descrição Entrada Saída Saldo\n' + Array.from({length: 21}, () => '02/11/2026 Padaria - 20,00 100,00').join('\n');
  assert.throws(() => documentDrafts([{text}, {text}]), /40 lançamentos/);
});

test('campos extraídos permanecem corretos após confirmação e duplicata continua bloqueada', () => {
  const row = parse(fixture)[1];
  const command = {id: 'statement-test', type: 'document.confirm', payload: {hash: 'b'.repeat(64), rows: [{...row, type: row.direction}]}};
  const state = applyCommand(emptyState(), command);
  assert.deepEqual([state.transactions[0].amount, state.transactions[0].date, state.transactions[0].description], [24590, '2026-11-03', 'SUPERMERCADO CENTRAL']);
  assert.throws(() => applyCommand(state, command), /já adicionado/);
});


test('extrato com Dia e mês de referência explícito separa movimentos e descarta saldos', () => {
  const rows = parse([
    'Extrato de conta corrente BRL',
    'Mês referência: Julho / 2018',
    'Dia Histórico Valor',
    '22 Saldo Anterior 149,93',
    '02 Recebimento de proventos 224,42',
    '04 Compra com cartão 37,90',
    '05 Transferência recebida 1.907,99',
    '11 Depósito Online 160,00',
    'Resumo do relacionamento',
    'Saldo final 2.000,00',
  ].join('\n'));
  assert.deepEqual(rows.map(r => [r.date, r.amount, r.direction]), [
    ['2018-07-02', 22442, 'income'],
    ['2018-07-04', 3790, 'expense'],
    ['2018-07-05', 190799, 'income'],
    ['2018-07-11', 16000, 'income'],
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].nature, 'transfer'); // Destination ownership remains unknown.
  assert.ok(rows.every(r => r.currency === 'BRL' && r.kind === 'Extrato bancário'));
});

test('dia sem mês, texto OCR inválido e moeda ausente não criam datas ou valores inventados', () => {
  const missingDate = parse('Extrato BRL\nDia Histórico Valor\n02 Recebimento 224,42');
  assert.equal(missingDate.length, 1);
  assert.equal(missingDate[0].date, '');
  assert.match(missingDate[0].ambiguities.join(' '), /Mês e ano/);
  const corrupt = parse('Extrato BRL\nMês referência: Julho / 2018\nDia Histórico Valor\n02 Recebimento 22442');
  assert.equal(corrupt[0].amount, null);
  const noCurrency = parse('Extrato\nMês referência: Julho / 2018\nDia Histórico Valor\n02 Recebimento 224,42');
  assert.equal(noCurrency[0].currency, null);
  assert.equal(noCurrency[0].amount, null);
});
