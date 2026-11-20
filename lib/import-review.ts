import { budgetEffect, safeSum, validateRefundLinks } from './finance';
import type { ImportBatch, ImportRow } from './imports';
import { CATEGORIES, type FinanceState, type Transaction, type TransactionNature } from './types';
import { validateTransactionNature } from './transaction-nature';

export type ImportReview = { nature: TransactionNature; description: string; category: string; refundOf?: string };
export const defaultReview = (row: ImportRow): ImportReview => ({nature:'unidentified',description:row.description,category:'outros'});
export function reviewIssue(row: ImportRow, review: ImportReview): string | null {
  if(row.error) return row.error;
  try {validateTransactionNature(review.nature);} catch {return 'Natureza inválida.';}
  if(review.nature==='unidentified') return 'Escolha uma natureza financeira antes de selecionar.';
  if(!review.description.trim() || review.description.length>160) return 'Informe uma descrição de até 160 caracteres.';
  if(!CATEGORIES.some(c=>c.id===review.category)) return 'Escolha uma categoria válida.';
  if(review.nature==='refund' && !review.refundOf) return 'Confirme o vínculo com o lançamento original.';
  return null;
}
/** Reverted batches reserve their rows too. Never fuzzy-deduplicate different files. */
export function importDuplicate(row: ImportRow, batches: ImportBatch[], account: string, source: ImportBatch['source'], hash: string): 'exact'|'conflict'|null {
  for(const batch of batches.filter(b=>b.account===account && b.source===source)) {
    if(batch.hash===hash && batch.transactions.some(t=>t.origin?.line===row.line)) return 'exact';
    const original=row.externalId ? batch.transactions.find(t=>t.origin?.externalId===row.externalId) : undefined;
    if(original) return original.amount===Math.abs(row.amount) && original.date===row.date && original.type===(row.amount<0?'expense':'income') ? 'exact' : 'conflict';
  }
  return null;
}
/** Preview is ephemeral; accounting uses the same budget rule and refund constraints as saving. */
export function selectedImportTotals(state: FinanceState, rows: ImportRow[], reviews: Record<number,ImportReview>, selected: number[]) {
  try {
    const transactions: Transaction[] = rows.filter(row=>selected.includes(row.line)).map(row=>{
      const review=reviews[row.line] ?? defaultReview(row), issue=reviewIssue(row,review);
      if(issue) throw new Error(issue);
      let id=`preview_${row.line}`;
      while(state.transactions.some(t=>t.id===id)) id=`_${id}`;
      return {id,date:row.date,description:review.description,amount:Math.abs(row.amount),type:row.amount<0?'expense':'income',nature:review.nature,category:review.category,status:'realized',expenseKind:'variable',...(review.refundOf?{refundOf:review.refundOf}:{})};
    });
    if(transactions.length!==selected.length) throw new Error('Seleção inválida.');
    const preview={...state,transactions:[...state.transactions,...transactions]};
    validateRefundLinks(preview);
    const effects=transactions.map(t=>budgetEffect(preview,t));
    return {income:safeSum(effects.map(e=>e.income)),expenses:safeSum(effects.map(e=>e.expenses)),error:null};
  } catch(error) {return {income:null,expenses:null,error:error instanceof Error?error.message:'Revise a seleção.'};}
}
