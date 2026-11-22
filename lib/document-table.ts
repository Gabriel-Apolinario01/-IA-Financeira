import { isValidDate, parseMoney } from './finance';
import { classifyImportDescription } from './import-classifier';
import type { DocumentDraft } from './document-drafts';

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type Column = 'income' | 'expense' | 'amount' | 'balance';
export type DocumentTable = { columns: Column[]; currency: 'BRL' | null; kind: string; realized: boolean; period?: { month: number; year: number } };
const foreignCurrency = /\b(?:usd|eur|gbp|ars|dolar|euro)\b|(?<!r)\$|[€£¥]/;
const reais = /r\$|\bbrl\b|\breais\b/;
const money = '(?:[+-]?\\s*(?:R\\$\\s*)?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}|[-–—])';

export function documentTableHeader(line: string): Column[] | null {
  const text = fold(line);
  if (!/^(?:data|dia)\b.*\b(?:descricao|lancamento|historico|estabelecimento)\b/.test(text)) return null;
  const columns = [...text.matchAll(/\b(entradas?|creditos?|saidas?|debitos?|valor|saldo)\b/g)].map(([word]): Column =>
    /^(entrada|credito)/.test(word) ? 'income' : /^(saida|debito)/.test(word) ? 'expense' : word === 'saldo' ? 'balance' : 'amount');
  if (new Set(columns).size !== columns.length) return null;
  return (columns.includes('amount') && !columns.includes('income') && !columns.includes('expense')) ||
    (columns.includes('income') && columns.includes('expense') && !columns.includes('amount')) ? columns : null;
}

const monthNames = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function extractPeriod(text: string): DocumentTable['period'] {
  // Never infer month/year from the computer clock or a transaction amount.
  const named = /(?:mes\s+(?:de\s+)?referencia|competencia)\s*:?\s*(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:\/|de|,|\s)+\s*((?:19|20)\d{2})\b/.exec(text);
  if (named) return { month: monthNames.indexOf(named[1]) + 1, year: Number(named[2]) };
  const numeric = /(?:mes\s+(?:de\s+)?referencia|competencia)\s*:?\s*(0?[1-9]|1[0-2])\/((?:19|20)\d{2})\b/.exec(text);
  return numeric ? { month: Number(numeric[1]), year: Number(numeric[2]) } : undefined;
}

export function documentTableContext(lines: string[], columns: Column[], previous?: DocumentTable): DocumentTable {
  const text = fold(lines.join('\n'));
  const invoice = /\bfatura\b/.test(text) && !/\bextrato\b/.test(text);
  const statement = !invoice && (/\bextrato\b/.test(text) || columns.includes('income'));
  return {
    columns, currency: foreignCurrency.test(text) ? null : reais.test(text) ? 'BRL' : previous?.currency ?? null,
    kind: previous?.kind ?? (invoice ? 'Fatura' : statement ? 'Extrato bancário' : 'Movimentações'),
    realized: (previous?.realized ?? statement) && !/\b(?:futur[oa]s?|agendad[oa]s?|agendamentos|previst[oa]s?)\b/.test(text),
    period: extractPeriod(text) ?? previous?.period,
  };
}

/** Read monetary cells by their column, never by the largest number or the running balance. */
export function documentTableRow(entry: string, context: DocumentTable, page: number, line: number): DocumentDraft {
  const text = fold(entry);
  const currency = foreignCurrency.test(text) ? null : reais.test(text) ? 'BRL' : context.currency;
  const fullDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+/.exec(entry);
  const shortDay = fullDate ? null : /^(\d{1,2})\s+/.exec(entry);
  const candidateDate = fullDate
    ? fullDate[3] + '-' + fullDate[2].padStart(2, '0') + '-' + fullDate[1].padStart(2, '0')
    : shortDay && context.period
      ? context.period.year + '-' + String(context.period.month).padStart(2, '0') + '-' + shortDay[1].padStart(2, '0') : '';
  const date = isValidDate(candidateDate) ? candidateDate : '';
  const matchDate = fullDate ?? shortDay;
  const body = matchDate ? entry.slice(matchDate[0].length) : entry;
  const pattern = new RegExp('^(.+?)\\s+' + context.columns.map(() => '(' + money + ')').join('\\s+') + '$', 'i');
  const match = pattern.exec(body);
  // A missing/extra cell must not shift the balance into the transaction's value.
  const aligned = Boolean(match && !new RegExp('(?:^|\\s)' + money + '$', 'i').test(match[1]));
  const description = (match?.[1] ?? body).slice(0, 160);
  const values = new Map<Column, number>();
  let direction: DocumentDraft['direction'] = 'expense';
  let amount: number | null = null;
  const ambiguities: string[] = [];
  if (match && aligned) {
    try {
      context.columns.forEach((column, i) => {
        const cell = match[i + 2].trim();
        const value = /^[-–—]$/.test(cell) ? 0 : parseMoney(cell.replace(/^[+-]\s*/, '')) * (cell.startsWith('-') ? -1 : 1);
        values.set(column, value);
      });
      if (values.has('amount')) {
        const value = values.get('amount')!;
        amount = Math.abs(value) || null;
        const cell = match[context.columns.indexOf('amount') + 2].trim();
        if (/^\+/.test(cell)) direction = 'income';
        else if (/^-/.test(cell)) direction = 'expense';
        else if (context.kind === 'Extrato bancário') {
          const foldedDescription = fold(description);
          if (/\b(recebimento|recebid[ao]|deposito|creditado|proventos)\b/.test(foldedDescription)) direction = 'income';
          else if (!/\b(compra|saque|debito|pagamento|tarifa)\b/.test(foldedDescription))
            ambiguities.push('Coluna Valor sem indicação inequívoca de entrada ou saída.');
        }
      } else {
        const income = values.get('income')!;
        const expense = values.get('expense')!;
        if (income > 0 && expense === 0) { amount = income; direction = 'income'; }
        else if (expense > 0 && income === 0) { amount = expense; direction = 'expense'; }
      }
    } catch { /* Keep malformed cells visible for correction. */ }
  }
  if (!amount) ambiguities.push('Valor da movimentação ausente ou ambíguo nas colunas.');
  if (!currency) { amount = null; ambiguities.push('Moeda em reais sem identificação inequívoca.'); }
  if (!date) ambiguities.push(shortDay && !context.period ? 'Mês e ano ausentes para o dia do lançamento.' : 'Data do lançamento ausente ou inválida.');
  const suggestion = classifyImportDescription(description, amount ? (direction === 'income' ? amount : -amount) : 0);
  const warnings = ['Confira a data, o valor, a natureza e a situação desta linha antes de confirmar.'];
  if (suggestion.nature === 'unidentified') warnings.push(suggestion.reason);
  return {
    line, page, kind: context.kind, issuer: '', description, amount, currency, date,
    dueDate: '', paidDate: context.realized ? date : '', category: suggestion.category ?? 'outros',
    nature: suggestion.nature, direction, status: context.realized ? 'realized' : 'planned', warnings, ambiguities,
  };
}
