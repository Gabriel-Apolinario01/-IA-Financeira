"use client";
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatAnswer } from '../lib/financial-chat';

type Exchange = { question: string; answer: ChatAnswer };
export function FinancialChat({ month, account }: { month: string; account: boolean }) {
  const [turns,setTurns] = useState<Exchange[]>([]);
  const [question,setQuestion] = useState('');
  const [messages,setMessages] = useState(false);
  const [metrics,setMetrics] = useState(false);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function reset() {
    active.current?.abort(); active.current = null;
    setPending(false); setTurns([]); setQuestion(''); setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (active.current || !text || text.length > 600 || turns.length >= 20) return;
    const controller = new AbortController();
    active.current = controller; setPending(true); setError('');
    try {
      const response = await fetch('/api/chat', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({month,question:text,history:turns.slice(-5).map(t=>t.question),
          previousAnswers:turns.slice(-5).map(t=>t.answer.paragraphs.join(' ').slice(0,600)),shareMessages:messages,shareMetrics:metrics}),
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20_000)])});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Falha ao enviar a pergunta.');
      if (active.current !== controller) return;
      setTurns(old=>[...old,{question:text,answer:data}]); setQuestion('');
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Falha ao consultar o chat.');
    } finally {
      if (active.current === controller) { active.current=null; setPending(false); }
    }
  }
  return <section className="card financial-chat"><header className="card-heading"><h2>Conversa sobre finanças</h2>
    {account && <button className="button secondary" onClick={reset}>Nova conversa</button>}</header>
    {!account ? <p><Link href="/login">Entre na sua conta</Link> para conversar. Os guias educativos e o simulador estão disponíveis na demonstração.</p> : <>
    <label className="checkbox"><input type="checkbox" checked={messages} onChange={e=>{reset();setMessages(e.target.checked);}}/>Autorizar a Groq a receber minha pergunta e o contexto recente desta conversa. Evite incluir dados pessoais.</label>
    <label className="checkbox"><input type="checkbox" checked={metrics} onChange={e=>{reset();setMetrics(e.target.checked);}}/>Usar os totais do mês, gastos por categoria, comprometimento, metas, dívidas e pendências na resposta. Com a Groq autorizada, esses resumos também são enviados a ela.</label>
    <p className="fine-print">Ao mudar uma autorização, o histórico desta conversa é limpo. Até 20 perguntas por conversa.</p>
    <div role="log" aria-label="Histórico da conversa" aria-live="polite">{turns.map((t,i)=><article className="chat-turn" key={i}>
      <h3>{t.question}</h3><small>{t.answer.mode === 'groq' ? 'IA · Groq' : 'Orientação local'}</small>
      {t.answer.notice && <p>{t.answer.notice}</p>}{t.answer.paragraphs.map((p,j)=><p key={j}>{p}</p>)}
      {!!t.answer.facts.length && <ul>{t.answer.facts.map(v=><li key={v}>{v}</li>)}</ul>}
      {t.answer.sources.map(s=><a className="source-link" key={s.url} href={s.url} rel="noopener noreferrer" target="_blank">{s.title}</a>)}
    </article>)}</div>
    <form onSubmit={submit}><label htmlFor="chat-question">Sua pergunta</label><input id="chat-question" maxLength={600} value={question} onChange={e=>setQuestion(e.target.value)} disabled={pending || turns.length>=20}/>
      <small>{question.length}/600 caracteres</small>
      <button className="button primary" disabled={pending || !question.trim() || turns.length>=20}>Enviar pergunta</button></form>
    <p role="status">{pending ? 'Preparando a resposta…' : turns.length>=20 ? 'Inicie uma nova conversa para continuar.' : ''}</p>
    {error && <p role="alert">{error}</p>}</>}
  </section>;
}
