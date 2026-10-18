import Decimal from 'decimal.js';
import { CATEGORIES, type FinanceState } from './types';

/** R$ 10 bilhões por campo; bounded entries and checked sums preserve integer precision. */
export const MAX_MONEY = 1_000_000_000_000;
export const MAX_RECORDS = 10_000;
const Precise = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const monthsPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && monthsPattern.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200;
}
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValidMonth(value.slice(0, 7))) return false;
  const [year, month, day] = value.split('-').map(Number);
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function assertMoney(value: unknown, label = 'Valor', allowZero = true): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_MONEY) {
    throw new Error(`${label} deve ser ${allowZero ? 'zero ou ' : ''}um valor positivo, em centavos inteiros, de até R$ 10 bilhões.`);
  }
}
export function safeSum(values: number[]): number {
  return values.reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(next)) throw new Error('O total excede a precisão monetária suportada.');
    return next;
  }, 0);
}
export function parseMoney(input: string): number {
  if (typeof input !== 'string') throw new Error('Informe um valor em reais, como 1.234,56.');
  const value = input.trim().replace(/^R\$\s*/, '');
  let normalized: string;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) normalized = value.replaceAll('.', '').replace(',', '.');
  else if (/^\d+(?:,\d{1,2})?$/.test(value)) normalized = value.replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(value)) normalized = value;
  else throw new Error('Informe um valor válido e não negativo, como 1.234,56.');
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(`${whole}${fraction.padEnd(2, '0')}`);
  assertMoney(cents);
  return cents;
}
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Valor monetário inválido.');
  const magnitude = Math.abs(cents);
  const whole = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.floor(magnitude / 100));
  return `${cents < 0 ? '-' : ''}R$\u00a0${whole},${String(magnitude % 100).padStart(2, '0')}`;
}
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function currentMonth(): string { return todayISO().slice(0, 7); }
export function endOfMonth(month: string): string {
  if (!isValidMonth(month)) throw new Error('Mês inválido.');
  const [year, number] = month.split('-').map(Number);
  return `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
}
export function goalBalance(state: FinanceState, goalId: string, asOf = todayISO()): number {
  if (!isValidDate(asOf)) throw new Error('Data de posição inválida.');
  const goal = state.goals.find(item => item.id === goalId);
  if (!goal) throw new Error('Meta não encontrada.');
  if (asOf < goal.initialDate) return 0;
  const movements = state.movements.filter(item => item.goalId === goalId && item.date <= asOf);
  return safeSum([goal.initialAmount, ...movements.map(item => (item.type === 'withdrawal' || item.type === 'adjustment_out' ? -item.amount : item.amount))]);
}
export function goalProgress(state: FinanceState, goalId: string, asOf = todayISO()) {
  const goal = state.goals.find(item => item.id === goalId);
  if (!goal) throw new Error('Meta não encontrada.');
  const balance = goalBalance(state, goalId, asOf);
  const remaining = Math.max(0, goal.target - balance);
  let monthlyNeeded: number | null = null;
  if (goal.deadline && goal.deadline >= asOf) {
    const months = (Number(goal.deadline.slice(0, 4)) - Number(asOf.slice(0, 4))) * 12 + Number(goal.deadline.slice(5, 7)) - Number(asOf.slice(5, 7)) + 1;
    monthlyNeeded = Math.ceil(remaining / Math.max(1, months));
  }
  return { balance, remaining, percent: goal.target > 0 ? (balance / goal.target) * 100 : 0, monthlyNeeded };
}
export function monthMetrics(state: FinanceState, month: string) {
  if (!isValidMonth(month)) throw new Error('Mês inválido.');
  const rows = state.transactions.filter(item => item.date.slice(0, 7) === month);
  const total = (type: 'income' | 'expense', status: 'realized' | 'planned') => safeSum(rows.filter(item => item.type === type && item.status === status).map(item => item.amount));
  const income = total('income', 'realized');
  const expenses = total('expense', 'realized');
  const pendingIncome = total('income', 'planned');
  const pendingExpenses = total('expense', 'planned');
  const categoryExpenses: Record<string, number> = Object.fromEntries(CATEGORIES.map(item => [item.id, 0]));
  const categoryPending: Record<string, number> = Object.fromEntries(CATEGORIES.map(item => [item.id, 0]));
  for (const item of rows.filter(item => item.type === 'expense')) {
    const values = item.status === 'realized' ? categoryExpenses : categoryPending;
    values[item.category] = safeSum([values[item.category] ?? 0, item.amount]);
  }
  const today = todayISO();
  const guardedAsOf = month < today.slice(0, 7) ? endOfMonth(month) : today;
  const guarded = safeSum(state.goals.map(goal => goalBalance(state, goal.id, guardedAsOf)));
  const incomeConfirmed = rows.some(item => item.type === 'income' && item.status === 'realized') || state.profile.confirmedNoIncomeMonths.includes(month);
  return {
    income, expenses, result: safeSum([income, -expenses]), pendingIncome, pendingExpenses,
    projection: safeSum([income, -expenses, pendingIncome, -pendingExpenses]),
    guarded, guardedAsOf, incomeConfirmed, incomplete: !incomeConfirmed, categoryExpenses, categoryPending,
  };
}
export interface SimulationInput { initial: number; monthly: number; months: number; annualRate: string }
/**
 * Annual rate is effective; contributions occur at the END of each month.
 * Internal balances retain 40-digit decimal precision. Each output row is rounded
 * HALF_UP to centavos; rounded display amounts do not feed the following month.
 * This avoids cumulative rounding and makes 12% over 12 months equal 12%.
 */
export function simulate({ initial, monthly, months, annualRate }: SimulationInput) {
  assertMoney(initial, 'Capital inicial');
  assertMoney(monthly, 'Aporte mensal');
  if (!Number.isInteger(months) || months < 0 || months > 600) throw new Error('O prazo deve estar entre 0 e 600 meses.');
  if (typeof annualRate !== 'string' || !/^-?\d+(?:[.,]\d{1,8})?$/.test(annualRate.trim())) throw new Error('Informe uma taxa anual válida.');
  const rate = new Precise(annualRate.trim().replace(',', '.'));
  if (!rate.isFinite() || rate.lte(-100) || rate.gt(1000)) throw new Error('A taxa anual deve ser maior que −100% e de até 1.000%.');
  const monthlyFactor = rate.div(100).plus(1).pow(new Precise(1).div(12));
  let balanceExact = new Precise(initial);
  let contributed = initial;
  const rows: { month: number; contributed: number; balance: number; growth: number }[] = [];
  for (let month = 1; month <= months; month++) {
    contributed = safeSum([contributed, monthly]);
    balanceExact = balanceExact.mul(monthlyFactor).plus(monthly);
    if (!balanceExact.isFinite() || balanceExact.abs().gt(Number.MAX_SAFE_INTEGER) || contributed > Number.MAX_SAFE_INTEGER) throw new Error('O resultado da simulação excede o limite de precisão. Reduza o prazo, a taxa ou os valores.');
    const balance = balanceExact.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    rows.push({ month, contributed, balance, growth: balance - contributed });
  }
  const balance = balanceExact.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return { rows, contributed, balance, growth: balance - contributed };
}
export interface SavingSuggestion {
  id: string; month: string; category: string; baseAmount: number;
  estimatedSaving: number; reductionPercent: number; title: string; reason: string;
}
export function estimateSaving(baseAmount: number, reductionPercent: number): number {
  if (!Number.isSafeInteger(baseAmount) || baseAmount < 0) throw new Error('O valor de referência deve ser um total válido em centavos.');
  if (!Number.isFinite(reductionPercent) || reductionPercent < 0 || reductionPercent > 100) throw new Error('A redução deve estar entre 0% e 100%.');
  return new Precise(baseAmount).mul(String(reductionPercent)).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
export function savingSuggestions(state: FinanceState, month: string): SavingSuggestion[] {
  const metrics = monthMetrics(state, month);
  const discretionary = new Set(['lazer', 'assinaturas', 'outros']);
  const suggestions: SavingSuggestion[] = [];
  const over = state.budgets.filter(item => item.month === month && metrics.categoryExpenses[item.category] + metrics.categoryPending[item.category] > item.limit)
    .sort((a, b) => (metrics.categoryExpenses[b.category] + metrics.categoryPending[b.category] - b.limit) - (metrics.categoryExpenses[a.category] + metrics.categoryPending[a.category] - a.limit));
  for (const budget of over) {
    if (suggestions.length >= 3) break;
    const label = CATEGORIES.find(item => item.id === budget.category)?.label ?? budget.category;
    const amount = metrics.categoryExpenses[budget.category];
    const committed = safeSum([amount, metrics.categoryPending[budget.category]]);
    suggestions.push({ id: `review-${month}-${budget.category}`, month, category: budget.category, baseAmount: amount, estimatedSaving: 0, reductionPercent: 0,
      title: `Revisar o limite de ${label.toLocaleLowerCase('pt-BR')}`,
      reason: `Há ${formatMoney(amount)} pagos e ${formatMoney(metrics.categoryPending[budget.category])} pendentes, frente ao limite de ${formatMoney(budget.limit)}. A diferença é ${formatMoney(committed - budget.limit)}. Confira os compromissos e se o limite é realista; revisar o limite não gera economia.` });
  }
  const optional = CATEGORIES.filter(item => discretionary.has(item.id) && metrics.categoryExpenses[item.id] > 0)
    .sort((a, b) => metrics.categoryExpenses[b.id] - metrics.categoryExpenses[a.id]);
  for (const category of optional) {
    if (suggestions.length >= 3) break;
    if (suggestions.some(item => item.category === category.id)) continue;
    const baseAmount = metrics.categoryExpenses[category.id];
    const estimatedSaving = estimateSaving(baseAmount, 20);
    suggestions.push({ id: `scenario-${month}-${category.id}`, month, category: category.id, baseAmount, estimatedSaving, reductionPercent: 20,
      title: `Avaliar ${category.label.toLocaleLowerCase('pt-BR')}`,
      reason: `Você registrou ${formatMoney(baseAmount)} nesta categoria. Se alguma despesa puder ser revista, reduzir 20% corresponderia a ${formatMoney(estimatedSaving)} em um cenário equivalente. Confira se há itens essenciais; a redução é opcional e não foi realizada.` });
  }
  return suggestions;
}
