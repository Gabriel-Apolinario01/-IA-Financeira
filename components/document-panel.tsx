"use client";
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, type FinanceState, type Transaction } from '../lib/types';
import { formatMoney, isValidDate, parseMoney } from '../lib/finance';
import type { DocumentDraft } from '../lib/document-drafts';

const natures = { unidentified: 'Escolha a natureza', expense: 'Despesa', income: 'Receita', transfer: 'Transferência', invoice_payment: 'Pagamento de fatura', refund: 'Estorno' };
type Review = DocumentDraft & { value: string; note: string; selected: boolean };
type Result = { hash: string; pages: {method:'text'|'ocr'|'vision';text:string}[]; rows: DocumentDraft[] };
type Props = { state: FinanceState; pending: boolean; account: boolean; vision: boolean;
  send: (type: string, payload: Record<string, unknown>, id?: string) => Promise<FinanceState> };

function cents(value: string) {
  try { return parseMoney(value); } catch { return 0; }
}

export function DocumentPanel({ state, account, pending, send, vision }: Props) {
  const [consent,setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [images,setImages] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [rows, setRows] = useState<Review[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const commandId = useRef('');
  const locked = useRef(false);
  useEffect(() => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setUrl(preview); // eslint-disable-line react-hooks/set-state-in-effect -- release the file URL with its owner
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  function choose(input?: File) {
    setConsent(false);
    setImages([]);
    setNotice(''); setResult(null); setRows([]); setFile(null); setUrl('');
    if (!input) return;
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(input.type) || input.size > 5 * 1024 * 1024) {
      setNotice('Escolha JPEG, PNG, WebP ou PDF de até 5 MiB.'); return;
    }
    setFile(input);
  }
  async function previewPdf() {
    if (!file || locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/document',{method:'POST',headers:{'Content-Type':'application/pdf','x-document-action':'preview'},body:file,signal:AbortSignal.timeout(65_000)});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Falha ao visualizar PDF.');
      setImages(data.images);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Falha ao visualizar PDF.'); }
    finally { locked.current=false; setBusy(false); }
  }
  async function extract() {
    if (!file || locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    setConsent(false);
    try {
      const response = await fetch('/api/document', { method: 'POST', headers: { 'Content-Type': file.type, ...(consent && vision ? {'x-document-vision-consent':'once'} : {}) },
        body: file, signal: AbortSignal.timeout(65_000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Falha ao ler o documento.');
      const preview = data as Result;
      setResult(preview); setRows(preview.rows.map(r => ({ ...r, value: r.amount ? formatMoney(r.amount) : '', note: '', selected: false })));
      commandId.current = crypto.randomUUID();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Falha ao ler o documento.'); }
    finally { setBusy(false); locked.current = false; }
  }
  function update(line: number, edit: Partial<Review>) {
    commandId.current = crypto.randomUUID();
    setRows(current => current.map(row => row.line === line ? { ...row, ...edit } : row));
  }
  const duplicate = (r: Review) => state.transactions.some(t => t.id === 'doc_' + result?.hash + '_' + r.line);
  const ready = (r: Review) => !duplicate(r) && Boolean(r.description.trim()) && isValidDate(r.date)
    && cents(r.value) > 0 && r.nature !== 'unidentified';
  const selected = rows.filter(r => ready(r) && r.selected);
  async function confirm() {
    if (!result || !selected.length || locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try {
      await send('document.confirm', { hash: result.hash, rows: selected.map(r => ({
        line: r.line, description: r.description, date: r.date, amount: cents(r.value), category: r.category, nature: r.nature,
        type: r.nature === 'income' || r.nature === 'expense' ? r.nature : r.direction, status: r.status, note: r.note,
      })) }, commandId.current);
      setNotice(selected.length + ' lançamento(s) adicionado(s). Consulte o mês da data confirmada.');
      setRows(old => old.map(r => ({ ...r, selected: false }))); commandId.current = crypto.randomUUID();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setBusy(false); locked.current = false; }
  }
  return <section className="card document-panel">
    <button className="button secondary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Adicionar por foto ou PDF</button>
    {open && (account ? <fieldset disabled={busy || pending}>
      <p>A leitura ocorre no servidor da IA Financeira. A imagem fica em memória. Você confere os campos antes de gravar.</p>
      <div className="document-fields">
        <label>Selecionar foto ou PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => choose(e.target.files?.[0])}/></label>
        <label>Fotografar uma conta<input type="file" accept="image/*" capture="environment" onChange={e => choose(e.target.files?.[0])}/></label>
      </div>
      {file && url && <><p>{file.name}</p>{file.type === 'application/pdf' ? <>
        <button type="button" className="button secondary" onClick={previewPdf}>Visualizar PDF</button>
        {images.map((data,i)=><Image key={i} unoptimized src={'data:image/jpeg;base64,'+data} alt={'Página '+(i+1)+' do documento'} width={800} height={1000}/>)}</> :
        <Image unoptimized src={url} alt="Documento selecionado para revisão" width={600} height={400}/>}
        {vision && file.type.startsWith('image/') && <label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Autorizar o envio desta imagem à Groq uma vez para transcrição. Deixe desmarcado para usar OCR local.</label>}
        <button type="button" className="button secondary" onClick={extract}>Extrair dados</button></>}
      {result && <><details><summary>Texto lido do documento</summary>{result.pages.map((p,i) =>
        <section key={i}><b>Página {i+1} · {p.method === 'text' ? 'Texto digital' : p.method === 'vision' ? 'Visão da Groq' : 'OCR'}</b><pre>{p.text || 'Nenhum texto legível.'}</pre></section>)}</details>
        {rows.map(r => <fieldset key={r.line} className="document-review">
          <legend>Página {r.page} · {r.kind} · Lançamento {r.line}</legend>
          {r.issuer && <p>Emissor ou favorecido: {r.issuer}</p>}
          <p>Vencimento: {r.dueDate || 'não identificado'} · Pagamento: {r.paidDate || 'sem data comprovada'}</p>
          {r.warnings.map(w => <p className="fine-print" key={w}>{w}</p>)}
          <div className="document-fields">
            <label>Descrição<input value={r.description} maxLength={160} onChange={e => update(r.line,{description:e.target.value})}/></label>
            <label>Data do lançamento<input type="date" value={r.date} onChange={e => update(r.line,{date:e.target.value})}/></label>
            <label>Valor em reais<input inputMode="decimal" value={r.value} onChange={e => update(r.line,{value:e.target.value})}/></label>
            <label>Categoria<select value={r.category} onChange={e => update(r.line,{category:e.target.value})}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>Natureza<select value={r.nature} onChange={e => update(r.line,{nature:e.target.value as Review['nature']})}>{Object.entries(natures).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
            {!['expense','income'].includes(r.nature) && <label>Direção<select value={r.direction} onChange={e => update(r.line,{direction:e.target.value as Transaction['type']})}><option value="expense">Saída</option><option value="income">Entrada</option></select></label>}
            <label>Situação<select value={r.status} onChange={e => update(r.line,{status:e.target.value as Transaction['status']})}><option value="planned">Previsto</option><option value="realized">Realizado</option></select></label>
            <label>Observações<input maxLength={300} value={r.note} onChange={e => update(r.line,{note:e.target.value})}/></label>
          </div>
          {duplicate(r) ? <p>Já adicionado a partir deste documento.</p> : <>
            {state.transactions.some(t => t.date === r.date && t.amount === cents(r.value)) && <p className="notice warning">Já existe um lançamento com esta data e valor. Confira antes de selecionar.</p>}
            <label className="checkbox"><input type="checkbox" checked={r.selected && ready(r)} disabled={!ready(r)} onChange={e => update(r.line,{selected:e.target.checked})}/>Selecionar lançamento {r.line}</label></>}
        </fieldset>)}
        <button className="button primary" disabled={!selected.length} onClick={confirm}>Confirmar e adicionar ({selected.length})</button></>}
    </fieldset> : <p>Entre na sua conta para usar a leitura de documentos. <a className="text-link" href="/login">Entrar</a></p>)}
    <p aria-live="polite">{busy ? 'Processando…' : notice}</p>
  </section>;
}
