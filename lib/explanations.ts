import type { FinanceState } from './types';
import { answerEducation, EDUCATION, retrieveEducation } from './education';
import { readBoundedJson } from './bounded-response';
export type ProviderConfig={provider?: "openai" | "groq";key?:string;model?:string;enabled?:string;reserveUsage?:()=>Promise<void>};

// The provider selects reviewed paragraphs and verified metrics. No arbitrary provider text,
// numeric claim, URL, executable instruction or financial write reaches the interface.
export async function explainMonth(state:FinanceState,month:string,question:string,config:ProviderConfig,fetcher:typeof fetch=fetch) {
  const fallback=answerEducation(state,month,question);
  const retrieved=retrieveEducation(question);
  const configured=Boolean(config.key&&config.model&&config.enabled==='true');
  const groq = config.provider === "groq";
  const consent = groq ? state.profile.groqConsent : state.profile.aiConsent;
  if(!configured||!consent||!retrieved.length) return {...fallback,aiAvailable:configured};
  await config.reserveUsage?.();
  const allowedMetrics=['income','expenses','result','pendingIncome','pendingExpenses','projection'] as const;
  const metrics=Object.fromEntries(allowedMetrics.map(key=>[key,fallback.metrics[key]]));
  try {
    const signal=AbortSignal.timeout(12000);
    const instructions = 'Organize conceitos educativos em português. Escolha de um a três IDs dos trechos fornecidos e chaves das métricas calculadas. Não calcule, não recomende ativos e não crie fontes.';
    const input = JSON.stringify({metricsInCents:metrics,partial:fallback.metrics.incomplete,topics:retrieved.map(x=>x.theme),reviewedContent:retrieved.map(({id,summary})=>({id,summary}))});
    const format = {name:'reviewed_explanation',strict:true,schema:{type:'object',additionalProperties:false,properties:{sourceIds:{type:'array',items:{type:'string',enum:retrieved.map(x=>x.id)}},metricKeys:{type:'array',items:{type:'string',enum:[...allowedMetrics]}}},required:['sourceIds','metricKeys']}};
    const body = groq ? {
      model:config.model, max_completion_tokens:400, reasoning_effort:'low',
      messages:[{role:'system',content:instructions},{role:'user',content:input}],
      response_format:{type:'json_schema',json_schema:format},
    } : {model:config.model, store:false, max_output_tokens:400, instructions, input, text:{format:{type:'json_schema',...format}}};
    const endpoint = groq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/responses';
    const response = await fetcher(endpoint, {
      method:'POST', signal, redirect:'error', headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'}, body:JSON.stringify(body),
    });
    const result = await readBoundedJson(response,signal) as {
      choices?:Array<{finish_reason?:string;message?:{content?:string}}>;
      status?:string;output?:Array<{content?:Array<{type?:string;text?:string}>}>;
    };
    if (groq && result.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete Groq response');
    if (!groq && result.status && result.status !== 'completed') throw new Error('Incomplete OpenAI response');
    const output = groq ? result.choices?.[0]?.message?.content : result.output?.flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text??'').join('');
    if(!output) throw new Error('Missing output');
    const selection=JSON.parse(output) as {sourceIds:unknown;metricKeys:unknown};
    if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).sort().join(',')!=='metricKeys,sourceIds') throw new Error('Unexpected provider fields');
    if(!Array.isArray(selection.sourceIds)||selection.sourceIds.length<1||selection.sourceIds.length>3||selection.sourceIds.some(x=>typeof x!=='string'||!retrieved.some(s=>s.id===x))||!Array.isArray(selection.metricKeys)||selection.metricKeys.length>6||selection.metricKeys.some(x=>!allowedMetrics.includes(x))) throw new Error('Invalid provider references');
    const sources=[...new Set(selection.sourceIds)].map(id=>EDUCATION.find(s=>s.id===id)!);
    return {...fallback,mode:'assisted' as const,aiAvailable:true,answer:sources.map(x=>x.summary).join(' '),sources:sources.map(({id,title,sourceTitle,url,consultedAt})=>({id,title,sourceTitle,url,consultedAt})),selectedMetricKeys:selection.metricKeys,explanationMethod:'Conceitos organizados com IA; textos revisados e cálculos verificados pelo sistema.'};
  } catch {
    return {...fallback,aiAvailable:true,providerFallback:true,limitations:[...fallback.limitations,'O serviço de IA não respondeu de forma válida. A análise por regras continua disponível.']};
  }
}
