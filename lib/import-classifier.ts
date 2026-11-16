import type { TransactionNature } from './types';

export interface ImportSuggestion {
  category?: string;
  nature: TransactionNature;
  reason: string;
  evidence: 'matched'|'ambiguous'|'insufficient';
  needsReview: true;
  method: 'local_rules';
}
const normalize = (value: string) => value.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const rules = [
  {category:'alimentacao',pattern:/\b(padaria|panificadora|supermercado|mercado|hortifruti|restaurante|lanchonete|acougue)\b/,reason:'Descrição contém referência a alimentação.'},
  {category:'saude',pattern:/\b(farmacia|drogaria|consulta medica|posto de saude|laboratorio clinico)\b/,reason:'Descrição contém referência a saúde.'},
  {category:'transporte',pattern:/\b(posto de combustivel|posto de combustiveis|combustivel|abastecimento|gasolina|diesel|passagem de onibus|estacionamento)\b/,reason:'Descrição contém referência a transporte ou combustível.'},
  {category:'moradia',pattern:/\b(conta de luz|energia eletrica|conta de agua|aluguel|condominio)\b/,reason:'Descrição contém referência a uma despesa de moradia.'},
  {category:'educacao',pattern:/\b(mensalidade escolar|mensalidade da escola|mensalidade faculdade|mensalidade universitaria|material escolar|curso de idiomas)\b/,reason:'Descrição contém referência a educação.'},
  {category:'assinaturas',pattern:/\b(netflix|spotify|assinatura streaming|servico de streaming|servicos de streaming|mensalidade streaming)\b/,reason:'Descrição contém referência a assinatura ou streaming.'},
] as const;

/** Suggestions only: no I/O, probabilities, account writes or refund links. */
export function classifyImportDescription(description: string, signedAmount: number): ImportSuggestion {
  const base = {needsReview:true as const,method:'local_rules' as const};
  const unknown = (reason: string,evidence: ImportSuggestion['evidence']='insufficient'): ImportSuggestion => ({...base,nature:'unidentified',reason,evidence});
  if(typeof description!=='string' || !description.trim() || description.length>160 || !Number.isSafeInteger(signedAmount) || !signedAmount) return unknown('Dados insuficientes para sugerir uma classificação.');
  const text=normalize(description);
  // Payment intermediaries and gambling names alone do not establish what was purchased.
  if(/\b(mercado pago|mercado livre|amazon|paypal|aposta|apostas|bet|bets|bet365|betano)\b/.test(text)) return unknown('Descrição de intermediário, empresa ou aposta não comprova a natureza nem a categoria. Revise manualmente.','ambiguous');
  const transfer=/\b(transferencia|ted|doc|pix entre contas|pix conta propria|pix mesma titularidade)\b/.test(text);
  const invoice=/\b(pagamento (?:de |da )?fatura|pag fatura|liquidacao (?:de |da )?fatura)\b/.test(text);
  const refund=/\b(estorno|reembolso|devolucao)\b/.test(text);
  if([transfer,invoice,refund].filter(Boolean).length>1) return unknown('Descrição contém naturezas conflitantes; confira a origem.','ambiguous');
  if(refund) return {...base,nature:'refund',reason:'Possível estorno. Confirme o original; nenhum vínculo é criado automaticamente.',evidence:'matched'};
  if(invoice) return {...base,nature:'invoice_payment',reason:'Possível liquidação de fatura, sem novo consumo. Verifique as compras e a origem.',evidence:'matched'};
  if(transfer) return {...base,nature:'transfer',reason:'Possível transferência. Confirme se é entre contas próprias; não presumimos receita ou consumo.',evidence:'matched'};
  if(/\bpix\b/.test(text)) return unknown('PIX é um meio de pagamento e não determina a natureza da movimentação.','ambiguous');
  if(signedAmount>0 && /\b(salario|salario mensal|pro labore)\b/.test(text)) return {...base,nature:'income',category:'outros',reason:'Descrição indica remuneração recebida; confirme a origem.',evidence:'matched'};
  const matches=rules.filter(rule=>rule.pattern.test(text));
  if(matches.length>1) return unknown('Há referências a mais de uma categoria. Escolha após revisar.','ambiguous');
  if(!matches.length) return unknown('Sem evidência suficiente. Escolha a natureza e a categoria manualmente.');
  const match=matches[0];
  return {...base,category:match.category,nature:signedAmount<0?'expense':'unidentified',evidence:'matched',reason:signedAmount<0?`${match.reason} Confirme se é uma compra de consumo.`:`${match.reason} A entrada pode ter outra natureza; revise antes de confirmar.`};
}
