"use client";
import { useState } from 'react';
import { CATEGORIES, type FinanceState, type TransactionNature } from '@/lib/types';
import { IMPORT_LIMIT, parseImport, possibleMatches, confirmedImportRows } from '@/lib/imports';
import { formatMoney } from '@/lib/finance';
type Review = { nature: TransactionNature; description: string; category: string; refundOf?: string };
const labels: Record<TransactionNature,string> = { income:'Receita', expense:'Despesa', transfer:'Transferência entre contas próprias', invoice_payment:'Pagamento de fatura', refund:'Estorno', unidentified:'Não identificado — revisar' };

export function ImportPanel({ state, send, pending }: { state: FinanceState; send: (type: string, payload: Record<string, unknown>) => Promise<FinanceState>; pending: boolean }) {
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [locale, setLocale] = useState<'br' | 'us'>('br');
  const [account, setAccount] = useState('');
  const [accepted, setAccepted] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [reviews, setReviews] = useState<Record<number,Review>>({});
  let parsed: ReturnType<typeof parseImport> | undefined; let parseError = '';
  if (file) { try { parsed = parseImport(file.name, file.content, locale); } catch (e) { parseError = (e as Error).message; } }
  async function load(upload?: File) {
    if (!upload || reading || pending) return;
    setReading(true); setFile(null); setAccepted([]); setReviews({}); setMessage('');
    try {
      if (upload.size > IMPORT_LIMIT) throw new Error('O limite é 100 KB por arquivo.');
      if (upload.type && !['text/csv', 'text/tab-separated-values', 'text/plain', 'application/x-ofx', 'application/vnd.intu.qfx', 'application/octet-stream', 'application/vnd.ms-excel'].includes(upload.type)) throw new Error('Tipo de arquivo incompatível.');
      const bytes = await upload.arrayBuffer(); let content: string;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { content = new TextDecoder('windows-1252').decode(bytes); }
      setFile({ name: upload.name, content });
    } catch (e) { setMessage((e as Error).message); }
    finally { setReading(false); }
  }
  async function commit() {
    if (!file) return;
    try {
      const natures = Object.fromEntries(accepted.map(line => [line,reviews[line]?.nature ?? 'unidentified']));
      const edits = Object.fromEntries(accepted.map(line => { const { description,category,refundOf } = reviews[line]; return [line,{description,category,...(refundOf ? {refundOf} : {})}]; }));
      const next = await send('import.commit', { ...file, account: account.trim(), locale, accepted, natures, edits });
      const batch = next.importBatches!.at(-1)!;
      setMessage(`${batch.transactions.length} importados; ${batch.duplicates} duplicados exatos; ${batch.ignored} ignorados; ${batch.errors} com erro.`);
      setFile(null); setAccepted([]);
    } catch (e) { setMessage((e as Error).message); }
  }
  async function change(type: string, id: string) {
    try { await send(type, { id }); setMessage(type === 'import.revert' ? 'Lote desfeito. A origem foi preservada.' : 'Lote restaurado.'); }
    catch (e) { setMessage((e as Error).message); }
  }
  return <section className="card import-panel">
    <h2>Importar extrato</h2>
    <p>CSV, TSV ou OFX em reais · até 100 KB e 300 linhas. Confira cada lançamento antes de confirmar.</p>
    <p className="fine-print">CSV: cabeçalhos data, descricao, valor. O sinal informa entrada ou saída de caixa. Classifique cada linha selecionada: transferência e pagamento de fatura não geram novo consumo. Para faturas, verifique se as compras estão registradas; o aplicativo não comprova isso.</p>
    <div className="import-controls">
      <label>Apelido da conta<input value={account} maxLength={60} onChange={e => setAccount(e.target.value)} placeholder="Ex.: Conta principal" disabled={pending} /></label>
      <label>Formato numérico do CSV<select value={locale} disabled={pending} onChange={e => { setLocale(e.target.value as 'br' | 'us'); setAccepted([]); setReviews({}); }}><option value="br">Brasil: 1.234,56</option><option value="us">Internacional: 1,234.56</option></select></label>
    </div>
    <div className="import-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}>
      <label>Arraste um arquivo ou selecione<input type="file" accept=".csv,.tsv,.ofx" disabled={pending || reading} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
    {message && <p role="status" className="notice">{message}</p>}
    {parseError && <p role="alert" className="notice warning">{parseError}</p>}
    {parsed && <><h3>Prévia: {file?.name}</h3><p>Nenhuma linha é selecionada automaticamente. Valores e datas próximos são apenas candidatos à revisão. Use sempre o mesmo apelido para a mesma conta.</p>
      <div className="import-table"><table><thead><tr><th>Confirmar</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Revisão</th></tr></thead><tbody>{parsed.rows.map(row => {
        const matches = possibleMatches(row, state.transactions);
        const review = reviews[row.line] ?? { nature:'unidentified', description:row.description, category:'outros' };
        const update = (patch: Partial<Review>) => setReviews(previous => ({...previous,[row.line]:{...review,...patch}}));
        return <tr key={row.line}><td><input aria-label={`Confirmar linha ${row.line}`} type="checkbox" disabled={pending || !!row.error} checked={accepted.includes(row.line)} onChange={e => setAccepted(e.target.checked ? [...accepted, row.line] : accepted.filter(n => n !== row.line))} /></td><td>{row.date}</td><td><input aria-label={`Descrição linha ${row.line}`} disabled={pending || !!row.error} maxLength={160} value={review.description} onChange={e=>update({description:e.target.value})}/></td><td>{row.error ? '—' : <>{formatMoney(row.amount)}<br/>{row.amount<0?'Saída de caixa':'Entrada de caixa'}</>}</td><td>
          <label>Natureza<select aria-label={`Natureza linha ${row.line}`} disabled={pending || !!row.error} value={review.nature} onChange={e=>update({nature:e.target.value as TransactionNature,refundOf:undefined})}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Categoria<select aria-label={`Categoria linha ${row.line}`} disabled={pending || !!row.error} value={review.category} onChange={e=>update({category:e.target.value})}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          {review.nature==='refund' && <label>Lançamento original<select aria-label={`Original linha ${row.line}`} value={review.refundOf ?? ''} onChange={e=>update({refundOf:e.target.value})} disabled={pending}><option value="">Selecione um vínculo confirmado</option>{state.transactions.filter(t=>['income','expense'].includes(t.nature ?? t.type) && t.status==='realized' && t.date.slice(0,7)===row.date.slice(0,7) && t.type !== (row.amount<0?'expense':'income') && t.date<=row.date).map(t=><option key={t.id} value={t.id}>{t.description} · {formatMoney(t.amount)}</option>)}</select></label>}
          <p>{row.error || (review.nature==='unidentified'?'Movimentação precisa de revisão.':review.nature==='transfer'||review.nature==='invoice_payment'?'Somente fluxo de caixa; não altera o consumo.':review.nature==='refund'?'Compensa o original confirmado no mesmo mês. Categoria do original prevalece.':'Afeta o orçamento após confirmação.')}</p>
          {!!matches.length && <p>Possível duplicação: {matches.length} lançamento(s) próximos. Confira antes de selecionar.</p>}
        </td></tr>;
      })}</tbody></table></div>
      <button className="button primary" disabled={pending || !account.trim() || !accepted.length || accepted.some(line=>!reviews[line] || reviews[line].nature==='unidentified' || !reviews[line].description.trim() || (reviews[line].nature==='refund' && !reviews[line].refundOf))} onClick={() => void commit()}>{pending ? 'Salvando…' : `Confirmar ${accepted.length} linhas`}</button> <button className="button secondary" disabled={pending} onClick={() => { setFile(null); setAccepted([]); }}>Cancelar</button>
    </>}
    <h3>Histórico e origem dos lançamentos</h3>
    {!(state.importBatches?.length) && <p>Nenhum arquivo importado.</p>}
    {state.importBatches?.slice().reverse().map(batch => <details key={batch.id}><summary>{batch.name} · {batch.account} · {batch.transactions.length} lançamentos · {batch.status === 'confirmed' ? 'Confirmado' : 'Desfeito'}</summary>
      <p>{batch.duplicates} duplicados; {batch.ignored} ignorados; {batch.errors} erros. Origem: {batch.source.toUpperCase()} · BRL · America/Sao_Paulo</p><p className="import-hash">SHA-256: {batch.hash}</p>
      <ul>{confirmedImportRows(batch).map(row => <li key={row.line}>Linha {row.line}: {row.date} · {row.description} · {formatMoney(row.amount)}</li>)}</ul>
      <ul>{batch.transactions.map(t=><li key={t.id}>{t.description} · {t.nature ? labels[t.nature] : 'Classificação legada'} · {CATEGORIES.find(c=>c.id===t.category)?.label}</li>)}</ul>
      <p>{batch.audit.map(a => `${a.at}: ${a.action === 'confirmed' ? 'confirmado' : 'desfeito'}`).join(' / ')}</p>
      <button className="button secondary" disabled={pending} onClick={() => void change(batch.status === 'confirmed' ? 'import.revert' : 'import.restore', batch.id)}>{batch.status === 'confirmed' ? 'Desfazer lote' : 'Restaurar lote'}</button>
    </details>)}
    <p className="fine-print">Pendente de implementação/configuração: Open Finance, PDF/OCR, notas fiscais, Gmail, XLSX e conciliação entre fontes. Nenhuma conexão bancária é necessária para importar CSV/OFX.</p>
  </section>;
}
