"use client";
import { useRef, useState } from 'react';
import { CATEGORIES, type FinanceState, type TransactionNature } from '@/lib/types';
import { IMPORT_LIMIT, decodeImport, parseImport, possibleMatches, confirmedImportRows, type ImportLocale } from '@/lib/imports';
import { defaultReview, importDuplicate, reviewIssue, selectedImportTotals, type ImportReview } from '@/lib/import-review';
import { formatMoney } from '@/lib/finance';
import { classifyImportDescription, type ImportSuggestion } from '@/lib/import-classifier';

import { DocumentPanel } from './document-panel';

const documentFormats: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
};
const supportedTypes = '.csv,.tsv,.ofx,.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

const labels: Record<TransactionNature,string> = { income:'Receita', expense:'Despesa', transfer:'Transferência entre contas próprias', invoice_payment:'Pagamento de fatura', refund:'Estorno', unidentified:'Não identificado — revisar' };
type Props = {
  state: FinanceState;
  send: (type: string, payload: Record<string, unknown>, id?: string) => Promise<FinanceState>;
  pending: boolean;
  signedIn: boolean;
  vision: boolean;
  onDocumentHelp?: () => void;
};

export function ImportPanel({ state, send, pending, signedIn, vision, onDocumentHelp }: Props) {
  const [document, setDocument] = useState<{ file: File; selection: number } | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [file, setFile] = useState<{name:string;content:string;hash:string}|null>(null);
  const [locale, setLocale] = useState<ImportLocale>('auto');
  const [encoding, setEncoding] = useState<'utf-8'|'windows-1252'>('utf-8');
  const [account, setAccount] = useState('');
  const [accepted, setAccepted] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [reviews, setReviews] = useState<Record<number,ImportReview>>({});
  const [descriptionConsent,setDescriptionConsent]=useState(false);
  const [assisting,setAssisting]=useState(false);
  const [assistanceNotice,setAssistanceNotice]=useState('');
  const [assistedSuggestions,setAssistedSuggestions]=useState<Record<number,Omit<ImportSuggestion,'method'> & {method:'local_rules'|'model'}>>({});
  const classificationRequest=useRef(0);
  let parsed: ReturnType<typeof parseImport>|undefined; let parseError='';
  if(file) {try {parsed=parseImport(file.name,file.content,locale);} catch(error) {parseError=(error as Error).message;}}
  function resetReview() {classificationRequest.current++;setAccepted([]);setReviews({});setMessage('');setAssistedSuggestions({});setAssistanceNotice('');setDescriptionConsent(false);}
  async function load(upload?: File) {
    if (!upload || reading || pending || documentBusy) return;
    resetReview();
    setFile(null);
    const extension = upload.name.split('.').pop()?.toLowerCase() ?? '';
    const mime = Object.values(documentFormats).includes(upload.type) ? upload.type
      : Object.hasOwn(documentFormats, extension) ? documentFormats[extension] : undefined;
    if (mime && signedIn && upload.size > 0 && upload.size <= 5 * 1024 * 1024) {
      const file = upload.type === mime ? upload : new File([upload], upload.name, { type: mime });
      setDocument(previous => ({ file, selection: (previous?.selection ?? 0) + 1 }));
      return;
    }
    setDocument(null);
    if (!upload.size) { setMessage('O arquivo está vazio. Escolha outro arquivo.'); return; }
    if (mime) {
      setMessage(signedIn ? 'O limite para fotos e PDFs é 5 MiB.' : 'Entre na sua conta para ler fotos e PDFs.');
      return;
    }
    if (!['csv', 'tsv', 'ofx'].includes(extension)) {
      setMessage('Formato incompatível. Escolha CSV, TSV, OFX, JPEG, PNG, WebP ou PDF.');
      return;
    }
    setReading(true);
    try {
      if(upload.size>IMPORT_LIMIT) throw new Error('O limite é 100 KB por arquivo.');
      const content=decodeImport(await upload.arrayBuffer(),encoding);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      setFile({name:upload.name,content,hash});
    } catch(error) {setMessage((error as Error).message);} finally {setReading(false);}
  }
  const entries=(parsed?.rows ?? []).map(row=>{
    const review=reviews[row.line] ?? defaultReview(row);
    const duplicate=file && parsed ? importDuplicate(row,state.importBatches ?? [],account.trim(),parsed.source,file.hash) : null;
    const issue=duplicate==='conflict'?'Identificador externo já recebido com valor ou data diferente. Revise a origem.':reviewIssue(row,review);
    return {row,review,duplicate,issue,ready:!issue && duplicate!=='exact'};
  });
  const totals=selectedImportTotals(state,parsed?.rows ?? [],reviews,accepted);
  const invalid=entries.filter(e=>e.row.error || e.duplicate==='conflict').length;
  const duplicates=entries.filter(e=>e.duplicate==='exact').length;
  const awaiting=entries.filter(e=>!e.row.error && !e.duplicate && e.issue).length;
  const selectedBlocked=entries.some(e=>accepted.includes(e.row.line) && !e.ready);
  const assistanceRows=entries.filter(e=>!e.row.error && !e.duplicate && e.issue).slice(0,10).map(({row,review})=>({line:row.line,description:review.description,direction:row.amount<0?'expense':'income'}));
  async function requestAssistance() {
    if(!signedIn || !descriptionConsent || assisting || !assistanceRows.length) return;
    const request=++classificationRequest.current;
    setAssisting(true);setAssistanceNotice('');setDescriptionConsent(false);
    try {
      const response=await fetch('/api/import-classification',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:assistanceRows,consent:true}),signal:AbortSignal.timeout(10000)});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || 'Serviço indisponível. As regras locais continuam disponíveis.');
      if(request!==classificationRequest.current) return;
      setAssistedSuggestions(Object.fromEntries(result.suggestions.map((entry: {line:number;suggestion:ImportSuggestion})=>[entry.line,entry.suggestion])));
      setAssistanceNotice(result.notice);
    } catch(error) {if(request===classificationRequest.current) setAssistanceNotice(`${error instanceof Error?error.message:'Serviço indisponível.'} As sugestões locais permanecem disponíveis.`);}
    finally {setAssisting(false);}
  }
  async function commit() {
    if(!file || !accepted.length || selectedBlocked || totals.error) return;
    try {
      const natures=Object.fromEntries(accepted.map(line=>[line,reviews[line]?.nature ?? 'unidentified']));
      const edits=Object.fromEntries(accepted.map(line=>{const {description,category,refundOf}=reviews[line];return [line,{description,category,...(refundOf?{refundOf}:{})}];}));
      // Client hashes and suggestions are never trusted or sent as editable provenance.
      const next=await send('import.commit',{name:file.name,content:file.content,account:account.trim(),locale,accepted,natures,edits});
      const batch=next.importBatches!.at(-1)!;
      setMessage(`${batch.transactions.length} importados; ${batch.duplicates} duplicados exatos; ${batch.ignored} ignorados; ${batch.errors} com erro.`);
      setFile(null);setAccepted([]);setReviews({});
    } catch(error) {setMessage((error as Error).message);}
  }
  async function change(type: string,id: string) {
    try {await send(type,{id});setMessage(type==='import.revert'?'Lote desfeito. A origem foi preservada.':'Lote restaurado.');setAccepted([]);}
    catch(error) {setMessage((error as Error).message);}
  }
  return <section className="card import-panel" aria-labelledby="import-heading" data-tour-draft={Boolean(file || document)} data-tour-busy={reading || documentBusy || assisting}>
    {onDocumentHelp && <button type="button" className="text-link document-help" disabled={pending || reading || documentBusy} onClick={onDocumentHelp}>Como importar e revisar um documento?</button>}
    <h2 id="import-heading">Importar extrato</h2>
    <p>Selecione ou arraste um arquivo para revisar os lançamentos.</p>
    <div className="import-drop" onDragOver={e => e.preventDefault()} onDrop={e => {
      e.preventDefault();
      void load(e.dataTransfer.files[0]);
    }}>
      <label data-tour="document-upload">Extrato, foto ou PDF<input type="file" accept={supportedTypes} disabled={pending || reading || documentBusy}
        onChange={e => { void load(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>
      <small>CSV, TSV e OFX até 100 KB e 300 linhas. JPEG, PNG, WebP e PDF até 5 MiB. PDF até 4 páginas.</small>
      {signedIn && <label className="import-camera">Fotografar uma conta<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
        disabled={pending || reading || documentBusy}
        onChange={e => { void load(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>}
      {reading && <p role="status">Lendo arquivo…</p>}
    </div>
    {!signedIn && <p><a href="/login">Entre na sua conta</a> para usar a leitura de fotos e PDFs.</p>}
    {document && <DocumentPanel key={document.selection} file={document.file} state={state} send={send}
      pending={pending} busy={documentBusy} setBusy={setDocumentBusy} vision={vision} />}
    {!document && <>
    <p className="fine-print">Cabeçalhos: data, descrição e valor; ou débito e crédito separados. Saldos e totais não são lançamentos. Transferências e pagamentos de fatura não geram novo consumo. Confira se as compras da fatura estão cadastradas.</p>
    <div className="import-controls">
      <label>Apelido da conta<input value={account} maxLength={60} disabled={pending || reading} placeholder="Ex.: Conta principal" onChange={e=>{setAccount(e.target.value);setAccepted([]);}} /></label>
      <label>Formato numérico do CSV<select value={locale} disabled={pending || reading} onChange={e=>{setLocale(e.target.value as ImportLocale);resetReview();}}><option value="auto">Detectar · confirmar ambiguidades</option><option value="br">Brasil: 1.234,56</option><option value="us">Internacional: 1,234.56</option></select></label>
      <label>Codificação do arquivo<select value={encoding} disabled={pending || reading} onChange={e=>{setEncoding(e.target.value as typeof encoding);setFile(null);resetReview();}}><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 (sistemas antigos)</option></select></label>
    </div>
    </>}
    {message && <p role="status" className="notice">{message}</p>}
    {parseError && <p role="alert" className="notice warning">{parseError}</p>}
    {parsed && <>
      <h3>Prévia: {file?.name}</h3>
      <p className="fine-print">Nenhuma sugestão ou linha é confirmada automaticamente. Use o mesmo apelido para a mesma conta. Em caso de número ambíguo, escolha o formato acima; não misture convenções no mesmo arquivo.</p>
      <p className="fine-print">Sugestões por regras locais, sem IA generativa e sem envio de descrições. Aplicar uma sugestão preenche os campos; selecionar e confirmar continuam sendo ações suas.</p>
      {signedIn && <details className="import-assistance"><summary>Classificação assistida por IA (opcional)</summary><p>Quando o serviço estiver habilitado, somente até 10 descrições pendentes e suas direções de caixa serão enviadas à OpenAI. Não enviamos arquivo completo, colunas de valores e datas, apelido da conta ou perfil. Identificadores reconhecíveis são removidos, mas confira as descrições antes de autorizar. Falhas preservam as regras locais.</p><ul>{assistanceRows.map(row=><li key={row.line}>Linha {row.line}: {row.description} · {row.direction==='expense'?'saída':'entrada'}</li>)}</ul><label className="checkbox"><input type="checkbox" checked={descriptionConsent} disabled={assisting} onChange={e=>setDescriptionConsent(e.target.checked)} /><span>Autorizo o envio destas descrições à OpenAI somente nesta solicitação.</span></label><button className="button secondary" disabled={!descriptionConsent || assisting || pending || !assistanceRows.length} onClick={()=>void requestAssistance()}>{assisting?'Solicitando…':'Solicitar sugestões de IA'}</button>{assistanceNotice && <p role="status">{assistanceNotice}</p>}</details>}
      <dl className="import-stats" aria-label="Resumo da importação">
        {[["Encontradas",entries.length],["Válidas",entries.length-invalid],["Inválidas",invalid],["Duplicadas exatas",duplicates],["Pendentes de revisão",awaiting],["Selecionadas",accepted.length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="notice import-selected" aria-live="polite"><p>Receitas reconhecidas selecionadas: <strong>{totals.income===null?'Indisponível':formatMoney(totals.income)}</strong></p><p>Consumo líquido selecionado: <strong>{totals.expenses===null?'Indisponível':formatMoney(totals.expenses)}</strong></p><small>Estornos vinculados compensam os originais. Transferências e faturas afetam apenas o caixa.</small>{totals.error && <p>{totals.error}</p>}</div>
      <div className="import-actions"><button className="button secondary" disabled={pending || !entries.some(e=>e.ready)} onClick={()=>setAccepted(entries.filter(e=>e.ready).map(e=>e.row.line))}>Selecionar válidas e revisadas</button><button className="button secondary" disabled={pending || !accepted.length} onClick={()=>setAccepted([])}>Desmarcar todas</button></div>
      <div className="import-table"><table><caption className="sr-only">Revisão das movimentações do extrato</caption><thead><tr>{['Seleção','Data','Descrição','Valor e direção','Natureza','Categoria','Status de revisão'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{entries.map(({row,review,duplicate,issue,ready})=>{
        const matches=row.error?[]:possibleMatches(row,state.transactions);
        const update=(patch: Partial<ImportReview>)=>{classificationRequest.current++;setDescriptionConsent(false);if(patch.description!==undefined) {setAssistedSuggestions(previous=>{const next={...previous};delete next[row.line];return next;});}setReviews(previous=>({...previous,[row.line]:{...review,...patch}}));};
        const suggestion=assistedSuggestions[row.line] ?? classifyImportDescription(review.description,row.error?0:row.amount);
        return <tr key={row.line} className={row.error?'import-row-invalid':''}>
          <td data-label="Seleção"><label className="import-select"><input aria-label={`Confirmar linha ${row.line}`} type="checkbox" disabled={pending || (!ready && !accepted.includes(row.line))} checked={accepted.includes(row.line)} onChange={e=>setAccepted(e.target.checked?[...accepted,row.line]:accepted.filter(n=>n!==row.line))} />Linha {row.line}</label></td>
          <td data-label="Data">{row.date || 'Não informada'}</td>
          <td data-label="Descrição" className="import-description"><textarea aria-label={`Descrição linha ${row.line}`} rows={3} maxLength={160} disabled={pending || !!row.error || duplicate==='exact'} value={review.description} onChange={e=>update({description:e.target.value})} />{review.description!==row.description && <details><summary>Descrição original</summary><p>{row.description}</p></details>}</td>
          <td data-label="Valor e direção" className="import-amount"><strong>{row.error?'—':formatMoney(row.amount)}</strong>{!row.error && <small>{row.amount<0?'Saída de caixa':'Entrada de caixa'}</small>}</td>
          <td data-label="Natureza"><select aria-label={`Natureza linha ${row.line}`} disabled={pending || !!row.error || duplicate==='exact'} value={review.nature} onChange={e=>update({nature:e.target.value as TransactionNature,refundOf:undefined})}>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>{review.nature==='refund' && <label className="import-refund">Lançamento original<select aria-label={`Original linha ${row.line}`} value={review.refundOf ?? ''} disabled={pending} onChange={e=>update({refundOf:e.target.value})}><option value="">Selecione o vínculo</option>{state.transactions.filter(t=>['income','expense'].includes(t.nature ?? t.type) && t.status==='realized' && t.date.slice(0,7)===row.date.slice(0,7) && t.type!==(row.amount<0?'expense':'income') && t.date<=row.date).map(t=><option key={t.id} value={t.id}>{t.description} · {formatMoney(t.amount)}</option>)}</select></label>}</td>
          <td data-label="Categoria"><select aria-label={`Categoria linha ${row.line}`} disabled={pending || !!row.error || duplicate==='exact' || ['transfer','invoice_payment','refund'].includes(review.nature)} value={review.category} onChange={e=>update({category:e.target.value})}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>{review.nature==='refund' && <small>A categoria do original prevalece.</small>}</td>
          <td data-label="Status de revisão" className="import-status"><strong>{duplicate==='exact'?'Já importada':row.error?'Inválida':issue?'Revisão pendente':accepted.includes(row.line)?'Selecionada':'Revisada'}</strong><p>{duplicate==='exact'?'Duplicação exata nesta conta, inclusive lotes desfeitos. Consulte o histórico.':issue || (['transfer','invoice_payment'].includes(review.nature)?'Somente caixa; não cria consumo.':'Pronta para seleção; confira os dados.')}</p>{matches.length>0 && duplicate!=='exact' && <p>Possível duplicação: {matches.length} registro(s) com valor e data próximos. Não é uma duplicação comprovada.</p>}
            {!row.error && !duplicate && <div className="import-suggestion"><small>{suggestion.method==='model'?'Sugestão de IA':'Sugestão local'} · revisão necessária</small><p>{suggestion.category && <strong>{CATEGORIES.find(c=>c.id===suggestion.category)?.label} · </strong>}{labels[suggestion.nature]}</p><p>{suggestion.reason}</p>{(suggestion.category || suggestion.nature!=='unidentified') && <button className="button secondary" disabled={pending} aria-label={`Aplicar sugestão linha ${row.line}`} onClick={()=>update({nature:suggestion.nature,category:suggestion.category ?? 'outros',refundOf:undefined})}>Aplicar sugestão</button>}</div>}
          </td>
        </tr>;
      })}</tbody></table></div>
      <div className="import-actions"><button className="button primary" disabled={pending || !account.trim() || !accepted.length || selectedBlocked || !!totals.error} onClick={()=>void commit()}>{pending?'Salvando…':`Confirmar ${accepted.length} linhas`}</button><button className="button secondary" disabled={pending} onClick={()=>{setFile(null);resetReview();}}>Cancelar</button></div>
    </>}
    <h3>Histórico e origem dos lançamentos</h3>
    {!state.importBatches?.length && <p>Nenhum arquivo importado.</p>}
    {state.importBatches?.slice().reverse().map(batch=><details key={batch.id}><summary>{batch.name} · {batch.account} · {batch.transactions.length} lançamentos · {batch.status==='confirmed'?'Confirmado':'Desfeito'}</summary><p>{batch.duplicates} duplicados; {batch.ignored} ignorados; {batch.errors} erros. Origem: {batch.source.toUpperCase()} · BRL · America/Sao_Paulo</p><p className="import-hash">SHA-256: {batch.hash}</p><ul>{confirmedImportRows(batch).map(row=><li key={row.line}>Linha {row.line}: {row.date} · {row.description} · {formatMoney(row.amount)}</li>)}</ul><ul>{batch.transactions.map(t=><li key={t.id}>{t.description} · {t.nature?labels[t.nature]:'Classificação legada'} · {CATEGORIES.find(c=>c.id===t.category)?.label}</li>)}</ul><p>{batch.audit.map(a=>`${a.at}: ${a.action==='confirmed'?'confirmado':'desfeito'}`).join(' / ')}</p><button className="button secondary" disabled={pending} onClick={()=>void change(batch.status==='confirmed'?'import.revert':'import.restore',batch.id)}>{batch.status==='confirmed'?'Desfazer lote':'Restaurar lote'}</button></details>)}
    <p className="fine-print">Histórico dos extratos CSV, TSV e OFX. Os lançamentos confirmados por foto ou PDF aparecem na lista de lançamentos.</p>
  </section>;
}
