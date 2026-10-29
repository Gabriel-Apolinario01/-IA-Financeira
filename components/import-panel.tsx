"use client";
import { useState } from 'react';
import type { FinanceState } from '@/lib/types';
import { IMPORT_LIMIT, parseImport, possibleMatches } from '@/lib/imports';
import { formatMoney } from '@/lib/finance';

export function ImportPanel({ state, send, pending }: { state: FinanceState; send: (type: string, payload: Record<string, unknown>) => Promise<FinanceState>; pending: boolean }) {
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [locale, setLocale] = useState<'br' | 'us'>('br');
  const [account, setAccount] = useState('');
  const [accepted, setAccepted] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  let parsed: ReturnType<typeof parseImport> | undefined; let parseError = '';
  if (file) { try { parsed = parseImport(file.name, file.content, locale); } catch (e) { parseError = (e as Error).message; } }
  async function load(upload?: File) {
    if (!upload || reading || pending) return;
    setReading(true); setFile(null); setAccepted([]); setMessage('');
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
      const next = await send('import.commit', { ...file, account: account.trim(), locale, accepted });
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
    <p className="fine-print">CSV: cabeçalhos data, descricao, valor. Data AAAA-MM-DD ou DD/MM/AAAA; negativo é despesa, positivo é receita. Exclua da seleção transferências entre suas contas, pagamentos de fatura e totais de compras parceladas. A conciliação desses casos ainda está pendente.</p>
    <div className="import-controls">
      <label>Apelido da conta<input value={account} maxLength={60} onChange={e => setAccount(e.target.value)} placeholder="Ex.: Conta principal" disabled={pending} /></label>
      <label>Formato numérico do CSV<select value={locale} disabled={pending} onChange={e => { setLocale(e.target.value as 'br' | 'us'); setAccepted([]); }}><option value="br">Brasil: 1.234,56</option><option value="us">Internacional: 1,234.56</option></select></label>
    </div>
    <div className="import-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}>
      <label>Arraste um arquivo ou selecione<input type="file" accept=".csv,.tsv,.ofx" disabled={pending || reading} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
    {message && <p role="status" className="notice">{message}</p>}
    {parseError && <p role="alert" className="notice warning">{parseError}</p>}
    {parsed && <><h3>Prévia: {file?.name}</h3><p>Nenhuma linha é selecionada automaticamente. Valores e datas próximos são apenas candidatos à revisão. Use sempre o mesmo apelido para a mesma conta.</p>
      <div className="import-table"><table><thead><tr><th>Confirmar</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Revisão</th></tr></thead><tbody>{parsed.rows.map(row => {
        const matches = possibleMatches(row, state.transactions);
        return <tr key={row.line}><td><input aria-label={`Confirmar linha ${row.line}`} type="checkbox" disabled={pending || !!row.error} checked={accepted.includes(row.line)} onChange={e => setAccepted(e.target.checked ? [...accepted, row.line] : accepted.filter(n => n !== row.line))} /></td><td>{row.date}</td><td>{row.description}</td><td>{row.error ? '—' : formatMoney(row.amount)}</td><td>{row.error || (matches.length ? `Revisar: ${matches.length} lançamento(s) com mesmo valor e tipo em até 3 dias. ${matches.map(t => t.description).join('; ')}` : 'Confira descrição, valor e natureza.')}</td></tr>;
      })}</tbody></table></div>
      <button className="button primary" disabled={pending || !account.trim() || !accepted.length} onClick={() => void commit()}>{pending ? 'Salvando…' : `Confirmar ${accepted.length} linhas`}</button> <button className="button secondary" disabled={pending} onClick={() => { setFile(null); setAccepted([]); }}>Cancelar</button>
    </>}
    <h3>Histórico e origem dos lançamentos</h3>
    {!(state.importBatches?.length) && <p>Nenhum arquivo importado.</p>}
    {state.importBatches?.slice().reverse().map(batch => <details key={batch.id}><summary>{batch.name} · {batch.account} · {batch.transactions.length} lançamentos · {batch.status === 'confirmed' ? 'Confirmado' : 'Desfeito'}</summary>
      <p>{batch.duplicates} duplicados; {batch.ignored} ignorados; {batch.errors} erros. Origem: {batch.source.toUpperCase()} · BRL · America/Sao_Paulo</p><p className="import-hash">SHA-256: {batch.hash}</p>
      <ul>{batch.rows.map(row => <li key={row.line}>Linha {row.line}: {row.date} · {row.description} · {row.error || formatMoney(row.amount)}</li>)}</ul>
      <p>{batch.audit.map(a => `${a.at}: ${a.action === 'confirmed' ? 'confirmado' : 'desfeito'}`).join(' / ')}</p>
      <button className="button secondary" disabled={pending} onClick={() => void change(batch.status === 'confirmed' ? 'import.revert' : 'import.restore', batch.id)}>{batch.status === 'confirmed' ? 'Desfazer lote' : 'Restaurar lote'}</button>
    </details>)}
    <p className="fine-print">Pendente de implementação/configuração: Open Finance, PDF/OCR, notas fiscais, Gmail, XLSX e conciliação entre fontes. Nenhuma conexão bancária é necessária para importar CSV/OFX.</p>
  </section>;
}
