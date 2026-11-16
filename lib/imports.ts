import { isValidDate, MAX_MONEY } from './finance';
import type { Command, FinanceState, Transaction } from './types';
import { applyCommand, validateMagnitude } from './commands';
import { validateTransactionNature } from './transaction-nature';

export type ImportRow = { line: number; date: string; description: string; amount: number; externalId?: string; raw?: string; error?: string };
export type ImportBatch = { id: string; hash: string; account: string; name: string; source: 'csv' | 'ofx'; status: 'confirmed' | 'ignored'; createdAt: string; rows: ImportRow[]; transactions: Transaction[]; duplicates: number; ignored: number; errors: number; audit: { at: string; action: string }[] };
export const IMPORT_LIMIT = 100_000;
export type ImportLocale = 'br' | 'us' | 'auto';

/** No replacement characters or silent encoding fallback. Windows-1252 is an explicit choice. */
export function decodeImport(bytes: ArrayBuffer, encoding: 'utf-8' | 'windows-1252' = 'utf-8'): string {
  if (bytes.byteLength > IMPORT_LIMIT) throw new Error('O limite é 100 KB por arquivo.');
  if (!['utf-8','windows-1252'].includes(encoding)) throw new Error('Codificação inválida.');
  let content: string;
  try { content = new TextDecoder(encoding, {fatal:true}).decode(bytes); }
  catch { throw new Error('Codificação incompatível. Se o arquivo veio de um sistema antigo, escolha Windows-1252 e selecione-o novamente.'); }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/.test(content)) throw new Error('Arquivo binário ou codificação incompatível. Use UTF-8 ou Windows-1252.');
  return content;
}

/** Legacy batches may contain rejected rows. Hide them without deleting old data. */
export function confirmedImportRows(batch: ImportBatch): ImportRow[] {
  const lines = new Set(batch.transactions.map(t => t.origin?.line));
  return batch.rows.filter(row => lines.has(row.line));
}

function amount(value: string, locale: ImportLocale, allowZero = false): number {
  value = value.trim().replace(/\u00A0/g, ' ');
  // Currency decoration is accepted only at the edges, never by deleting arbitrary characters.
  value = value.replace(/^(-?)\s*R\$\s*/i, '$1').replace(/^R\$\s*(-?)\s*/i, '$1').trim();
  if (value.startsWith('+')) value = value.slice(1);
  if (locale === 'auto') {
    if (/^-?\d{1,3}[.,]\d{3}$/.test(value)) throw new Error('Número ambíguo. Escolha explicitamente o formato brasileiro ou internacional.');
    const alternatives = (['br','us'] as const).flatMap(format => {try {return [amount(value,format,allowZero)];} catch {return [];}});
    if (!alternatives.length) throw new Error('Valor inválido. Confira o número e escolha o formato brasileiro ou internacional.');
    if (new Set(alternatives).size > 1) throw new Error('Número ambíguo. Escolha explicitamente o formato brasileiro ou internacional.');
    return alternatives[0];
  }
  const pattern = locale === 'br' ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/ : /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) throw new Error('Valor inválido para o formato numérico escolhido.');
  const clean = value.replace(locale === 'br' ? /\./g : /,/g, '').replace(',', '.');
  const [whole, fraction = ''] = clean.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || (!allowZero && cents === 0) || cents > MAX_MONEY) throw new Error('Valor fora do limite ou igual a zero.');
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

