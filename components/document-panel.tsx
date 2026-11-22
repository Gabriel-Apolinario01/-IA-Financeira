"use client";
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, type FinanceState, type Transaction } from '../lib/types';
import { formatMoney } from '../lib/finance';
import type { DocumentDraft } from '../lib/document-drafts';

const natures = { unidentified: 'Escolha a natureza', expense: 'Despesa', income: 'Receita', transfer: 'Transferência', invoice_payment: 'Pagamento de fatura', refund: 'Estorno' };
import { cents, comparePage, confirmedRows, editReview, eligible, selectReviews, startReview, startReviews, type Review } from '../lib/document-review';
type Offer = { page: number; token: string };
import type { InterpretationMetadata, TextSuggestion } from '../lib/document-interpretation';
type Comparison = { page: number; text: string; rows: DocumentDraft[] };
type Result = { textAvailable: boolean; hash: string; pages: {method:'text'|'ocr'|'mixed';text:string;nativeText?:string;layoutOmitted?:boolean}[]; rows: DocumentDraft[]; offers: Offer[] };
type Props = { state: FinanceState; pending: boolean; file: File; vision: boolean; busy: boolean; setBusy: (busy: boolean) => void;
  send: (type: string, payload: Record<string, unknown>, id?: string) => Promise<FinanceState> };

