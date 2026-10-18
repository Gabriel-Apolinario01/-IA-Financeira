import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../lib/commands';
import { demoState, emptyState } from '../lib/demo';
import { currentMonth, endOfMonth, estimateSaving, formatMoney, goalBalance, goalProgress, isValidDate, MAX_MONEY, monthMetrics, parseMoney, savingSuggestions, simulate, todayISO } from '../lib/finance';
import type { FinanceState, Goal, Transaction } from '../lib/types';

const month = '2026-09';
let commandSequence = 0;
function send(state: FinanceState, type: string, payload: object): FinanceState {
  return applyCommand(state, { id: `test-${++commandSequence}`, type, payload: payload as Record<string, unknown> });
}
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return { id: 't1', description: 'Despesa de teste', amount: 10000, type: 'expense', category: 'outros', date: `${month}-10`, status: 'realized', expenseKind: 'variable', ...overrides };
}
function goal(overrides: Partial<Goal> = {}): Goal {
  return { id: 'g1', name: 'Primeira meta', kind: 'general', target: 50000, deadline: '2026-12-01', initialAmount: 0, initialDate: '2026-01-01', essentialBase: null, reserveMonths: null, archived: false, ...overrides };
}
function scenario(): FinanceState {
  let state = emptyState();
  state = send(state, 'transaction.save', tx({ id: 'income', amount: 300000, type: 'income' }));
  state = send(state, 'transaction.save', tx({ id: 'expense', amount: 250000 }));
  state = send(state, 'transaction.save', tx({ id: 'installment', amount: 20000, category: 'dividas' }));
  return state;
}
function debt(transactionId: string | null = 'installment') {
  return { id: 'd1', name: 'Acordo', balance: 200000, installment: 20000, dueDate: '2026-09-20', interestRate: null, interestUnit: 'unknown', transactionId };
}

test('derived saving totals support multiple valid records above the individual limit', () => {
  let state = send(emptyState(), 'transaction.save', tx({ id: 'large-a', amount: MAX_MONEY, category: 'lazer' }));
  state = send(state, 'transaction.save', tx({ id: 'large-b', amount: MAX_MONEY, category: 'lazer' }));
  const suggestion = savingSuggestions(state, month)[0];
  assert.equal(suggestion.baseAmount, 2 * MAX_MONEY);
  assert.equal(estimateSaving(suggestion.baseAmount, 100), 2 * MAX_MONEY);
  state = send(state, 'savingAction.save', { id: 'large-scenario', month, category: 'lazer', baseAmount: suggestion.baseAmount, reductionPercent: 100, estimatedSaving: 2 * MAX_MONEY });
  assert.equal(state.savingActions[0].estimatedSaving, 2 * MAX_MONEY);
  assert.throws(() => estimateSaving(Number.MAX_SAFE_INTEGER + 1, 20));
});

