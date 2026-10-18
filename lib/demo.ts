import { applyCommand } from './commands';
import { currentMonth, isValidMonth, todayISO } from './finance';
import type { FinanceState, Transaction } from './types';

/** New authenticated accounts must start with this empty state, never the demo. */
export function emptyState(): FinanceState {
  return { profile: { name: '', incomeType: 'variable', expectedIncome: null, essentialExpenses: null, initialObjective: '', onboardingDone: false, aiConsent: false, confirmedNoIncomeMonths: [] },
    transactions: [], budgets: [], goals: [], movements: [], debts: [], savingActions: [] };
}

/** Fictitious, isolated and resettable example. No account or bank is connected. */
export function demoState(month = currentMonth()): FinanceState {
  if (!isValidMonth(month)) throw new Error('Mês de demonstração inválido.');
  let state = emptyState();
  let commandIndex = 0;
  const run = (type: string, payload: Record<string, unknown>) => { state = applyCommand(state, { id: `demo-command-${++commandIndex}`, type, payload }); };
  const paidDay = month === currentMonth() ? Math.min(6, Number(todayISO().slice(-2))) : 6;
  const day = (value: number) => `${month}-${String(Math.min(paidDay, value)).padStart(2, '0')}`;
  run('profile.update', { name: 'Você', incomeType: 'fixed', expectedIncome: 300000, essentialExpenses: 220000, initialObjective: 'Começar uma reserva, no meu ritmo', onboardingDone: true });
  const rows: Transaction[] = [
    { id: 'demo-receita', description: 'Receita do mês', amount: 300000, type: 'income', category: 'outros', date: day(1), status: 'realized', expenseKind: 'fixed' },
    { id: 'demo-aluguel', description: 'Aluguel e contas da casa', amount: 120000, type: 'expense', category: 'moradia', date: day(2), status: 'realized', expenseKind: 'fixed' },
    { id: 'demo-mercado', description: 'Compras de mercado', amount: 80000, type: 'expense', category: 'alimentacao', date: day(3), status: 'realized', expenseKind: 'variable' },
    { id: 'demo-transporte', description: 'Transporte do mês', amount: 20000, type: 'expense', category: 'transporte', date: day(4), status: 'realized', expenseKind: 'variable' },
    { id: 'demo-saude', description: 'Farmácia e consulta', amount: 15000, type: 'expense', category: 'saude', date: day(4), status: 'realized', expenseKind: 'variable' },
    { id: 'demo-lazer', description: 'Passeio no fim de semana', amount: 10000, type: 'expense', category: 'lazer', date: day(5), status: 'realized', expenseKind: 'variable' },
    { id: 'demo-assinaturas', description: 'Assinaturas digitais', amount: 5000, type: 'expense', category: 'assinaturas', date: day(5), status: 'realized', expenseKind: 'fixed' },
    { id: 'demo-parcela', description: 'Parcela do acordo', amount: 20000, type: 'expense', category: 'dividas', date: day(6), status: 'realized', expenseKind: 'fixed' },
    { id: 'demo-previsto', description: 'Conta de energia prevista', amount: 15000, type: 'expense', category: 'moradia', date: `${month}-20`, status: 'planned', expenseKind: 'fixed' },
  ];
  for (const row of rows) run('transaction.save', { ...row });
  for (const [category, limit] of [['moradia', 140000], ['alimentacao', 65000], ['lazer', 15000], ['assinaturas', 6000]] as const) run('budget.save', { id: `demo-limite-${category}`, month, category, limit });
  run('goal.save', { id: 'demo-reserva', name: 'Minha primeira reserva', kind: 'reserve', target: 660000, deadline: null, initialAmount: 70000, initialDate: `${month}-01`, essentialBase: 220000, reserveMonths: 3, archived: false });
  run('movement.add', { id: 'demo-aporte', goalId: 'demo-reserva', type: 'deposit', amount: 10000, date: day(6), note: 'Primeiro aporte registrado neste mês' });
  run('debt.save', { id: 'demo-divida', name: 'Acordo pessoal', balance: 200000, installment: 20000, dueDate: `${month}-20`, interestRate: null, interestUnit: 'unknown', transactionId: 'demo-parcela' });
  return state;
}