export function DocumentPanel({ state, file, pending, send, vision, busy, setBusy }: Props) {
  const [comparisons,setComparisons] = useState<Comparison[]>([]);
  const [metadata,setMetadata] = useState<Record<number,InterpretationMetadata|undefined>>({});
  const [proposals,setProposals] = useState<Record<number,TextSuggestion[]>>({});
  const [images,setImages] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [rows, setRows] = useState<Review[]>([]);
  const [notice, setNotice] = useState('');
  const commandId = useRef('');
  const locked = useRef(false);
  useEffect(() => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setUrl(preview); // eslint-disable-line react-hooks/set-state-in-effect -- release the file URL with its owner
    return () => URL.revokeObjectURL(preview);
  }, [file]);
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
    try {
      const response = await fetch('/api/document', { method: 'POST', headers: { 'Content-Type': file.type },
        body: file, signal: AbortSignal.timeout(65_000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Falha ao ler o documento.');
      const preview = data as Result;
      setResult(preview);
      if (result?.hash !== preview.hash) {
        setRows(startReviews(preview.rows));
        commandId.current = crypto.randomUUID();
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Falha ao ler o documento.'); }
    finally { setBusy(false); locked.current = false; }
  }
  async function interpret(page: number) {
    if (!result || locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/document',{method:'POST',body:file,signal:AbortSignal.timeout(65_000),headers:{
        'Content-Type':file.type,'x-document-action':'interpret','x-document-text-consent':'once','x-document-page':String(page),
      }});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Interpretação indisponível.');
      setMetadata(previous => ({...previous,[page]:data.metadata}));
      setProposals(previous => ({...previous,[page]:data.suggestions}));
      const suggestions: TextSuggestion[] = data.suggestions;
      const original = result.rows.filter(r => r.page === page);
      setRows(current => current.map(r => {
        if (r.page !== page) return r;
        const local = original.find(o => o.line === r.line);
        const matches = suggestions.filter(p => p.description === local?.description && p.date === local.date && p.amount === local.amount);
        if (local && matches.length === 1 && matches[0].nature === local.nature && matches[0].status === local.status && matches[0].direction === local.direction) return r;
        return {...r,conflict:true,reviewed:false,selected:false};
      }));
      commandId.current = crypto.randomUUID();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'A leitura local continua disponível.'); }
    finally {locked.current=false;setBusy(false);}
  }
  function alreadyRepresented(page:number, proposal:TextSuggestion) {
    const same = (description:string,date:string,amount:number|null) => description === proposal.description && date === proposal.date && amount === proposal.amount;
    return rows.some(r => r.page === page && same(r.description,r.date,cents(r.value)))
      || result?.rows.some(r => r.page === page && same(r.description,r.date,r.amount))
      || state.transactions.some(t => t.id.startsWith('doc_'+result?.hash+'_') && same(t.description,t.date,t.amount));
  }
  function adopt(page:number, proposal:TextSuggestion, target:number) {
    if (!result || !target) return;
    const existing = rows.find(r => r.line === target);
    const line = target === -1 ? 41 + (page-1)*16000 + proposal.offset : target;
    if ((target === -1 && alreadyRepresented(page,proposal)) || blocked.has(line) || (!existing && (rows.length >= 40 || rows.some(r => r.line === line)))) return;
    const base = existing ?? startReview({line,page,kind:'Sugestão da IA',issuer:'',description:'',amount:null,currency:null,
      date:'',dueDate:'',paidDate:'',category:'outros',nature:'unidentified',direction:'expense',status:'planned',warnings:[],ambiguities:[]});
    const updated: Review = {...base,description:proposal.description,value:proposal.amount ? formatMoney(proposal.amount) : '',
      date:proposal.date,nature:proposal.nature ?? 'unidentified',direction:proposal.direction ?? '',
      status:proposal.status ?? '',conflict:true,reviewed:false,selected:false};
    commandId.current = crypto.randomUUID();
    setRows(current => existing ? current.map(r => r.line === line ? updated : r) : [...current,updated]);
  }
  async function compare(offer: Offer) {
    if (!file || !vision || locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    setResult(current => current && ({...current,offers:current.offers.filter(item => item.token !== offer.token)}));
    try {
      const response = await fetch('/api/document', { method:'POST', headers:{
        'Content-Type':file.type,'x-document-vision-consent':'once','x-document-offer':offer.token,
      },body:file,signal:AbortSignal.timeout(65_000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Groq indisponível. Continue com a leitura local.');
      if (result) setRows(current => comparePage(current,result.rows,offer.page,data.rows));
      commandId.current = crypto.randomUUID();
      setComparisons(previous => [...previous.filter(item => item.page !== offer.page),data]);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Groq indisponível. Continue com a leitura local.'); }
    finally { locked.current=false; setBusy(false); }
  }
  function update(line: number, edit: Partial<Review>) {
    commandId.current = crypto.randomUUID();
    setRows(current => current.map(row => row.line === line ? editReview(row,edit,blocked) : row));
  }
  const blocked = new Set(rows.filter(r => state.transactions.some(t => t.id === 'doc_' + result?.hash + '_' + r.line)).map(r => r.line));
  const ready = (r: Review) => eligible(r,blocked);
  const selected = confirmedRows(rows,blocked);
  const needsReview = rows.filter(r => !blocked.has(r.line) && !ready(r)).length;
  function selectAll(select: boolean) {
    commandId.current = crypto.randomUUID();
    setRows(current => selectReviews(current,select,blocked));
  }
  async function confirm() {
    if (!result || !selected.length || locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try {
      await send('document.confirm', { hash: result.hash, rows: selected }, commandId.current);
      setNotice(selected.length + ' lançamento(s) adicionado(s). Consulte o mês da data confirmada.');
      setRows(old => old.map(r => ({ ...r, selected: false }))); commandId.current = crypto.randomUUID();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setBusy(false); locked.current = false; }
  }
  return <section className="document-panel" aria-label="Revisão do documento">
    <fieldset disabled={busy || pending}>
      <p>Confira os campos extraídos antes de adicionar o lançamento.</p>
      {file && url && <><p>{file.name}</p>{file.type === 'application/pdf' ? <>
        <button type="button" className="button secondary" onClick={previewPdf}>Visualizar PDF</button>
        {images.map((data,i)=><Image key={i} unoptimized src={'data:image/jpeg;base64,'+data} alt={'Página '+(i+1)+' do documento'} width={800} height={1000}/>)}</> :
        <Image unoptimized src={url} alt="Documento selecionado para revisão" width={600} height={400}/>}
        <button type="button" className="button secondary" data-tour="document-extract" onClick={extract}>Extrair dados</button></>}
      {result && <><details><summary>Texto lido do documento</summary>{result.pages.map((p,i) =>
        <section key={i}><b>Página {i+1} · {p.method === 'text' ? 'Texto digital' : p.method === 'mixed' ? 'OCR de página mista' : 'OCR'}</b><pre>{p.text || 'Nenhum texto legível.'}</pre>{p.nativeText && <><b>Camada de texto digital</b><pre>{p.nativeText}</pre></>}{p.layoutOmitted && <p>Coordenadas omitidas pelo limite de tamanho.</p>}</section>)}</details>
        {result.textAvailable && <details><summary>Melhorar interpretação com IA</summary>
          <p>A Groq receberá a transcrição integral da página escolhida, que pode conter dados pessoais e financeiros. Cada botão autoriza um envio de texto.</p>
          {result.pages.map((_,i) => <button key={i} type="button" className="button secondary" onClick={() => interpret(i+1)}>Autorizar envio do texto da página {i+1} à Groq</button>)}
        </details>}
        {Object.entries(proposals).map(([p,list]) => <section key={p}><h3>Sugestões da IA · Página {p}</h3>
          {metadata[Number(p)] && <p>{[metadata[Number(p)]?.documentType,metadata[Number(p)]?.issuer,metadata[Number(p)]?.period].filter(Boolean).join(' · ')}</p>}
          {metadata[Number(p)]?.informational.map((value,i) => <p key={i}>Informativo · {value}</p>)}
          {!list.length && <p>Nenhuma movimentação sugerida nesta página.</p>}
          {list.map(item => <div key={item.offset}><pre>{item.sourceText}</pre><p>{item.description} · {item.amount ? formatMoney(item.amount) : 'Valor incerto'} · {item.date || 'Data incerta'}</p>
            <label>Adotar sugestão<select value="" onChange={e => adopt(Number(p),item,Number(e.target.value))}>
              <option value="">Escolha onde aplicar</option>
              {rows.filter(r => r.page === Number(p) && !blocked.has(r.line)).map(r => <option key={r.line} value={r.line}>Substituir campos do lançamento {r.line}</option>)}
              {rows.length < 40 && !alreadyRepresented(Number(p),item) && !rows.some(r => r.line === 41+(Number(p)-1)*16000+item.offset) && <option value="-1">Criar linha para revisão</option>}
            </select></label></div>)}
        </section>)}
        {vision && result.offers.map(offer => <p key={offer.token}>
          <button type="button" className="button secondary" onClick={() => compare(offer)}>
            Autorizar envio da imagem da página {offer.page} à Groq para uma segunda leitura
          </button>
        </p>)}
        {comparisons.map(c => <section key={c.page} aria-label={'Comparação da página '+c.page}>
          <h3>Comparação da página {c.page}</h3>
          <h4>Leitura local original</h4>
          {result.rows.filter(r => r.page === c.page).map(r => <p key={r.line}>{r.description} · {r.amount ? formatMoney(r.amount) : 'Valor incerto'} · Data {r.date || 'incerta'}</p>)}
          <h4>Segunda leitura da Groq</h4>
          {c.rows.map(row => <p key={row.line}>{row.description} · {row.amount ? formatMoney(row.amount) : 'Valor incerto'} · Data {row.date || 'incerta'} · Vencimento {row.dueDate || 'incerto'}</p>)}
          <details><summary>Comparar as transcrições</summary><b>Leitura local</b><pre>{result.pages[c.page-1].text}</pre><b>Groq</b><pre>{c.text}</pre></details>
          <p>Confira o documento e edite abaixo os campos que deseja usar.</p>
        </section>)}
        {rows.map(r => <fieldset key={r.line} className="document-review">
          <legend>Página {r.page} · {r.kind} · Lançamento {r.line}</legend>
          {r.issuer && <p>Emissor ou favorecido: {r.issuer}</p>}
          <p>Vencimento: {r.dueDate || 'não identificado'} · Pagamento: {r.paidDate || 'sem data comprovada'}</p>
          {result.pages[r.page-1].method !== 'text' && <p className="fine-print">O OCR pode trocar dígitos mesmo quando a data e o valor parecem válidos. Confira o original.</p>}
          {r.conflict && <p className="notice warning">Confira as diferenças ou sugestões desta página no documento original.</p>}
          {r.warnings.map(w => <p className="fine-print" key={w}>{w}</p>)}
          {r.ambiguities.map(w => <p className="fine-print" key={w}>{w}</p>)}
          <div className="document-fields" data-tour="document-fields">
            <label>Descrição<input value={r.description} maxLength={160} onChange={e => update(r.line,{description:e.target.value})}/></label>
            <label>Data do lançamento<input type="date" value={r.date} onChange={e => update(r.line,{date:e.target.value})}/></label>
            <label>Valor em reais<input inputMode="decimal" value={r.value} onChange={e => update(r.line,{value:e.target.value})}/></label>
            <label>Categoria<select value={r.category} onChange={e => update(r.line,{category:e.target.value})}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>Natureza<select value={r.nature} onChange={e => update(r.line,{nature:e.target.value as Review['nature']})}>{Object.entries(natures).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
            <label>Direção<select value={r.direction} onChange={e => update(r.line,{direction:e.target.value as Transaction['type']})}><option value="">Escolha a direção</option><option value="expense">Saída</option><option value="income">Entrada</option></select></label>
            {!result.rows.find(original => original.line === r.line)?.currency && <label className="checkbox"><input type="checkbox" checked={r.currency === 'BRL'} onChange={e => update(r.line,{currency:e.target.checked ? 'BRL' : null})}/>Conferi no documento que o valor está em reais (BRL)</label>}
            <label>Situação<select value={r.status} onChange={e => update(r.line,{status:e.target.value as Transaction['status']})}><option value="">Escolha a situação</option><option value="planned">Previsto</option><option value="realized">Realizado</option></select></label>
            <label>Observações<input maxLength={300} value={r.note} onChange={e => update(r.line,{note:e.target.value})}/></label>
          </div>
          {blocked.has(r.line) ? <p>Já adicionado a partir deste documento.</p> : <>
            {state.transactions.some(t => t.date === r.date && t.amount === cents(r.value)) && <p className="notice warning">Já existe um lançamento com esta data e valor. Confira antes de selecionar.</p>}
            {(r.conflict || r.ambiguities.length > 0) && <label className="checkbox"><input type="checkbox" checked={r.reviewed} onChange={e => update(r.line,{reviewed:e.target.checked})}/>Conferi os campos no original e resolvi as dúvidas deste lançamento</label>}
            <label className="checkbox" data-tour="document-select"><input type="checkbox" checked={r.selected && ready(r)} disabled={!ready(r)} onChange={e => update(r.line,{selected:e.target.checked})}/>Selecionar lançamento {r.line}</label></>}
        </fieldset>)}
        <p aria-live="polite">{selected.length} de {rows.length} lançamentos selecionados · {needsReview} para revisão</p>
        <button type="button" className="button secondary" onClick={() => selectAll(true)}>Selecionar todos os válidos</button>
        <button type="button" className="button secondary" onClick={() => selectAll(false)}>Desmarcar todos</button>
        <button type="button" className="button primary" disabled={!selected.length} data-tour="document-confirm" onClick={confirm}>Confirmar e adicionar ({selected.length})</button></>}
    </fieldset>
    <p aria-live="polite">{busy ? 'Processando…' : notice}</p>
  </section>;
}