test('money input correctly interprets reais and rejects ambiguous/invalid values', () => {
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('R$ 1.234,5'), 123450);
  assert.equal(parseMoney('1.234'), 123400);
  assert.equal(parseMoney('1234.56'), 123456);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney('0,01'), 1);
  for (const invalid of ['-1', '1e3', 'Infinity', 'NaN', '', '1,234', '1.23.456', '12,34.56', '9'.repeat(20)]) assert.throws(() => parseMoney(invalid));
});
test('format preserves centavos, including negative results and large safe integers', () => {
  assert.equal(formatMoney(123456), 'R$\u00a01.234,56');
  assert.equal(formatMoney(-50000), '-R$\u00a0500,00');
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER), 'R$\u00a090.071.992.547.409,91');
});
test('dates validate calendar leap days without shifting financial day', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-04-31'), false);
  assert.equal(isValidDate('2026-00-01'), false);
  assert.equal(isValidDate('2026-09-01T00:00:00Z'), false);
  assert.equal(endOfMonth('2024-02'), '2024-02-29');
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(currentMonth(), todayISO().slice(0, 7));
});
test('acceptance 1: R$ 3.000 received minus R$ 2.700 paid equals R$ 300', () => {
  const metrics = monthMetrics(scenario(), month);
  assert.equal(metrics.income, 300000);
  assert.equal(metrics.expenses, 270000);
  assert.equal(metrics.result, 30000);
  assert.equal(metrics.categoryExpenses.dividas, 20000);
  assert.equal(metrics.incomplete, false);
});
test('acceptance 2: linked debt never duplicates installment or reduces balance automatically', () => {
  const state = send(scenario(), 'debt.save', debt());
  assert.equal(state.transactions.length, 3);
  assert.equal(monthMetrics(state, month).result, 30000);
  assert.equal(state.debts[0].balance, 200000);
  const edited = send(state, 'transaction.save', { ...state.transactions[2], amount: 22000 });
  assert.equal(edited.debts[0].balance, 200000);
});
test('acceptance 3: R$ 100 deposit changes only guarded money', () => {
  let state = send(scenario(), 'goal.save', goal());
  const before = monthMetrics(state, month);
  state = send(state, 'movement.add', { id: 'm1', goalId: 'g1', type: 'deposit', amount: 10000, date: '2026-09-15', note: '' });
  const after = monthMetrics(state, month);
  assert.equal(after.guarded - before.guarded, 10000);
  assert.equal(after.result, 30000);
});
test('acceptance 4: pending R$ 150 affects projection, realized update affects result once', () => {
  const expense = tx({ id: 'pending', amount: 15000, status: 'planned' });
  let state = send(scenario(), 'transaction.save', expense);
  assert.equal(monthMetrics(state, month).result, 30000);
  assert.equal(monthMetrics(state, month).projection, 15000);
  state = send(state, 'transaction.save', { ...expense, status: 'realized', date: '2026-09-11' });
  state = send(state, 'transaction.save', { ...expense, status: 'realized', date: '2026-09-11' });
  assert.equal(state.transactions.length, 4);
  assert.equal(monthMetrics(state, month).result, 15000);
  assert.equal(monthMetrics(state, month).pendingExpenses, 0);
});
test('acceptance 5: edits, month moves and deletions update the same source totals', () => {
  let state = send(emptyState(), 'transaction.save', tx());
  state = send(state, 'transaction.save', tx({ amount: 5000, category: 'saude' }));
  assert.equal(monthMetrics(state, month).categoryExpenses.outros, 0);
  assert.equal(monthMetrics(state, month).categoryExpenses.saude, 5000);
  state = send(state, 'transaction.save', tx({ amount: 5000, category: 'saude', date: '2026-10-01' }));
  assert.equal(monthMetrics(state, month).expenses, 0);
  assert.equal(monthMetrics(state, '2026-10').expenses, 5000);
  state = send(state, 'transaction.delete', { id: 't1' });
  assert.equal(monthMetrics(state, '2026-10').expenses, 0);
});
test('acceptance 6: explicit zero and absent income remain distinct, deficit is negative', () => {
  let state = send(emptyState(), 'transaction.save', tx({ amount: 50000 }));
  assert.equal(state.profile.expectedIncome, null);
  assert.equal(monthMetrics(state, month).incomplete, true);
  state = send(state, 'profile.update', { expectedIncome: 0, confirmedNoIncomeMonths: [month] });
  assert.equal(state.profile.expectedIncome, 0);
  assert.equal(monthMetrics(state, month).income, 0);
  assert.equal(monthMetrics(state, month).incomplete, false);
  assert.equal(monthMetrics(state, month).result, -50000);
  assert.equal(state.goals.length, 0);
});
test('onboarding estimates do not generate transactions or replace realized revenue', () => {
  const state = send(emptyState(), 'profile.update', { expectedIncome: 300000, essentialExpenses: 200000 });
  assert.equal(state.transactions.length, 0);
  assert.equal(monthMetrics(state, month).income, 0);
  assert.equal(monthMetrics(state, month).incomplete, true);
});
test('realized income clears prior explicit no-income confirmation', () => {
  let state = send(emptyState(), 'profile.update', { confirmedNoIncomeMonths: [month] });
  state = send(state, 'transaction.save', tx({ type: 'income' }));
  assert.deepEqual(state.profile.confirmedNoIncomeMonths, []);
  assert.throws(() => send(state, 'profile.update', { confirmedNoIncomeMonths: [month] }), /já possui receita/);
});
test('archived goals remain part of guarded total; historical positions exclude later movements', () => {
  let state = send(emptyState(), 'goal.save', goal({ initialAmount: 50000 }));
  state = send(state, 'movement.add', { id: 'm1', goalId: 'g1', type: 'deposit', amount: 10000, date: '2026-09-01', note: '' });
  state = send(state, 'goal.archive', { id: 'g1', archived: true });
  assert.equal(goalBalance(state, 'g1', '2025-12-31'), 0);
  assert.equal(goalBalance(state, 'g1', '2026-08-31'), 50000);
  assert.equal(monthMetrics(state, month).guarded, 60000);
  assert.equal(monthMetrics(state, month).guardedAsOf, '2026-09-30');
  assert.equal(state.movements.length, 1);
  assert.throws(() => send(state, 'movement.add', { id: 'm2', goalId: 'g1', type: 'deposit', amount: 1, date: '2026-09-02', note: '' }), /Reative/);
});
test('current and future month guarded position is today, not a future balance', () => {
  const today = todayISO();
  let state = send(emptyState(), 'goal.save', goal({ initialAmount: 1000, initialDate: today, deadline: null }));
  state = send(state, 'movement.add', { id: 'future', goalId: 'g1', type: 'deposit', amount: 9999, date: '2200-01-01', note: '' });
  const metrics = monthMetrics(state, currentMonth());
  assert.equal(metrics.guarded, 1000);
  assert.equal(metrics.guardedAsOf, today);
  assert.equal(monthMetrics(state, '2200-01').guardedAsOf, today);
});
test('initial balance and reference date are immutable; identified adjustments are allowed', () => {
  let state = send(emptyState(), 'goal.save', goal({ initialAmount: 5000 }));
  assert.throws(() => send(state, 'goal.save', goal({ initialAmount: 6000 })), /saldo inicial/);
  assert.throws(() => send(state, 'goal.save', goal({ initialAmount: 5000, initialDate: '2026-02-01' })), /saldo inicial/);
  assert.throws(() => send(state, 'movement.add', { id: 'm1', goalId: 'g1', type: 'adjustment_in', amount: 1000, date: '2026-09-01', note: '' }), /motivo/);
  state = send(state, 'movement.add', { id: 'm1', goalId: 'g1', type: 'adjustment_in', amount: 1000, date: '2026-09-01', note: 'Correção do valor informado' });
  assert.equal(goalBalance(state, 'g1', '2026-09-30'), 6000);
});
test('withdrawals cannot overdraw now or at any position after retroactive movement', () => {
  let state = send(emptyState(), 'goal.save', goal({ initialAmount: 10000 }));
  state = send(state, 'movement.add', { id: 'withdraw', goalId: 'g1', type: 'withdrawal', amount: 9000, date: '2026-09-10', note: '' });
  state = send(state, 'movement.add', { id: 'deposit', goalId: 'g1', type: 'deposit', amount: 10000, date: '2026-09-20', note: '' });
  assert.equal(goalBalance(state, 'g1', '2026-09-30'), 11000);
  assert.throws(() => send(state, 'movement.add', { id: 'retro', goalId: 'g1', type: 'withdrawal', amount: 2000, date: '2026-09-05', note: '' }), /negativo/);
  assert.throws(() => send(state, 'movement.add', { id: 'past', goalId: 'g1', type: 'deposit', amount: 1000, date: '2025-12-31', note: '' }), /anterior/);
  assert.equal(state.movements.length, 2);
});
test('reserve target derives from base and months, never duplicates guarded money', () => {
  const reserve = goal({ kind: 'reserve', essentialBase: 200000, reserveMonths: 3, target: 600000, initialAmount: 30000 });
  let state = send(emptyState(), 'goal.save', reserve);
  assert.equal(monthMetrics(state, month).guarded, 30000);
  assert.throws(() => send(emptyState(), 'goal.save', { ...reserve, target: 599999 }), /multiplicada/);
  assert.throws(() => send(emptyState(), 'goal.save', { ...reserve, reserveMonths: 0 }), /meses/);
  state = send(state, 'goal.save', { ...reserve, essentialBase: 300000, target: 900000 });
  assert.equal(monthMetrics(state, month).guarded, 30000);
});
test('goal progress is a requirement estimate and expired or missing deadlines give null', () => {
  const state = send(emptyState(), 'goal.save', goal({ initialAmount: 10000 }));
  const progress = goalProgress(state, 'g1', '2026-09-01');
  assert.equal(progress.balance, 10000);
  assert.equal(progress.remaining, 40000);
  assert.equal(progress.percent, 20);
  assert.equal(progress.monthlyNeeded, 10000);
  assert.equal(goalProgress(state, 'g1', '2027-01-01').monthlyNeeded, null);
  const noDeadline = send(state, 'goal.save', { ...state.goals[0], deadline: null });
  assert.equal(goalProgress(noDeadline, 'g1').monthlyNeeded, null);
});
test('debt references must exist in this state and be expenses in dividas', () => {
  assert.throws(() => send(emptyState(), 'debt.save', debt()), /não encontrado/);
  const state = scenario();
  assert.throws(() => send(state, 'debt.save', debt('income')), /categoria Dívidas/);
  assert.throws(() => send(state, 'debt.save', debt('expense')), /categoria Dívidas/);
  const linked = send(state, 'debt.save', debt());
  assert.throws(() => send(linked, 'debt.save', { ...debt(), id: 'd2' }), /outra dívida/);
  assert.throws(() => send(linked, 'transaction.save', { ...linked.transactions[2], category: 'outros' }), /vinculado/);
});
test('deleting linked transaction clears only debt link; deleting debt preserves expense', () => {
  const linked = send(scenario(), 'debt.save', debt());
  const deletedTransaction = send(linked, 'transaction.delete', { id: 'installment' });
  assert.equal(deletedTransaction.debts[0].transactionId, null);
  assert.equal(deletedTransaction.debts[0].balance, 200000);
  const deletedDebt = send(linked, 'debt.delete', { id: 'd1' });
  assert.equal(deletedDebt.transactions.length, 3);
  assert.equal(monthMetrics(deletedDebt, month).result, 30000);
});
test('atomic debt and installment creates one planned expense and validates their link', () => {
  const original = scenario();
  const transaction = tx({ id: 'new-installment', category: 'dividas', amount: 20000, date: '2026-09-20', status: 'planned' });
  const payload = { debt: { ...debt('new-installment'), id: 'new-debt' }, transaction };
  const state = send(original, 'debt.saveWithInstallment', payload);
  assert.equal(state.debts.length, 1);
  assert.equal(state.debts[0].transactionId, 'new-installment');
  assert.equal(state.transactions.length, original.transactions.length + 1);
  assert.equal(monthMetrics(state, month).result, 30000);
  assert.equal(monthMetrics(state, month).pendingExpenses, 20000);
  assert.equal(state.debts[0].balance, 200000);
  assert.equal(original.debts.length, 0);
  assert.equal(original.transactions.length, 3);
  assert.throws(() => send(state, 'debt.saveWithInstallment', payload), /já existe/);
  assert.throws(() => send(original, 'debt.saveWithInstallment', { ...payload, debt: { ...payload.debt, transactionId: 'installment' } }), /vinculada/);
});
test('atomic debt validation failure never leaves a new installment or changes prior data', () => {
  const original = scenario();
  const snapshot = JSON.stringify(original);
  const transaction = tx({ id: 'new-installment', category: 'dividas', amount: 20000, date: '2026-09-20', status: 'planned' });
  const payload = { debt: { ...debt('new-installment'), id: 'new-debt', interestUnit: 'monthly', interestRate: 'oops' }, transaction };
  assert.throws(() => send(original, 'debt.saveWithInstallment', payload), /taxa/);
  assert.equal(JSON.stringify(original), snapshot);
  assert.throws(() => send(original, 'debt.saveWithInstallment', { debt: debt('new-installment'), transaction: { ...transaction, amount: 19999 } }), /valor e o vencimento/);
  assert.throws(() => send(original, 'debt.saveWithInstallment', { debt: debt('new-installment'), transaction: { ...transaction, status: 'realized' } }), /prevista/);
  assert.throws(() => send(original, 'debt.saveWithInstallment', { debt: debt('new-installment'), transaction: { ...transaction, category: 'outros' } }), /categoria Dívidas/);
  assert.equal(JSON.stringify(original), snapshot);
});
test('budget is unique per month/category and permits an explicit zero limit', () => {
  const state = send(emptyState(), 'budget.save', { id: 'b1', month, category: 'lazer', limit: 0 });
  assert.equal(state.budgets[0].limit, 0);
  assert.throws(() => send(state, 'budget.save', { id: 'b2', month, category: 'lazer', limit: 1000 }), /Já existe/);
  assert.equal(send(state, 'budget.save', { id: 'b1', month, category: 'lazer', limit: 1000 }).budgets.length, 1);
});
test('invalid fields, dates, enums, negatives, floats, unsafe amounts and unknown IDs reject', () => {
  for (const patch of [{ amount: -1 }, { amount: 0 }, { amount: 1.5 }, { amount: NaN }, { amount: Infinity }, { amount: MAX_MONEY + 1 }, { date: '2026-02-30' }, { status: 'pago' }, { type: 'unknown' }, { expenseKind: 'bad' }, { category: '__proto__' }, { description: '' }]) assert.throws(() => send(emptyState(), 'transaction.save', { ...tx(), ...patch }));
  assert.throws(() => send(emptyState(), 'profile.update', { expectedIncome: -1 }));
  assert.throws(() => send(emptyState(), 'profile.update', { aiConsent: 'yes' }));
  assert.throws(() => send(emptyState(), 'profile.update', { ownerId: 'someone' }));
  assert.throws(() => send(emptyState(), 'transaction.delete', { id: 'missing' }));
  assert.throws(() => send(emptyState(), 'goal.archive', { id: 'missing', archived: true }));
  assert.throws(() => send(emptyState(), 'unknown.action', {}));
});
test('saving actions are optional decimal-rounded snapshots and never modify records', () => {
  assert.equal(estimateSaving(1, 50), 1);
  assert.equal(estimateSaving(40000, 20), 8000);
  const before = scenario();
  const state = send(before, 'savingAction.save', { id: 's1', month, category: 'outros', baseAmount: 250000, reductionPercent: 20, estimatedSaving: 50000 });
  assert.deepEqual(state.transactions, before.transactions);
  assert.deepEqual(state.movements, before.movements);
  assert.equal(monthMetrics(state, month).result, 30000);
  assert.throws(() => send(before, 'savingAction.save', { id: 's1', month, category: 'outros', baseAmount: 250000, reductionPercent: 20, estimatedSaving: 9000 }), /corresponder/);
});
test('saving action base comes from realized category records in the selected month', () => {
  let before = send(scenario(), 'transaction.save', tx({ id: 'future-pending', amount: 50000, status: 'planned' }));
  before = send(before, 'transaction.save', tx({ id: 'prior-paid', amount: 50000, date: '2026-08-10' }));
  const payload = { id: 's1', month, category: 'outros', baseAmount: 250000, reductionPercent: 20, estimatedSaving: 50000 };
  const selected = send(before, 'savingAction.save', payload);
  assert.equal(selected.savingActions[0].baseAmount, 250000);
  assert.throws(() => send(before, 'savingAction.save', { ...payload, baseAmount: 300000, estimatedSaving: 60000 }), /base do cenário/i);
  assert.throws(() => send(selected, 'savingAction.save', { ...payload, id: 'duplicate' }), /Já existe/);
  const changed = send(selected, 'transaction.save', tx({ id: 'expense', amount: 200000 }));
  assert.equal(changed.savingActions[0].baseAmount, 250000, 'saved scenario retains the original snapshot');
  assert.throws(() => send(changed, 'savingAction.save', payload), /base do cenário/i);
  const updated = send(changed, 'savingAction.save', { ...payload, baseAmount: 200000, reductionPercent: 10, estimatedSaving: 20000 });
  assert.equal(updated.savingActions[0].estimatedSaving, 20000);
});
test('suggestions never prescribe cutting essential categories and explain limit review', () => {
  let state = send(emptyState(), 'transaction.save', tx({ category: 'moradia', amount: 100000 }));
  state = send(state, 'budget.save', { id: 'b1', month, category: 'moradia', limit: 80000 });
  state = send(state, 'transaction.save', tx({ id: 'leisure', category: 'lazer', amount: 40000 }));
  const suggestions = savingSuggestions(state, month);
  assert.ok(suggestions.length <= 3);
  const essential = suggestions.find(item => item.category === 'moradia')!;
  assert.equal(essential.estimatedSaving, 0);
  assert.equal(essential.reductionPercent, 0);
  assert.match(essential.reason, /não gera economia/);
  assert.equal(suggestions.find(item => item.category === 'lazer')!.estimatedSaving, 8000);
  assert.deepEqual(savingSuggestions(emptyState(), month), []);
});
test('acceptance 7: zero rate and 12 R$ 100 deposits yield R$ 1.200', () => {
  const result = simulate({ initial: 0, monthly: 10000, months: 12, annualRate: '0' });
  assert.equal(result.balance, 120000);
  assert.equal(result.contributed, 120000);
  assert.equal(result.growth, 0);
  assert.equal(result.rows.length, 12);
});
test('acceptance 7: annual effective 12% over 12 months grows R$ 1.000 to R$ 1.120', () => {
  const result = simulate({ initial: 100000, monthly: 0, months: 12, annualRate: '12' });
  assert.equal(result.balance, 112000);
  assert.equal(result.growth, 12000);
});
test('simulator uses end-of-month deposits, handles zero term and permits hypothetical loss', () => {
  const first = simulate({ initial: 0, monthly: 10000, months: 1, annualRate: '12' });
  assert.equal(first.balance, 10000);
  assert.equal(first.growth, 0);
  assert.deepEqual(simulate({ initial: 1000, monthly: 10000, months: 0, annualRate: '12' }), { rows: [], contributed: 1000, balance: 1000, growth: 0 });
  const loss = simulate({ initial: 100000, monthly: 0, months: 12, annualRate: '-50' });
  assert.equal(loss.balance, 50000);
  assert.equal(loss.growth, -50000);
});
test('simulator rejects invalid inputs and unsafe large outputs', () => {
  const input = { initial: 100000, monthly: 10000, months: 12, annualRate: '12' };
  for (const patch of [{ initial: -1 }, { monthly: -1 }, { months: -1 }, { months: 601 }, { months: 1.5 }, { annualRate: '-100' }, { annualRate: 'NaN' }, { annualRate: '1001' }, { annualRate: '1e3' }]) assert.throws(() => simulate({ ...input, ...patch }));
  assert.throws(() => simulate({ initial: MAX_MONEY, monthly: MAX_MONEY, months: 600, annualRate: '1000' }), /precisão/);
});
test('pure commands preserve prior state on success and failure', () => {
  const original = scenario();
  const snapshot = JSON.stringify(original);
  send(original, 'transaction.save', tx({ id: 'new' }));
  assert.equal(JSON.stringify(original), snapshot);
  assert.throws(() => send(original, 'transaction.save', tx({ amount: -1 })));
  assert.equal(JSON.stringify(original), snapshot);
});
test('aggregate monetary overflow rejects even when individual entries are allowed', () => {
  const state = emptyState();
  state.transactions = Array.from({ length: 9007 }, (_, index) => tx({ id: `large-${index}`, amount: MAX_MONEY }));
  assert.throws(() => send(state, 'transaction.save', tx({ id: 'large-extra', amount: MAX_MONEY })), /precisão/);
  assert.equal(state.transactions.length, 9007);
});
test('empty account never receives demo content and demo is deterministic for explicit month', () => {
  const empty = emptyState();
  const demo = demoState(month);
  assert.equal(empty.transactions.length, 0);
  assert.equal(empty.profile.onboardingDone, false);
  assert.equal(demo.profile.onboardingDone, true);
  assert.equal(monthMetrics(demo, month).result, 30000);
  assert.equal(monthMetrics(demo, month).projection, 15000);
  assert.equal(monthMetrics(demo, month).guarded, 80000);
  assert.deepEqual(demo, demoState(month));
  demo.profile.name = 'Alteração local';
  assert.equal(empty.profile.name, '');
});
