"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X, ArrowRight, Info } from "lucide-react";
import { CATEGORIES, type Budget, type Debt, type FinanceState, type Goal, type Transaction } from "@/lib/types";
import { formatMoney, parseMoney, todayISO, goalBalance } from "@/lib/finance";
import { uid } from "@/lib/client-store";

export type DialogSpec =
  | { kind: "transaction"; item?: Transaction; preset?: Partial<Transaction> }
  | { kind: "realize"; item: Transaction }
  | { kind: "budget"; item?: Budget }
  | { kind: "goal"; item?: Goal }
  | { kind: "movement"; goal: Goal }
  | { kind: "debt"; item?: Debt }
  | { kind: "profile" }
  | { kind: "calculation" }
  | { kind: "confirm"; title: string; description: string; action: () => Promise<void>; destructive?: boolean };

type Props = {
  spec: DialogSpec; state: FinanceState; month: string; pending: boolean;
  close: () => void;
  save: (type: string, payload: Record<string, unknown>, id: string) => Promise<unknown>;
};
const moneyInput = (value?: number | null) => value == null ? "" : (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const val = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const nullableMoney = (form: FormData, key: string) => val(form, key) === "" ? null : parseMoney(val(form, key));

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement<{ id?: string; "aria-label"?: string; "aria-describedby"?: string }>(children)
    ? cloneElement(children, { id, "aria-label": label, "aria-describedby": hint ? `${id}-hint` : undefined }) : children;
  return <label className="field" htmlFor={id}><span>{label}</span>{control}{hint && <small id={`${id}-hint`}>{hint}</small>}</label>;
}

