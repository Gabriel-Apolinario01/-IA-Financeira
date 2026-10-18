'use client';
import { useEffect, useRef } from 'react';
import type { FinanceState } from './types';
import { isValidMonth, monthMetrics } from './finance';

// Progressive enhancement: no browser support is required for the visible app.
export function useFinanceTools(state:FinanceState, enabled:boolean) {
  const current=useRef(state);current.current=state;
  useEffect(()=>{
    if(!enabled)return;
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try {
      void Promise.resolve(context.registerTool({name:'read_registered_month',title:'Consultar resumo financeiro registrado',description:'Lê os totais do mês a partir do mesmo estado exibido no aplicativo. Não consulta bancos e não modifica dados.',inputSchema:{type:'object',properties:{month:{type:'string',description:'Mês AAAA-MM'}},required:['month'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input:unknown){
        if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Informe um mês.');
        const payload=input as Record<string,unknown>;
        if(Object.keys(payload).some(k=>k!=='month')||!isValidMonth(payload.month))throw new Error('Mês inválido.');
        return {month:payload.month,unit:'centavos de real',...monthMetrics(current.current,payload.month)};
      }},{signal:lifecycle.signal})).catch(()=>{/* Unsupported optional registration leaves the app intact. */});
    }catch{/* Optional integration only. */}
    return()=>lifecycle.abort();
  },[enabled]);
}
