import { isValidDate, MAX_MONEY } from './finance';
import type { Command, FinanceState, Transaction } from './types';
import { applyCommand, validateMagnitude } from './commands';

export type ImportRow = { line: number; date: string; description: string; amount: number; externalId?: string; raw: string; error?: string };
export type ImportBatch = { id: string; hash: string; account: string; name: string; source: 'csv' | 'ofx'; status: 'confirmed' | 'ignored'; createdAt: string; rows: ImportRow[]; transactions: Transaction[]; duplicates: number; ignored: number; errors: number; audit: { at: string; action: string }[] };
export const IMPORT_LIMIT = 100_000;

function amount(value: string, locale: 'br' | 'us') {
  const pattern = locale === 'br' ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/ : /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) throw new Error('Valor inválido para o formato numérico escolhido.');
  const clean = value.replace(locale === 'br' ? /\./g : /,/g, '').replace(',', '.');
  const [whole, fraction = ''] = clean.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents === 0 || cents > MAX_MONEY) throw new Error('Valor fora do limite ou igual a zero.');
  return clean.startsWith('-') ? -cents : cents;
}

function csvCells(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === delimiter || c === '\n') { row.push(cell); cell = ''; closed = false; if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; } }
    else if (c === '\r' && text[i + 1] === '\n') continue;
    else { if (closed || c === '"') throw new Error('CSV com aspas inválidas.'); cell += c; }
  }
  if (quoted) throw new Error('CSV com aspas sem fechamento.');
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseImport(name: string, content: string, locale: 'br' | 'us' = 'br'): { source: 'csv' | 'ofx'; rows: ImportRow[] } {
  if (!['br', 'us'].includes(locale)) throw new Error('Escolha o formato numérico.');
  if (typeof name !== 'string' || name.length > 160 || typeof content !== 'string' || !content.trim() || new TextEncoder().encode(content).length > IMPORT_LIMIT || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(content)) throw new Error('Arquivo vazio, binário, inválido ou maior que 100 KB.');
  const source = /\.ofx$/i.test(name) ? 'ofx' : /\.(csv|tsv)$/i.test(name) ? 'csv' : null;
  if (!source) throw new Error('Nesta etapa, envie CSV, TSV ou OFX.');
  const rows: ImportRow[] = [];
  const add = (line: number, date: string, description: string, value: string, raw: string, externalId?: string) => {
    const row: ImportRow = { line, date, description, amount: 0, raw, externalId };
    try {
      if (!isValidDate(date)) throw new Error('Data inválida; use AAAA-MM-DD ou DD/MM/AAAA.');
      if (!description.trim() || description.length > 160) throw new Error('Descrição vazia ou maior que 160 caracteres.');
      if (externalId && externalId.length > 120) throw new Error('Identificador externo muito longo.');
      row.amount = amount(value.trim(), source === 'ofx' ? 'us' : locale);
    } catch (e) { row.error = (e as Error).message; }
    rows.push(row);
  };
  if (source === 'csv') {
    if (/^\s*</.test(content)) throw new Error('O conteúdo não é CSV.');
    const clean = content.replace(/^\uFEFF/, '');
    const header = clean.split(/\r?\n/, 1)[0];
    const delimiter = name.toLowerCase().endsWith('.tsv') ? '\t' : header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
    const matrix = csvCells(clean, delimiter);
    const headers = (matrix.shift() ?? []).map(s => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const indices = [['data', 'date'], ['descricao', 'description', 'historico'], ['valor', 'amount']].map(keys => headers.findIndex(h => keys.includes(h)));
    if (indices.includes(-1) || new Set(headers).size !== headers.length) throw new Error('Use cabeçalhos únicos: data, descricao, valor. Valores negativos são despesas; positivos são receitas.');
    matrix.forEach((cells, i) => {
      let date = cells[indices[0]] ?? ''; date = date.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
      add(i + 2, date, (cells[indices[1]] ?? '').trim(), cells[indices[2]] ?? '', JSON.stringify(cells));
      if (cells.length !== headers.length) rows[rows.length - 1].error = 'Quantidade de colunas diferente do cabeçalho.';
    });
  } else {
    if (!/<OFX>/i.test(content) || !/<\/OFX>/i.test(content) || /<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error('OFX inválido ou com entidades não permitidas.');
    const currencies = [...content.matchAll(/<CURDEF>\s*([^<\r\n]+)/gi)];
    if (currencies.length !== 1 || currencies[0][1].trim() !== 'BRL') throw new Error('Envie uma única conta em BRL por arquivo.');
    if ([...content.matchAll(/<STMTRS>|<CCSTMTRS>/gi)].length !== 1) throw new Error('Envie um extrato de uma única conta.');
    const blocks = [...content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
    if (blocks.length !== [...content.matchAll(/<STMTTRN>/gi)].length) throw new Error('OFX contém lançamentos incompletos.');
    blocks.forEach((match, i) => {
      const field = (tag: string) => new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i').exec(match[1])?.[1].trim() ?? '';
      const date = field('DTPOSTED');
      add(i + 1, /^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(date) ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : '', field('MEMO') || field('NAME'), field('TRNAMT'), JSON.stringify({ date, memo: field('MEMO'), name: field('NAME'), value: field('TRNAMT'), fitid: field('FITID') }), field('FITID') || undefined);
    });
  }
  if (!rows.length || rows.length > 300) throw new Error('Envie de 1 a 300 lançamentos por arquivo.');
  return { source, rows };
}

export function possibleMatches(row: ImportRow, transactions: Transaction[]) {
  return transactions.filter(t => t.amount === Math.abs(row.amount) && t.type === (row.amount < 0 ? 'expense' : 'income') && Math.abs(Date.parse(t.date) - Date.parse(row.date)) <= 3 * 86400000);
}

/** Only this asynchronous boundary accepts imports; all data is re-parsed and hashed here. */
export async function executeFinanceCommand(state: FinanceState, command: Command): Promise<FinanceState> {
  if (!command.type.startsWith('import.')) return applyCommand(state, command);
  const batches = state.importBatches ?? [];
  if (command.type === 'import.revert' || command.type === 'import.restore') {
    const batch = batches.find(b => b.id === command.payload.id);
    if (!batch) throw new Error('Importação não encontrada nesta conta.');
    const status = command.type === 'import.restore' ? 'confirmed' : 'ignored';
    if (batch.status === status) return state;
    const ids = new Set(batch.transactions.map(t => t.id));
    if (status === 'confirmed' && state.transactions.some(t => ids.has(t.id))) throw new Error('Há conflito de identificadores. Não foi possível restaurar.');
    const transactions = status === 'ignored' ? state.transactions.filter(t => !ids.has(t.id)) : [...state.transactions, ...batch.transactions];
    validateMagnitude({ ...state, transactions });
    return { ...state, transactions, importBatches: batches.map(b => b.id === batch.id ? { ...b, status, audit: [...b.audit, { at: new Date().toISOString(), action: status }] } : b) };
  }
  if (command.type !== 'import.commit') throw new Error('Ação de importação desconhecida.');
  if (batches.some(b => b.id === command.id)) throw new Error('Identificador de lote já utilizado.');
  const { name, content, locale, account, accepted } = command.payload;
  if (typeof account !== 'string' || !/^[\p{L}\p{N} _-]{1,60}$/u.test(account)) throw new Error('Informe um apelido estável para a conta, sem dados bancários.');
  if (!Array.isArray(accepted) || accepted.some(n => !Number.isInteger(n)) || new Set(accepted).size !== accepted.length) throw new Error('Seleção de linhas inválida.');
  const parsed = parseImport(name as string, content as string, locale as 'br' | 'us');
  if (accepted.some(n => !parsed.rows.some(r => r.line === n && !r.error))) throw new Error('Há linhas inválidas na seleção.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content as string));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (batches.some(b => b.hash === hash && b.source === parsed.source)) throw new Error('Arquivo já importado. Consulte o histórico para restaurar ou revisar o lote.');
  if (batches.length >= 100) throw new Error('Limite de 100 lotes nesta etapa. Exporte seus dados.');
  const keys = new Map(batches.filter(b => b.account === account && b.source === parsed.source).flatMap(b => b.transactions.filter(t => t.origin?.externalId).map(t => [t.origin!.externalId!, t] as const)));
  let next = state; const transactions: Transaction[] = []; let duplicates = 0;
  for (const row of parsed.rows) {
    if (row.error || !accepted.includes(row.line)) continue;
    if (row.externalId && keys.has(row.externalId)) {
      const existing = keys.get(row.externalId)!;
      if (existing.amount !== Math.abs(row.amount) || existing.date !== row.date || existing.type !== (row.amount < 0 ? 'expense' : 'income')) throw new Error('O mesmo identificador externo chegou com valor ou data diferente. Revise a fonte; o lote não foi salvo.');
      duplicates++; continue;
    }
    const transaction: Transaction = { id: `imp_${hash.slice(0,32)}_${row.line}`, date: row.date, description: row.description, amount: Math.abs(row.amount), type: row.amount < 0 ? 'expense' : 'income', category: 'outros', status: 'realized', expenseKind: 'variable' };
    if (next.transactions.some(t => t.id === transaction.id)) throw new Error('Identificador já existente. Revise o histórico.');
    next = applyCommand(next, { id: command.id, type: 'transaction.save', payload: { ...transaction } });
    transaction.origin = { batchId: command.id, line: row.line, externalId: row.externalId, account, currency: 'BRL', timezone: 'America/Sao_Paulo', originalDescription: row.description };
    next = { ...next, transactions: next.transactions.map(t => t.id === transaction.id ? transaction : t) };
    transactions.push(transaction); if (row.externalId) keys.set(row.externalId, transaction);
  }
  const at = new Date().toISOString();
  const batch: ImportBatch = { id: command.id, hash, name: name as string, account, source: parsed.source, status: 'confirmed', createdAt: at, rows: parsed.rows, transactions, duplicates, ignored: parsed.rows.filter(r => !r.error && !accepted.includes(r.line)).length, errors: parsed.rows.filter(r => r.error).length, audit: [{ at, action: 'confirmed' }] };
  return { ...next, importBatches: [...batches, batch] };
}