export function parseImport(name: string, content: string, locale: ImportLocale = 'br'): { source: 'csv' | 'ofx'; rows: ImportRow[] } {
  if (!['br', 'us','auto'].includes(locale)) throw new Error('Escolha o formato numérico.');
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
    const delimiter = name.toLowerCase().endsWith('.tsv') ? '\t' : [';', '\t', ','].map(value => {
      try {return {value,count:csvCells(header,value)[0]?.length ?? 0};} catch {return {value,count:0};}
    }).sort((a,b)=>b.count-a.count)[0].value;
    const matrix = csvCells(clean, delimiter);
    const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ _-]+/g,' ');
    const headers = (matrix.shift() ?? []).map(normalize);
    const find = (keys: string[]) => {const matches = headers.flatMap((h,i)=>keys.includes(h)?[i]:[]);if(matches.length>1) throw new Error('Cabeçalhos ambíguos: use uma coluna por informação.');return matches[0] ?? -1;};
    const indices = [find(['data','date','data lancamento','data de lancamento']),find(['descricao','description','historico','lancamento']),find(['valor','amount','valor lancamento','valor do lancamento'])];
    const debit = find(['debito','debit','saida','saidas']);
    const credit = find(['credito','credit','entrada','entradas']);
    const split = debit !== -1 && credit !== -1;
    if (indices.slice(0,2).includes(-1) || (indices[2] === -1 && !split) || (indices[2] !== -1 && (debit !== -1 || credit !== -1)) || new Set(headers).size !== headers.length) throw new Error('Use cabeçalhos únicos: data, descricao e valor; ou data, descricao, debito e credito. Não combine as duas representações.');
    const formats = new Set<string>();
    matrix.forEach((cells, i) => {
      let date = (cells[indices[0]] ?? '').trim(); date = date.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
      const description = (cells[indices[1]] ?? '').trim();
      const values = split ? [cells[debit] ?? '',cells[credit] ?? ''] : [cells[indices[2]] ?? ''];
      if (locale === 'auto') for(const value of values.filter(v=>v.trim())) {
        const valid = (['br','us'] as const).filter(format=>{try {amount(value,format,true);return true;} catch {return false;}});
        if(valid.length===1) formats.add(valid[0]);
      }
      add(i + 2, date, description, split ? '1' : values[0], JSON.stringify(cells));
      const row = rows[rows.length - 1];
      if (split && !row.error) {
        try {
          const d = values[0].trim() ? amount(values[0],locale,true) : 0;
          const c = values[1].trim() ? amount(values[1],locale,true) : 0;
          if ((d !== 0 && c !== 0) || c < 0 || (d === 0 && c === 0)) throw new Error('Informe débito ou crédito, em uma única coluna, com valor diferente de zero.');
          row.amount = c || -Math.abs(d);
        } catch(e) {row.amount=0;row.error=(e as Error).message;}
      }
      if (/^(?:saldo(?: anterior| inicial| final| do dia| disponivel)?|total(?: de (?:debitos|creditos|entradas|saidas))?|totais)\s*[:\-]?$/i.test(normalize(description))) {row.amount=0;row.error='Linha de saldo ou total informativo; não é um lançamento importável.';}
      if (cells.length !== headers.length) rows[rows.length - 1].error = 'Quantidade de colunas diferente do cabeçalho.';
    });
    if (formats.size>1) for(const row of rows) if(!row.error) {row.amount=0;row.error='Formatos numéricos inconsistentes no arquivo. Separe ou corrija a origem antes de importar.';}
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
  const parsed = parseImport(name as string, content as string, locale as ImportLocale);
  if (accepted.some(n => !parsed.rows.some(r => r.line === n && !r.error))) throw new Error('Há linhas inválidas na seleção.');
  // Optional reviewed-flow contract. Old clients may omit it; absence never rewrites legacy data.
  const natures = new Map<number, ReturnType<typeof validateTransactionNature>>();
  const edits = new Map<number, Record<string, unknown>>();
  if (Object.hasOwn(command.payload, 'edits')) {
    const input = command.payload.edits;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Revisão inválida.');
    for (const [key, value] of Object.entries(input)) {
      const line = Number(key);
      if (!/^[1-9]\d*$/.test(key) || !accepted.includes(line) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Linha de revisão inválida.');
      const fields = value as Record<string, unknown>;
      if (Object.keys(fields).some(k => !['description','category','refundOf'].includes(k))) throw new Error('Campo de revisão não permitido.');
      edits.set(line, fields);
    }
  }
  if (Object.hasOwn(command.payload, 'natures')) {
    const input = command.payload.natures;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Revisão de naturezas inválida.');
    for (const [key, value] of Object.entries(input)) {
      const line = Number(key);
      if (!/^[1-9]\d*$/.test(key) || !accepted.includes(line)) throw new Error('Linha de revisão inválida.');
      const nature = validateTransactionNature(value);
      if (nature === 'unidentified') throw new Error('Revise a natureza antes de confirmar a importação.');
      natures.set(line, nature);
    }
    if (accepted.some(line => !natures.has(line))) throw new Error('Revise a natureza de todas as linhas selecionadas.');
  }
  for (const [line, nature] of natures) {
    if (nature === 'refund' && !edits.get(line)?.refundOf) throw new Error('Confirme o lançamento original antes de importar o estorno.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content as string));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const sameFile = batches.filter(b => b.hash === hash && b.source === parsed.source && b.account === account);
  // Reverted batches reserve their rows so restoring cannot duplicate another lot.
  const importedLines = new Set(sameFile.flatMap(b => b.transactions.map(t => t.origin?.line)));
  if (accepted.length && accepted.every(line => importedLines.has(line))) throw new Error('Arquivo já importado para estas linhas. Consulte o histórico para restaurar ou revisar o lote.');
  if (batches.length >= 100) throw new Error('Limite de 100 lotes nesta etapa. Exporte seus dados.');
  const keys = new Map(batches.filter(b => b.account === account && b.source === parsed.source).flatMap(b => b.transactions.filter(t => t.origin?.externalId).map(t => [t.origin!.externalId!, t] as const)));
  const scopeDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([account, parsed.source, hash])));
  const scopedHash = Array.from(new Uint8Array(scopeDigest), b => b.toString(16).padStart(2, '0')).join('');
  let next = state; const transactions: Transaction[] = []; let duplicates = 0;
  for (const row of parsed.rows) {
    if (row.error || !accepted.includes(row.line)) continue;
    if (importedLines.has(row.line)) { duplicates++; continue; }
    if (row.externalId && keys.has(row.externalId)) {
      const existing = keys.get(row.externalId)!;
      if (existing.amount !== Math.abs(row.amount) || existing.date !== row.date || existing.type !== (row.amount < 0 ? 'expense' : 'income')) throw new Error('O mesmo identificador externo chegou com valor ou data diferente. Revise a fonte; o lote não foi salvo.');
      duplicates++; continue;
    }
    const transaction: Transaction = { id: `imp_${scopedHash.slice(0,32)}_${row.line}`, date: row.date, description: row.description, amount: Math.abs(row.amount), type: row.amount < 0 ? 'expense' : 'income', category: 'outros', status: 'realized', expenseKind: 'variable' };
    if (natures.has(row.line)) transaction.nature = natures.get(row.line)!;
    const edit = edits.get(row.line);
    const reviewed = applyCommand(next, { id: command.id, type: 'transaction.save', payload: { ...transaction, ...edit } });
    const validated = reviewed.transactions.find(t => t.id === transaction.id)!;
    Object.assign(transaction, validated);
    if (next.transactions.some(t => t.id === transaction.id)) throw new Error('Identificador já existente. Revise o histórico.');
    next = reviewed;
    transaction.origin = { batchId: command.id, line: row.line, externalId: row.externalId, account, currency: 'BRL', timezone: 'America/Sao_Paulo', originalDescription: row.description };
    next = { ...next, transactions: next.transactions.map(t => t.id === transaction.id ? transaction : t) };
    transactions.push(transaction); if (row.externalId) keys.set(row.externalId, transaction);
  }
  const at = new Date().toISOString();
  const savedLines = new Set(transactions.map(t => t.origin!.line));
  const rows = parsed.rows.filter(r => savedLines.has(r.line)).map(({ line, date, description, amount, externalId }) => ({ line, date, description, amount, ...(externalId ? { externalId } : {}) }));
  const batch: ImportBatch = { id: command.id, hash, name: name as string, account, source: parsed.source, status: 'confirmed', createdAt: at, rows, transactions, duplicates, ignored: parsed.rows.filter(r => !r.error && !accepted.includes(r.line)).length, errors: parsed.rows.filter(r => r.error).length, audit: [{ at, action: 'confirmed' }] };
  return { ...next, importBatches: [...batches, batch] };
}
