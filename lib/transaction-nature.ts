import type { TransactionNature } from './types';

const NATURES: readonly TransactionNature[] = ['income', 'expense', 'transfer', 'invoice_payment', 'refund', 'unidentified'];

/** Runtime boundary shared by manual commands and reviewed imports. */
export function validateTransactionNature(value: unknown): TransactionNature {
  if (typeof value !== 'string' || !NATURES.includes(value as TransactionNature)) {
    throw new Error('Natureza financeira inválida.');
  }
  return value as TransactionNature;
}