export function FinanceDialog({ spec, state, month, pending, close, save }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const stableId = useRef(uid());
  const entityId = useRef(uid());
  const installmentId = useRef(uid());
  const [error, setError] = useState("");
  const [txType, setTxType] = useState(spec.kind === "transaction" ? spec.item?.type ?? spec.preset?.type ?? "expense" : "expense");
  const [txStatus, setTxStatus] = useState(spec.kind === "transaction" ? spec.item?.status ?? spec.preset?.status ?? "realized" : "realized");
  const [goalKind, setGoalKind] = useState(spec.kind === "goal" ? spec.item?.kind ?? "general" : "general");
  const [linkMode, setLinkMode] = useState(spec.kind === "debt" && spec.item?.transactionId ? "existing" : "none");
  const [interestUnit, setInterestUnit] = useState(spec.kind === "debt" ? spec.item?.interestUnit ?? "unknown" : "unknown");
  const [essential, setEssential] = useState(spec.kind === "goal" ? moneyInput(spec.item?.essentialBase ?? state.profile.essentialExpenses) : "");
  const [months, setMonths] = useState(spec.kind === "goal" ? String(spec.item?.reserveMonths ?? 3) : "3");
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]), select")?.focus();
    return () => { dialog?.close(); if (previouslyFocused?.isConnected) previouslyFocused.focus(); };
  }, []);
  const titles: Record<DialogSpec["kind"], string> = { transaction: spec.kind === "transaction" && spec.item ? "Editar lançamento" : "Adicionar lançamento", realize: "Confirmar efetivação", budget: "Limite da categoria", goal: spec.kind === "goal" && spec.item ? "Editar meta" : "Uma nova meta", movement: "Movimentar valor guardado", debt: spec.kind === "debt" && spec.item ? "Editar dívida" : "Organizar uma dívida", profile: "Um pouco sobre você", calculation: "Memória de cálculo", confirm: spec.kind === "confirm" ? spec.title : "Confirmar" };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      if (spec.kind === "confirm") await spec.action();
      if (spec.kind === "transaction") {
        await save("transaction.save", { id: spec.item?.id ?? entityId.current, description: val(f, "description"), amount: parseMoney(val(f, "amount")), type: txType, category: txType === "income" ? "outros" : val(f, "category"), date: val(f, "date"), status: txStatus, expenseKind: val(f, "expenseKind") || "variable" }, stableId.current);
      }
      if (spec.kind === "realize") await save("transaction.save", { ...spec.item, date: val(f, "date"), status: "realized" }, stableId.current);
      if (spec.kind === "budget") await save("budget.save", { id: spec.item?.id ?? entityId.current, month, category: val(f, "category"), limit: parseMoney(val(f, "limit")) }, stableId.current);
      if (spec.kind === "goal") {
        const base = goalKind === "reserve" ? parseMoney(essential) : null;
        const reserveMonths = goalKind === "reserve" ? Number(months) : null;
        await save("goal.save", { id: spec.item?.id ?? entityId.current, name: val(f, "name"), kind: goalKind, target: base !== null && reserveMonths !== null ? base * reserveMonths : parseMoney(val(f, "target")), deadline: val(f, "deadline") || null, initialAmount: spec.item?.initialAmount ?? (val(f, "initialAmount") ? parseMoney(val(f, "initialAmount")) : 0), initialDate: spec.item?.initialDate ?? val(f, "initialDate"), essentialBase: base, reserveMonths, archived: spec.item?.archived ?? false }, stableId.current);
      }
      if (spec.kind === "movement") await save("movement.add", { id: entityId.current, goalId: spec.goal.id, type: val(f, "type"), amount: parseMoney(val(f, "amount")), date: val(f, "date"), note: val(f, "note") }, stableId.current);
      if (spec.kind === "debt") {
        const debt = { id: spec.item?.id ?? entityId.current, name: val(f, "name"), balance: parseMoney(val(f, "balance")), installment: nullableMoney(f, "installment"), dueDate: val(f, "dueDate") || null, interestRate: interestUnit === "unknown" ? null : val(f, "interestRate") || null, interestUnit, transactionId: linkMode === "existing" ? val(f, "transactionId") || null : linkMode === "new" ? installmentId.current : null };
        if (linkMode === "new") {
          if (!debt.installment || !debt.dueDate) throw new Error("Informe o valor da parcela e seu vencimento para criar o lançamento.");
          if (!f.get("confirmInstallment")) throw new Error("Confirme a criação de uma única parcela no orçamento.");
          await save("debt.saveWithInstallment", { debt, transaction: { id: installmentId.current, description: `Parcela · ${debt.name}`, amount: debt.installment, type: "expense", category: "dividas", date: debt.dueDate, status: "planned", expenseKind: "fixed" } }, stableId.current);
        } else {
          await save("debt.save", debt, stableId.current);
        }
      }
      if (spec.kind === "profile") await save("profile.update", { name: val(f, "name"), incomeType: val(f, "incomeType"), expectedIncome: nullableMoney(f, "expectedIncome"), essentialExpenses: nullableMoney(f, "essentialExpenses"), initialObjective: val(f, "initialObjective"), onboardingDone: true }, stableId.current);
      close();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); }
  }
  let reserveTarget = "Preencha a base e o período";
  try { reserveTarget = formatMoney(parseMoney(essential) * Number(months)); } catch { /* An incomplete draft is not a persisted value. */ }
  const tx = spec.kind === "transaction" ? spec.item ?? spec.preset : undefined;
  return <dialog ref={ref} className="modal" onCancel={e => { if (pending) e.preventDefault(); else close(); }} onClick={e => { if (e.target === ref.current && !pending) close(); }} aria-labelledby="dialog-heading">
    <div className="modal-head"><div><span className="eyebrow">IA FINANCEIRA</span><h2 id="dialog-heading">{titles[spec.kind]}</h2></div><button className="icon-button" aria-label="Fechar" onClick={close} disabled={pending}><X size={21} /></button></div>
    <form onSubmit={submit}>
      <div className="modal-body">
        {spec.kind === "transaction" && <>
          <div className="segmented"><button type="button" className={txType === "expense" ? "selected" : ""} onClick={() => setTxType("expense")}>Despesa</button><button type="button" className={txType === "income" ? "selected" : ""} onClick={() => setTxType("income")}>Receita</button></div>
          <Field label="Descrição"><input autoFocus name="description" required maxLength={160} placeholder={txType === "expense" ? "Ex.: mercado da semana" : "Ex.: pagamento recebido"} defaultValue={tx?.description} /></Field>
          <div className="form-grid"><Field label="Valor (R$)"><input name="amount" required inputMode="decimal" placeholder="0,00" defaultValue={moneyInput(tx?.amount)} /></Field><Field label="Situação"><select name="status" value={txStatus} onChange={e => setTxStatus(e.target.value as "planned" | "realized")}><option value="realized">{txType === "income" ? "Recebida" : "Paga"}</option><option value="planned">Prevista</option></select></Field></div>
          <Field label={txStatus === "planned" ? "Data de vencimento / previsão" : "Data efetiva do pagamento / recebimento"} hint={txStatus === "realized" ? "Confirme o dia em que o dinheiro realmente entrou ou saiu." : "Este valor entra na projeção, sem alterar o resultado realizado."}><input name="date" type="date" required defaultValue={tx?.date ?? todayISO()} /></Field>
          {txType === "expense" && <div className="form-grid"><Field label="Categoria"><select name="category" defaultValue={tx?.category ?? "alimentacao"}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field><Field label="Classificação"><select name="expenseKind" defaultValue={tx?.expenseKind ?? "variable"}><option value="variable">Variável</option><option value="fixed">Fixa</option></select></Field></div>}
          <p className="fine-print">Uma despesa fixa é uma classificação. Não criamos repetições automáticas.</p>
        </>}
        {spec.kind === "realize" && <><p>Confirme quando <strong>{spec.item.description}</strong>, de <strong>{formatMoney(spec.item.amount)}</strong>, foi {spec.item.type === "expense" ? "paga" : "recebida"}.</p><Field label="Data efetiva"><input autoFocus name="date" type="date" required defaultValue={todayISO()} /></Field><div className="notice">O lançamento existente será atualizado, sem criar outra cópia.</div></>}
        {spec.kind === "budget" && <><Field label="Categoria"><select autoFocus name="category" defaultValue={spec.item?.category ?? "alimentacao"}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field><Field label="Limite mensal (R$)" hint={`Planejamento para ${month.split("-").reverse().join("/")}.`}><input name="limit" inputMode="decimal" required placeholder="0,00" defaultValue={moneyInput(spec.item?.limit)} /></Field><p className="fine-print">Definir um limite não cria despesas. O restante considera os registros deste mês.</p></>}
        {spec.kind === "goal" && <>
          <Field label="Nome da meta"><input autoFocus name="name" required maxLength={100} placeholder="Ex.: minha reserva de tranquilidade" defaultValue={spec.item?.name} /></Field>
          <Field label="Tipo de meta"><select value={goalKind} onChange={e => setGoalKind(e.target.value as "general" | "reserve")}><option value="general">Objetivo pessoal</option><option value="reserve">Reserva de emergência</option></select></Field>
          {goalKind === "general" ? <Field label="Valor alvo (R$)"><input name="target" inputMode="decimal" required placeholder="0,00" defaultValue={moneyInput(spec.item?.target)} /></Field> : <><div className="form-grid"><Field label="Despesas essenciais por mês (R$)"><input inputMode="decimal" required value={essential} onChange={e => setEssential(e.target.value)} placeholder="0,00" /></Field><Field label="Meses de cobertura"><input type="number" required min="1" max="120" step="1" value={months} onChange={e => setMonths(e.target.value)} /></Field></div><div className="notice">Alvo da reserva: <strong>{reserveTarget}</strong><br />Você escolhe o período adequado à sua realidade.</div></>}
          <Field label="Prazo desejado (opcional)"><input name="deadline" type="date" defaultValue={spec.item?.deadline ?? ""} /></Field>
          {!spec.item ? <div className="form-grid"><Field label="Já guardado (R$)" hint="Deixe vazio se ainda não começou."><input name="initialAmount" inputMode="decimal" placeholder="0,00" /></Field><Field label="Data desse valor inicial"><input name="initialDate" type="date" required defaultValue={todayISO()} /></Field></div> : <p className="fine-print">Saldo inicial: {formatMoney(spec.item.initialAmount)}. Para corrigir o saldo atual, registre um ajuste no histórico.</p>}
          <p className="fine-print">Registrar uma meta ou um aporte não transfere dinheiro nem altera o resultado do mês.</p>
        </>}
        {spec.kind === "movement" && <><div className="notice"><strong>{spec.goal.name}</strong><br />Registrado até hoje: {formatMoney(goalBalance(state, spec.goal.id, todayISO()))}</div><Field label="Movimentação"><select autoFocus name="type"><option value="deposit">Aporte — adicionar valor guardado</option><option value="withdrawal">Retirada — utilizar valor guardado</option><option value="adjustment_in">Ajuste de correção — aumentar saldo</option><option value="adjustment_out">Ajuste de correção — diminuir saldo</option></select></Field><div className="form-grid"><Field label="Valor (R$)"><input name="amount" inputMode="decimal" required placeholder="0,00" /></Field><Field label="Data"><input name="date" type="date" required defaultValue={todayISO()} /></Field></div><Field label="Descrição / motivo do ajuste"><input name="note" maxLength={200} placeholder="Ex.: parte do pagamento que reservei" /></Field><p className="fine-print">O histórico é preservado. Aportes e retiradas não são receitas ou despesas.</p></>}
        {spec.kind === "debt" && <>
          <Field label="Identificação da dívida"><input autoFocus name="name" required maxLength={100} placeholder="Ex.: parcelamento da geladeira" defaultValue={spec.item?.name} /></Field>
          <Field label="Saldo devedor informado (R$)" hint="Atualize este saldo conforme seu contrato ou extrato."><input name="balance" inputMode="decimal" required placeholder="0,00" defaultValue={moneyInput(spec.item?.balance)} /></Field>
          <div className="form-grid"><Field label="Parcela prevista (R$), opcional"><input name="installment" inputMode="decimal" placeholder="0,00" defaultValue={moneyInput(spec.item?.installment)} /></Field><Field label="Próximo vencimento, opcional"><input name="dueDate" type="date" defaultValue={spec.item?.dueDate ?? ""} /></Field></div>
          <div className="form-grid"><Field label="Unidade dos juros"><select value={interestUnit} onChange={e => setInterestUnit(e.target.value as Debt["interestUnit"])}><option value="unknown">Não sei</option><option value="monthly">Ao mês</option><option value="annual">Ao ano</option></select></Field>{interestUnit !== "unknown" && <Field label="Taxa de juros (%)"><input name="interestRate" inputMode="decimal" required placeholder="Ex.: 2,5" defaultValue={spec.item?.interestRate ?? ""} /></Field>}</div>
          <Field label="Parcela no orçamento"><select value={linkMode} onChange={e => setLinkMode(e.target.value)}><option value="none">Não vincular agora</option><option value="existing">Vincular despesa já cadastrada</option><option value="new">Criar uma parcela prevista</option></select></Field>
          {linkMode === "existing" && <Field label="Lançamento da categoria Dívidas"><select name="transactionId" required defaultValue={spec.item?.transactionId ?? ""}><option value="">Selecione uma despesa</option>{state.transactions.filter(t => t.type === "expense" && t.category === "dividas").map(t => <option key={t.id} value={t.id}>{t.description} · {formatMoney(t.amount)} · {t.date.split("-").reverse().join("/")}</option>)}</select></Field>}
          {linkMode === "new" && <label className="checkbox"><input type="checkbox" name="confirmInstallment" required /><span>Confirmo criar uma única despesa prevista com o valor e o vencimento da parcela acima.</span></label>}
          <p className="fine-print">A parcela entra no orçamento uma vez. O saldo devedor não diminui automaticamente, pois a parcela pode incluir juros.</p>
        </>}
        {spec.kind === "profile" && <><p className="muted">Preencha o que souber. Você pode voltar aqui depois.</p><Field label="Como podemos chamar você?"><input autoFocus name="name" maxLength={80} placeholder="Seu primeiro nome" defaultValue={state.profile.name} /></Field><Field label="Sua renda costuma ser"><select name="incomeType" defaultValue={state.profile.incomeType}><option value="fixed">Fixa</option><option value="variable">Variável</option></select></Field><div className="form-grid"><Field label="Renda mensal prevista (R$)" hint="Em branco = não informado. Zero é permitido."><input name="expectedIncome" inputMode="decimal" placeholder="Opcional" defaultValue={moneyInput(state.profile.expectedIncome)} /></Field><Field label="Despesas essenciais estimadas (R$)"><input name="essentialExpenses" inputMode="decimal" placeholder="Opcional" defaultValue={moneyInput(state.profile.essentialExpenses)} /></Field></div><Field label="O que você quer organizar primeiro?"><input name="initialObjective" maxLength={200} placeholder="Ex.: entender meus gastos e começar uma reserva" defaultValue={state.profile.initialObjective} /></Field><div className="notice"><Info size={17} /> Essas estimativas não se tornam receitas ou despesas. Os valores realizados vêm dos lançamentos.</div></>}
        {spec.kind === "confirm" && <p>{spec.description}</p>}
        {error && <div className="notice error" role="alert">{error}</div>}
      </div>
      <div className="modal-foot"><button type="button" className="button secondary" onClick={close} disabled={pending}>Cancelar</button><button className={`button ${spec.kind === "confirm" && spec.destructive ? "danger" : "primary"}`} type="submit" disabled={pending}>{pending ? "Salvando…" : spec.kind === "confirm" ? "Confirmar" : "Salvar"}{!pending && <ArrowRight size={16} />}</button></div>
    </form>
  </dialog>;
}
