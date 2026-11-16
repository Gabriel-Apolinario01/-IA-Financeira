"use client";

import { useState, type FormEvent } from 'react';
import { comparePeriodicSpending, formatMoney, parseMoney } from '@/lib/finance';
import { Field } from './finance-dialog';

export function EducationalComparison({ recorded, month, hasRecords }: { recorded: number; month: string; hasRecords: boolean }) {
  const [monthly, setMonthly] = useState('100,00');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof comparePeriodicSpending> | null>(null);
  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setResult(comparePeriodicSpending({initial: parseMoney(String(form.get('initial'))), monthly: parseMoney(monthly), months: Number(form.get('months')), annualRate: String(form.get('rate'))}));
      setError('');
    } catch (reason) {setResult(null);setError(reason instanceof Error ? reason.message : 'Confira os valores.');}
  }
  const maximum = result ? Math.max(result.spent, result.contributed, result.balance, 1) : 1;
  return <section className="card educational-comparison" aria-labelledby="educational-heading">
    <span className="eyebrow">US13 · COMPARAÇÃO EDUCATIVA</span>
    <h2 id="educational-heading">Gasto hipotético ou aporte mensal</h2>
    <p>Compare um gasto mensal hipotético com apostas com a aplicação do mesmo valor. Não calculamos retornos de apostas.</p>
    <form onSubmit={calculate}>
      <div className="form-grid">
        <Field label="Gasto ou aporte mensal hipotético (R$)"><input required inputMode="decimal" value={monthly} onChange={e => {setMonthly(e.target.value);setSource('Valor editado manualmente.');}} /></Field>
        <Field label="Capital inicial hipotético (R$)"><input name="initial" required inputMode="decimal" defaultValue="0,00" /></Field>
        <Field label="Prazo da comparação (meses)"><input name="months" type="number" min="1" max="600" required defaultValue="12" /></Field>
        <Field label="Taxa anual efetiva da comparação (%)"><input name="rate" required inputMode="decimal" defaultValue="0" /></Field>
      </div>
      {hasRecords && <button className="button secondary" type="button" onClick={() => {setMonthly((recorded / 100).toFixed(2).replace('.',','));setSource(`Valor preenchido a seu pedido com consumo líquido categorizado em ${month.split('-').reverse().join('/')}. Pode ser editado.`);setResult(null);}}>Usar gastos registrados de {month.split('-').reverse().join('/')}</button>}
      {source && <p role="status">{source}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button primary" type="submit">Comparar cenário hipotético</button>
    </form>
    <div aria-live="polite">{result && <>
      <h3>Resultado do cenário calculado</h3>
      <dl className="number-list">
        <div><dt>Total hipotético gasto</dt><dd>{formatMoney(result.spent)}</dd></div>
        <div><dt>Total hipotético aportado, incluindo capital inicial</dt><dd>{formatMoney(result.contributed)}</dd></div>
        <div><dt>Montante hipotético projetado</dt><dd>{formatMoney(result.balance)}</dd></div>
        <div><dt>Rendimento / perda projetada (montante menos aportes)</dt><dd>{formatMoney(result.difference)}</dd></div>
      </dl>
      <figure className="comparison-strip" aria-label="Comparação dos totais hipotéticos">
        <figcaption>Comparação dos totais · valores em reais</figcaption>
        {[["Gasto hipotético",result.spent],["Aportes com capital inicial",result.contributed],["Montante projetado",result.balance]].map(([label,value]) => <div key={label}><span>{label} <strong>{formatMoney(Number(value))}</strong></span><div className="comparison-track"><i style={{width:`${Number(value)/maximum*100}%`}} /></div></div>)}
      </figure>
      <details><summary>Evolução mensal e valores exatos exibidos</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Mês</th><th>Gasto hipotético acumulado</th><th>Aportes com capital</th><th>Montante</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.month}><td>{row.month}</td><td>{formatMoney(result.monthly * row.month)}</td><td>{formatMoney(row.contributed)}</td><td>{formatMoney(row.balance)}</td></tr>)}</tbody></table></div></details>
    </>}</div>
    <p className="fine-print">Aportes no final de cada mês; taxa mensal equivalente a (1 + taxa anual)^(1/12) − 1. Precisão decimal, arredondamento de exibição para centavos com metade para cima. O capital inicial entra apenas no cenário de investimento, não no total gasto mensal.</p>
    <div className="notice"><p>Cenário hipotético, sem garantia de rentabilidade. Retornos podem variar e investimentos reais podem apresentar perdas. Impostos, taxas e inflação não estão incluídos. O gasto com apostas não equivale automaticamente ao prejuízo líquido efetivo e esta comparação não prevê ganhos em apostas. Simular não altera registros, saldo ou metas e não envia dados a serviços externos.</p></div>
  </section>;
}
