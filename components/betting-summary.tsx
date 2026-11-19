import { bettingSummary, formatMoney } from '@/lib/finance';
import type { FinanceState } from '@/lib/types';
import { formatPercent } from './income-commitment';

export function BettingSummary({ state, month, onCompare }: { state: FinanceState; month: string; onCompare: () => void }) {
  const current = bettingSummary(state, month);
  const date = new Date(`${month}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const previousMonth = date.toISOString().slice(0,7);
  const previous = Number(previousMonth.slice(0,4)) >= 1900 ? bettingSummary(state, previousMonth) : null;
  return <section className="card finance-indicator" aria-labelledby="betting-heading">
    <h2 id="betting-heading">Gastos registrados com apostas</h2>
    <p className="caption">Registro opcional · {month.split('-').reverse().join('/')}</p>
    {current.records > 0 ? <p><strong>{formatMoney(current.amount)}</strong> de consumo líquido reconhecido · {current.share === null ? 'Participação indisponível sem consumo positivo' : `${formatPercent(current.share)} das despesas reconhecidas`}. Já incluído no total de consumo.</p> : <p>Sem despesas realizadas identificadas nesta categoria no período. Isso não comprova inexistência de gastos.</p>}
    {current.pending > 0 && <p>Previsto, separado do realizado: {formatMoney(current.pending)}.</p>}
    {previous && <p>Mês anterior ({previousMonth.split('-').reverse().join('/')}): {previous.records ? formatMoney(previous.amount) : 'sem registros nesta categoria'}.</p>}
    <p className="fine-print">A categoria é escolhida por você no lançamento ou na revisão do extrato. Estornos vinculados reduzem o consumo original. Os registros não permitem inferir ganhos, perdas líquidas ou condições de saúde.</p>
    <button className="button secondary" onClick={onCompare}>Abrir comparação educativa</button>
  </section>;
}
