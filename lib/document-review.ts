import type { DocumentDraft } from './document-drafts';
import { formatMoney, isValidDate, parseMoney } from './finance';
import { CATEGORIES } from './types';

export type Review = Omit<DocumentDraft,'status'|'direction'> & {status:DocumentDraft['status']|''; direction:DocumentDraft['direction']|''} & { value: string; note: string; selected: boolean; reviewed: boolean; conflict: boolean };
export function startReview(row: DocumentDraft): Review {
  return { ...row, value: row.amount ? formatMoney(row.amount) : '', note: '', selected: false, reviewed: false, conflict: false };
}
export function startReviews(drafts: DocumentDraft[]) {
  const seen = new Set<string>();
  return drafts.map(draft => {
    const row = startReview(draft);
    const key = JSON.stringify([row.description.trim().toLocaleLowerCase('pt-BR'),row.date,row.amount,row.direction]);
    if (seen.has(key)) row.ambiguities = [...row.ambiguities,'Linha repetida no documento. Confira se representa outra movimentação.'];
    seen.add(key);
    return row;
  });
}
export function cents(value: string) {
  try { return parseMoney(value); } catch { return 0; }
}
export function coherentNature(nature: unknown, direction: unknown) {
  if (direction !== 'income' && direction !== 'expense') return false;
  return nature === direction || nature === 'transfer' || nature === 'refund' || (nature === 'invoice_payment' && direction === 'expense');
}
function validText(text: string, max: number) {
  // Match the command boundary, including its allowance for tabs and newlines.
  return text.length <= max && !Array.from(text).some(c => c.charCodeAt(0) < 32 && !'\t\n\r'.includes(c));
}
export function eligible(r: Review, blocked: ReadonlySet<number>) {
  return !blocked.has(r.line) && Boolean(r.description.trim()) && validText(r.description,160) && validText(r.note,300)
    && isValidDate(r.date) && cents(r.value) > 0 && r.currency === 'BRL' && coherentNature(r.nature,r.direction)
    && ['planned','realized'].includes(r.status) && CATEGORIES.some(c => c.id === r.category)
    && (r.reviewed || (!r.conflict && !r.ambiguities.length));
}
export function editReview(row: Review, edit: Partial<Review>, blocked: ReadonlySet<number>) {
  const next = { ...row, ...edit };
  if (Object.keys(edit).some(k => !['reviewed','selected','note'].includes(k))) next.reviewed = false;
  return { ...next, selected: next.selected && eligible(next, blocked) };
}
export function selectReviews(rows: Review[], select: boolean, blocked: ReadonlySet<number>) {
  return rows.map(r => ({ ...r, selected: select && eligible(r, blocked) }));
}
export function confirmedRows(rows: Review[], blocked: ReadonlySet<number>) {
  return rows.filter(r => r.selected && eligible(r,blocked)).map(r => ({
    line:r.line, description:r.description, date:r.date, amount:cents(r.value), currency:r.currency,
    nature:r.nature, category:r.category, type:r.direction, status:r.status, note:r.note,
  }));
}
export function comparePage(rows: Review[], originals: DocumentDraft[], page: number, suggestions: DocumentDraft[]) {
  const local = originals.filter(r => r.page === page);
  const fields = ['description','amount','currency','date','dueDate','paidDate','direction','nature','status'] as const;
  const sameOrder = local.length === suggestions.length && local.every((r,i) => r.description === suggestions[i].description);
  return rows.map(r => {
    if (r.page !== page) return r;
    const i = local.findIndex(original => original.line === r.line);
    if (sameOrder && i >= 0 && fields.every(k => local[i][k] === suggestions[i][k])) return r;
    return { ...r, conflict:true, reviewed:false, selected:false };
  });
}
