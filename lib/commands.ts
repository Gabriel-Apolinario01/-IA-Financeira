import { assertMoney, estimateSaving, isValidDate, isValidMonth, MAX_MONEY, MAX_RECORDS, safeSum } from './finance';
import { CATEGORIES, type Budget, type Command, type Debt, type FinanceState, type Goal, type Movement, type Profile, type SavingAction, type Transaction } from './types';

type Payload = Record<string, unknown>;
const categoryIds = new Set<string>(CATEGORIES.map(category => category.id));
function object(value: unknown, label: string): Payload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} inválido.`);
  return value as Payload;
}
function text(value: unknown, label: string, max = 160, optional = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value) || (!optional && !value.trim())) throw new Error(`${label} deve ter ${optional ? 'até' : 'de 1 a'} ${max} caracteres.`);
  return value.trim();
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new Error('Identificador inválido.');
  return value;
}
function enumeration<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (!values.includes(value as T)) throw new Error(`${label} inválido.`);
  return value as T;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} deve ser sim ou não.`);
  return value;
}
function date(value: unknown, label: string): string {
  if (!isValidDate(value)) throw new Error(`${label} deve ser uma data válida entre 1900 e 2200.`);
  return value;
}
function month(value: unknown): string {
  if (!isValidMonth(value)) throw new Error('O mês deve ser válido, no formato AAAA-MM.');
  return value;
}
function money(value: unknown, label: string, allowZero = true): number { assertMoney(value, label, allowZero); return value; }
function aggregateMoney(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('O total do cenário deve ser válido em centavos.');
  return value;
}
function nullableMoney(value: unknown, label: string, allowZero = true): number | null { return value === null ? null : money(value, label, allowZero); }
function category(value: unknown): string {
  if (typeof value !== 'string' || !categoryIds.has(value)) throw new Error('Selecione uma categoria válida.');
  return value;
}
function replace<T extends { id: string }>(rows: T[], item: T): T[] {
  return rows.some(row => row.id === item.id) ? rows.map(row => row.id === item.id ? item : row) : [...rows, item];
}
function existing<T extends { id: string }>(rows: T[], value: unknown, label: string): T {
  const key = id(value);
  const item = rows.find(row => row.id === key);
  if (!item) throw new Error(`${label} não encontrado nesta conta.`);
  return item;
}
function profileUpdate(profile: Profile, payload: Payload): Profile {
  const allowed = new Set(['name', 'incomeType', 'expectedIncome', 'essentialExpenses', 'initialObjective', 'onboardingDone', 'aiConsent', 'confirmedNoIncomeMonths']);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new Error('Campo de perfil desconhecido.');
  const updated = { ...profile };
  if ('name' in payload) updated.name = text(payload.name, 'Nome', 80, true);
  if ('incomeType' in payload) updated.incomeType = enumeration(payload.incomeType, ['fixed', 'variable'], 'Tipo de renda');
  if ('expectedIncome' in payload) updated.expectedIncome = nullableMoney(payload.expectedIncome, 'Renda prevista');
  if ('essentialExpenses' in payload) updated.essentialExpenses = nullableMoney(payload.essentialExpenses, 'Despesas essenciais');
  if ('initialObjective' in payload) updated.initialObjective = text(payload.initialObjective, 'Objetivo inicial', 300, true);
  if ('onboardingDone' in payload) updated.onboardingDone = boolean(payload.onboardingDone, 'Configuração inicial');
  if ('aiConsent' in payload) updated.aiConsent = boolean(payload.aiConsent, 'Compartilhamento com IA');
  if ('confirmedNoIncomeMonths' in payload) {
    if (!Array.isArray(payload.confirmedNoIncomeMonths) || payload.confirmedNoIncomeMonths.length > 1000) throw new Error('Informe uma lista válida de meses sem receita.');
    updated.confirmedNoIncomeMonths = [...new Set(payload.confirmedNoIncomeMonths.map(month))].sort();
  }
  return updated;
}
function transaction(payload: Payload): Transaction {
  return { id: id(payload.id), description: text(payload.description, 'Descrição'), amount: money(payload.amount, 'Valor do lançamento', false),
    type: enumeration(payload.type, ['income', 'expense'], 'Tipo do lançamento'), category: category(payload.category), date: date(payload.date, 'Data do lançamento'),
    status: enumeration(payload.status, ['planned', 'realized'], 'Situação do lançamento'), expenseKind: enumeration(payload.expenseKind, ['fixed', 'variable'], 'Classificação da despesa') };
}
function goal(payload: Payload): Goal {
  const item: Goal = { id: id(payload.id), name: text(payload.name, 'Nome da meta', 100), kind: enumeration(payload.kind, ['general', 'reserve'], 'Tipo da meta'),
    target: money(payload.target, 'Alvo da meta', false), deadline: payload.deadline === null ? null : date(payload.deadline, 'Prazo da meta'),
    initialAmount: money(payload.initialAmount, 'Saldo inicial'), initialDate: date(payload.initialDate, 'Data do saldo inicial'),
    essentialBase: nullableMoney(payload.essentialBase, 'Base de despesas essenciais'), reserveMonths: payload.reserveMonths === null ? null : Number(payload.reserveMonths),
    archived: boolean(payload.archived, 'Arquivamento') };
  if (item.deadline && item.deadline < item.initialDate) throw new Error('O prazo da meta não pode ser anterior à data do saldo inicial.');
  if (item.kind === 'reserve') {
    if (item.essentialBase === null || item.essentialBase <= 0 || typeof payload.reserveMonths !== 'number' || !Number.isInteger(item.reserveMonths) || item.reserveMonths! < 1 || item.reserveMonths! > 120) throw new Error('Para a reserva, informe a despesa essencial mensal e de 1 a 120 meses.');
    const computed = item.essentialBase * item.reserveMonths!;
    if (!Number.isSafeInteger(computed) || computed > MAX_MONEY || item.target !== computed) throw new Error('O alvo da reserva deve ser a despesa essencial mensal multiplicada pelos meses escolhidos.');
  } else if (item.essentialBase !== null || item.reserveMonths !== null) throw new Error('Uma meta comum não deve incluir a base de uma reserva.');
  return item;
}
/** Validate every historical position, including positions after a retroactive edit. */
export function validateGoalHistory(state: FinanceState, goalId: string): void {
  const target = existing(state.goals, goalId, 'Meta');
  let balance = target.initialAmount;
  const movements = state.movements.filter(item => item.goalId === goalId).map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.date.localeCompare(b.item.date) || a.index - b.index);
  for (const { item } of movements) {
    if (item.date < target.initialDate) throw new Error('A movimentação não pode ser anterior à data do saldo inicial.');
    balance = safeSum([balance, item.type === 'withdrawal' || item.type === 'adjustment_out' ? -item.amount : item.amount]);
    if (balance < 0) throw new Error('Esta saída deixaria o saldo da meta negativo em parte do histórico. Confira o valor e a data.');
  }
}
export function validateMagnitude(state: FinanceState) {
  const collections = [state.transactions, state.budgets, state.goals, state.movements, state.debts, state.savingActions];
  if (collections.some(rows => rows.length > MAX_RECORDS)) throw new Error('Esta coleção atingiu o limite de 10.000 registros do MVP.');
  // Absolute sums prevent hidden overflow even when opposite signs would cancel.
  safeSum(state.transactions.map(item => item.amount));
  safeSum([...state.goals.map(item => item.initialAmount), ...state.movements.map(item => item.amount)]);
  safeSum(state.debts.map(item => item.balance));
  safeSum(state.budgets.map(item => item.limit));
  safeSum(state.savingActions.map(item => item.estimatedSaving));
}

