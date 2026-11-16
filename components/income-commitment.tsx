import { formatMoney, type monthMetrics } from '@/lib/finance';

export const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function IncomeCommitment({ metrics, month }: { metrics: ReturnType<typeof monthMetrics>; month: string }) {
  const value = metrics.commitment;
  const projected = metrics.projectedCommitment;
  return <section className="card finance-indicator" aria-labelledby="income-commitment-heading">
    <h2 id="income-commitment-heading">Comprometimento da renda</h2>
    <p className="caption">Período: {month.split('-').reverse().join('/')} · Realizado</p>
    <h3>{value.percent !== null ? formatPercent(value.percent) : value.status === 'zero' ? 'Renda reconhecida igual a zero' : 'Renda não informada para o período'}</h3>
    {value.percent !== null && <div className="progress-track" role="progressbar" aria-label="Comprometimento realizado" aria-valuemin={0} aria-valuemax={Math.max(100, value.percent)} aria-valuenow={value.percent} aria-valuetext={formatPercent(value.percent)}><span style={{ width: `${Math.min(100, Math.max(0, value.percent))}%` }} /></div>}
    <p>Renda reconhecida: {formatMoney(value.income)} · Consumo líquido: {formatMoney(value.expenses)}</p>
    <p className="fine-print">Consumo reconhecido ÷ renda reconhecida × 100. Transferências e pagamentos de fatura não são novo consumo; estornos vinculados compensam o lançamento original. O percentual pode superar 100%.</p>
    {value.status === 'zero' && <p>Não há percentual calculável com renda zero. Esta posição vem dos registros e da confirmação de ausência de receita; não comprova ausência de renda fora do aplicativo.</p>}
    {value.status === 'unknown' && <p>Ausência de receita cadastrada não comprova renda zero.</p>}
    {(metrics.pendingIncome > 0 || metrics.pendingExpenses > 0) && <p>Previsto com pendências: {projected.percent === null ? 'percentual indisponível sem renda prevista positiva' : formatPercent(projected.percent)}. Renda: {formatMoney(projected.income)}; consumo: {formatMoney(projected.expenses)}. Inclui realizados e registros planejados deste mês; não é garantia de recebimento nem agenda completa de obrigações.</p>}
  </section>;
}
