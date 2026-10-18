/** Persisted money is always an integer number of Brazilian centavos. */
export interface Profile {
  name: string;
  incomeType: 'fixed' | 'variable';
  expectedIncome: number | null;
  essentialExpenses: number | null;
  initialObjective: string;
  onboardingDone: boolean;
  aiConsent: boolean;
  confirmedNoIncomeMonths: string[];
}
export interface Transaction {
  id: string; description: string; amount: number;
  type: 'income' | 'expense'; category: string; date: string;
  status: 'planned' | 'realized'; expenseKind: 'fixed' | 'variable';
}
export interface Budget { id: string; month: string; category: string; limit: number }
export interface Goal {
  id: string; name: string; kind: 'general' | 'reserve'; target: number;
  deadline: string | null; initialAmount: number; initialDate: string;
  essentialBase: number | null; reserveMonths: number | null; archived: boolean;
}
export interface Movement {
  id: string; goalId: string; type: 'deposit' | 'withdrawal' | 'adjustment_in' | 'adjustment_out';
  amount: number; date: string; note: string;
}
export interface Debt {
  id: string; name: string; balance: number; installment: number | null;
  dueDate: string | null; interestRate: string | null;
  interestUnit: 'monthly' | 'annual' | 'unknown'; transactionId: string | null;
}
export interface SavingAction {
  id: string; month: string; category: string; reductionPercent: number;
  baseAmount: number; estimatedSaving: number;
}
export interface FinanceState {
  profile: Profile; transactions: Transaction[]; budgets: Budget[];
  goals: Goal[]; movements: Movement[]; debts: Debt[]; savingActions: SavingAction[];
}
export interface Command { id: string; type: string; payload: Record<string, unknown> }
/** Create a confirmed planned installment and its debt in one atomic command. */
export interface DebtWithInstallmentPayload {
  debt: Debt;
  transaction: Transaction;
}
export const CATEGORIES = [
  { id: 'moradia', label: 'Moradia', color: '#335c4b' },
  { id: 'alimentacao', label: 'Alimentação', color: '#6e8b61' },
  { id: 'transporte', label: 'Transporte', color: '#b3a178' },
  { id: 'saude', label: 'Saúde', color: '#63908d' },
  { id: 'educacao', label: 'Educação', color: '#7088a0' },
  { id: 'lazer', label: 'Lazer', color: '#b88762' },
  { id: 'assinaturas', label: 'Assinaturas', color: '#9c87a5' },
  { id: 'trabalho', label: 'Custos do trabalho', color: '#93845d' },
  { id: 'dividas', label: 'Dívidas', color: '#ad7770' },
  { id: 'outros', label: 'Outros', color: '#89948c' },
] as const;