/** The shared pure mutation boundary for demo and authenticated accounts. */
export function applyCommand(state: FinanceState, command: Command): FinanceState {
  const request = object(command, 'Comando');
  id(request.id);
  const payload = object(request.payload, 'Dados enviados');
  let next: FinanceState = { ...state };
  switch (request.type) {
    case 'profile.update': {
      next.profile = profileUpdate(state.profile, payload);
      if (next.profile.confirmedNoIncomeMonths.some(value => state.transactions.some(item => item.type === 'income' && item.status === 'realized' && item.date.slice(0, 7) === value))) throw new Error('Este mês já possui receita recebida. Revise os lançamentos antes de confirmar ausência de renda.');
      break;
    }
    case 'transaction.save': {
      if (state.transactions.some(t => t.id === payload.id && t.origin) || (typeof payload.id === 'string' && payload.id.startsWith('imp_') && state.importBatches?.some(b => b.transactions.some(t => t.id === payload.id)))) throw new Error('Lançamento importado: desfaça o lote no histórico para corrigir a fonte.');
      const item = transaction(payload);
      if (state.debts.some(debt => debt.transactionId === item.id) && (item.type !== 'expense' || item.category !== 'dividas')) throw new Error('Este lançamento está vinculado a uma dívida. Mantenha-o como despesa de dívidas ou desfaça o vínculo antes de alterar.');
      next.transactions = replace(state.transactions, item);
      if (item.type === 'income' && item.status === 'realized' && state.profile.confirmedNoIncomeMonths.includes(item.date.slice(0, 7))) {
        next.profile = { ...state.profile, confirmedNoIncomeMonths: state.profile.confirmedNoIncomeMonths.filter(value => value !== item.date.slice(0, 7)) };
      }
      break;
    }
    case 'transaction.delete': {
      const item = existing(state.transactions, payload.id, 'Lançamento');
      if (item.origin) throw new Error('Lançamento importado: use Desfazer lote no histórico para preservar a origem.');
      next.transactions = state.transactions.filter(row => row.id !== item.id);
      next.debts = state.debts.map(debt => debt.transactionId === item.id ? { ...debt, transactionId: null } : debt);
      break;
    }
    case 'budget.save': {
      const item: Budget = { id: id(payload.id), month: month(payload.month), category: category(payload.category), limit: money(payload.limit, 'Limite mensal') };
      if (state.budgets.some(row => row.id !== item.id && row.month === item.month && row.category === item.category)) throw new Error('Já existe um limite para esta categoria neste mês. Edite o limite existente.');
      next.budgets = replace(state.budgets, item);
      break;
    }
    case 'budget.delete': {
      const item = existing(state.budgets, payload.id, 'Limite');
      next.budgets = state.budgets.filter(row => row.id !== item.id);
      break;
    }
    case 'goal.save': {
      const item = goal(payload);
      const prior = state.goals.find(row => row.id === item.id);
      if (prior && (prior.initialAmount !== item.initialAmount || prior.initialDate !== item.initialDate)) throw new Error('O saldo inicial e sua data não podem ser alterados. Registre um ajuste identificado no histórico.');
      next.goals = replace(state.goals, item);
      validateGoalHistory(next, item.id);
      break;
    }
    case 'goal.archive': {
      const item = existing(state.goals, payload.id, 'Meta');
      next.goals = replace(state.goals, { ...item, archived: boolean(payload.archived, 'Arquivamento') });
      break;
    }
    case 'movement.add': {
      const item: Movement = { id: id(payload.id), goalId: id(payload.goalId), type: enumeration(payload.type, ['deposit', 'withdrawal', 'adjustment_in', 'adjustment_out'], 'Tipo da movimentação'),
        amount: money(payload.amount, 'Valor da movimentação', false), date: date(payload.date, 'Data da movimentação'), note: text(payload.note, 'Observação', 300, true) };
      const target = existing(state.goals, item.goalId, 'Meta');
      if (target.archived) throw new Error('Reative a meta antes de registrar uma movimentação.');
      if (state.movements.some(row => row.id === item.id)) throw new Error('Esta movimentação já foi registrada.');
      if ((item.type === 'adjustment_in' || item.type === 'adjustment_out') && !item.note) throw new Error('Explique o motivo do ajuste no histórico.');
      next.movements = [...state.movements, item];
      validateGoalHistory(next, item.goalId);
      break;
    }
    case 'debt.save': {
      const item: Debt = { id: id(payload.id), name: text(payload.name, 'Identificação da dívida', 100), balance: money(payload.balance, 'Saldo devedor'),
        installment: nullableMoney(payload.installment, 'Parcela prevista', false), dueDate: payload.dueDate === null ? null : date(payload.dueDate, 'Vencimento'),
        interestRate: payload.interestRate === null ? null : text(payload.interestRate, 'Taxa de juros', 24),
        interestUnit: enumeration(payload.interestUnit, ['monthly', 'annual', 'unknown'], 'Unidade dos juros'),
        transactionId: payload.transactionId === null ? null : id(payload.transactionId) };
      if (item.interestUnit === 'unknown' && item.interestRate !== null) throw new Error('Deixe a taxa vazia quando os juros forem desconhecidos.');
      if (item.interestUnit !== 'unknown' && item.interestRate === null) throw new Error('Informe a taxa ou escolha a opção de juros desconhecidos.');
      if (item.interestRate !== null) {
        if (!/^\d+(?:[.,]\d{1,8})?$/.test(item.interestRate) || !Number.isFinite(Number(item.interestRate.replace(',', '.'))) || Number(item.interestRate.replace(',', '.')) > 1000) throw new Error('Informe uma taxa de juros entre 0% e 1.000%.');
        item.interestRate = item.interestRate.replace(',', '.');
      }
      if (item.transactionId) {
        const linked = existing(state.transactions, item.transactionId, 'Lançamento vinculado');
        if (linked.origin) throw new Error('Vínculos de dívidas com importações ainda não são suportados.');
        if (linked.type !== 'expense' || linked.category !== 'dividas') throw new Error('Vincule uma despesa existente na categoria Dívidas.');
        if (state.debts.some(debt => debt.id !== item.id && debt.transactionId === item.transactionId)) throw new Error('Este lançamento já está vinculado a outra dívida.');
      }
      next.debts = replace(state.debts, item);
      break;
    }
    case 'debt.saveWithInstallment': {
      const debtPayload = object(payload.debt, 'Dívida');
      const transactionPayload = object(payload.transaction, 'Parcela');
      const installment = transaction(transactionPayload);
      if (debtPayload.transactionId !== installment.id) throw new Error('A dívida deve estar vinculada à parcela criada nesta operação.');
      if (state.transactions.some(item => item.id === installment.id)) throw new Error('Esta parcela já existe. Selecione o lançamento existente ao vincular a dívida.');
      if (installment.type !== 'expense' || installment.category !== 'dividas' || installment.status !== 'planned') throw new Error('A nova parcela deve ser uma despesa prevista da categoria Dívidas.');
      if (debtPayload.installment !== installment.amount || debtPayload.dueDate !== installment.date) throw new Error('O valor e o vencimento da nova parcela devem corresponder aos informados na dívida.');
      // Both functions are pure. No intermediate state can escape on validation
      // failure; the repository persists this outer command only once.
      const withInstallment = applyCommand(state, { id: command.id, type: 'transaction.save', payload: transactionPayload });
      next = applyCommand(withInstallment, { id: command.id, type: 'debt.save', payload: debtPayload });
      break;
    }
    case 'debt.delete': {
      const item = existing(state.debts, payload.id, 'Dívida');
      next.debts = state.debts.filter(row => row.id !== item.id);
      break;
    }
    case 'savingAction.save': {
      const item: SavingAction = { id: id(payload.id), month: month(payload.month), category: category(payload.category),
        reductionPercent: typeof payload.reductionPercent === 'number' ? payload.reductionPercent : NaN,
        baseAmount: aggregateMoney(payload.baseAmount), estimatedSaving: aggregateMoney(payload.estimatedSaving) };
      const recordedBase = safeSum(state.transactions.filter(row => row.type === 'expense' && row.status === 'realized' && row.category === item.category && row.date.slice(0, 7) === item.month).map(row => row.amount));
      if (item.baseAmount !== recordedBase) throw new Error('A base do cenário mudou. Atualize a página e use o gasto realizado desta categoria no mês selecionado.');
      if (state.savingActions.some(row => row.id !== item.id && row.month === item.month && row.category === item.category)) throw new Error('Já existe um cenário escolhido para esta categoria neste mês. Edite o cenário existente.');
      const expected = estimateSaving(item.baseAmount, item.reductionPercent);
      if (item.estimatedSaving !== expected) throw new Error('A economia estimada deve corresponder à base multiplicada pelo percentual informado.');
      next.savingActions = replace(state.savingActions, item);
      break;
    }
    case 'savingAction.delete': {
      const item = existing(state.savingActions, payload.id, 'Ação');
      next.savingActions = state.savingActions.filter(row => row.id !== item.id);
      break;
    }
    default: throw new Error('Ação desconhecida.');
  }
  validateMagnitude(next);
  return next;
}
