import { isValidDate, parseMoney } from './finance';
import { classifyImportDescription } from './import-classifier';
import type { Transaction } from './types';

export interface DocumentDraft {
  line: number; page: number; kind: string; issuer: string; description: string;
  amount: number | null; currency: 'BRL' | null; date: string; dueDate: string; paidDate: string;
  category: string; nature: NonNullable<Transaction['nature']>; direction: Transaction['type'];
  status: Transaction['status']; warnings: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const amountPattern = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/gi;
const datePattern = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
const heading = /^(?:conta de (?:luz|energia|agua)|boleto(?: bancario)?|cupom fiscal|nota (?:fiscal|de compra)|comprovante (?:de )?(?:pix|pagamento)|fatura)(?:\s|$)/;
const totals = /\b(?:total (?:a pagar|da nota|do cupom)|valor (?:total|do documento|cobrado|pago|da transacao|do pix)|total|valor)\b/;
function amounts(lines: string[]) {
  return [...new Set(lines.flatMap(line => [...line.matchAll(amountPattern)].flatMap(match => {
    try { const cents = parseMoney(match[1]); return cents > 0 ? [cents] : []; }
    catch { return []; }
  })))];
}
function dateFrom(lines: string[]) {
  const dates = new Set(lines.flatMap(line => [...line.matchAll(datePattern)].map(m => [m[3], m[2], m[1]].join('-'))).filter(isValidDate));
  return dates.size === 1 ? [...dates][0] : '';
}

function interpret(lines: string[], page: number, line: number): DocumentDraft {
  const folded = lines.map(fold);
  const text = folded.join('\n');
  const kind = /\b(?:energia|conta de luz)\b/.test(text) ? 'Conta de energia'
    : /\bconta de agua\b/.test(text) ? 'Conta de água' : /\bpix\b/.test(text) ? 'Comprovante PIX'
    : /\bcupom fiscal\b/.test(text) ? 'Cupom fiscal' : /\bnota fiscal|nota de compra\b/.test(text) ? 'Nota de compra'
    : /\bboleto\b/.test(text) ? 'Boleto' : /\bfatura\b/.test(text) ? 'Fatura'
    : /\bcomprovante de pagamento\b/.test(text) ? 'Comprovante de pagamento' : 'Documento';
  const issuerLine = lines.find((_, i) => /^(?:emissor|favorecido|beneficiario|estabelecimento|recebedor|razao social)\s*[:\-]/.test(folded[i]));
  const issuer = issuerLine?.replace(/^[^:\-]*[:\-]\s*/, '').slice(0, 100) ?? '';
  const totalLines = folded.filter(s => totals.test(s) && !/\b(?:subtotal|troco|desconto|tributos|itens|produtos|juros|multa|minimo)\b/.test(s));
  const candidates = amounts(totalLines.length ? totalLines : folded);
  const currency = /\b(?:usd|eur|dolar|euro)\b|us\$|€/.test(text) ? null : 'BRL';
  const amount = candidates.length === 1 && currency ? candidates[0] : null;
  const dueDate = dateFrom(folded.filter(s => /\bvenc(?:imento|\.)?\b/.test(s)));
  const paidLines = folded.filter(s => /\b(?:pag[oa] em|data (?:do |de )?pagamento|efetivad[oa] em|liquidad[oa] em)\b/.test(s));
  const negative = /\b(?:nao pag[oa]|nao comprovad[oa]|agendad[oa]|pendente|a confirmar|nao efetuad[oa]|cancelad[oa])\b/.test(text);
  const paymentEvidence = !negative && (/\b(?:pagamento (?:realizado|efetuado|confirmado)|pix (?:enviado|recebido|efetivado)|valor pago|pago em|liquidado em)\b/.test(text) || (kind.startsWith('Comprovante') && paidLines.length > 0));
  const paidDate = paymentEvidence ? dateFrom(paidLines) : '';
  const issueDate = dateFrom(folded.filter(s => !/\bvenc|pagamento previsto|agendad/.test(s)));
  const date = paymentEvidence ? paidDate || issueDate : dueDate || issueDate;
  const household = kind === 'Conta de energia' || kind === 'Conta de água';
  const description = (issuer ? kind + ' — ' + issuer : kind === 'Documento' ? lines[0] || '' : kind).slice(0, 160);
  const suggestion = classifyImportDescription(issuer || lines.slice(0, 3).join(' ').slice(0, 160), -1);
  const nature = /pagamento (?:de |da )?fatura/.test(text) ? 'invoice_payment'
    : /\bentre contas proprias\b/.test(text) ? 'transfer'
    : kind === 'Documento' || kind === 'Comprovante PIX' || kind === 'Fatura' ? 'unidentified' : 'expense';
  const warnings = [];
  if (!amount) warnings.push('Confira a moeda e informe um único valor total em reais.');
  if (!date) warnings.push('Informe a data do lançamento.');
  if (nature === 'unidentified') warnings.push('Escolha a natureza e confira a direção do dinheiro.');
  if (!paymentEvidence) warnings.push('Pagamento sem comprovação. Sugestão de lançamento previsto.');
  return { line, page, kind, issuer, currency, description, amount, date, dueDate, paidDate,
    category: household ? 'moradia' : suggestion.category ?? 'outros', nature,
    direction: /\bpix recebido\b/.test(text) ? 'income' : 'expense',
    status: paymentEvidence ? 'realized' : 'planned', warnings };
}

export function documentDrafts(pages: { text: string }[]) {
  const rows: DocumentDraft[] = [];
  for (const [index, page] of pages.entries()) {
    const lines = page.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const table = lines.findIndex(s => /\bdata\b.*\b(descricao|lancamento|historico|estabelecimento)\b.*\bvalor\b/.test(fold(s)));
    if (table >= 0) {
      const kind = /\bfatura\b/.test(fold(lines.slice(0,table).join(' '))) ? 'Fatura' : 'Movimentações';
      let items = 0;
      for (const entry of lines.slice(table+1)) {
        if (/^(?:total|saldo|subtotal|limite|resumo)\b/.test(fold(entry))) continue;
        const m = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([+-]?\s*(?:R\$\s*)?[\d.]+,\d{2})$/.exec(entry);
        if (rows.length >= 40) throw new Error('O documento excede 40 lançamentos. Separe-o antes de enviar.');
        const draft = interpret([entry],index+1,rows.length+1);
        draft.kind = kind; draft.description = (m?.[2] ?? entry).slice(0,160);
        draft.nature = 'unidentified';
        draft.amount = null;
        if (m) {
          const value = amounts([m[3]])[0];
          const suggested = classifyImportDescription(m[2], m[3].startsWith('+') ? value : -value);
          draft.amount = draft.currency === 'BRL' ? value ?? null : null; draft.nature = suggested.nature;
          draft.category = suggested.category ?? 'outros'; draft.direction = m[3].startsWith('+') ? 'income':'expense';
        }
        draft.warnings = ['Confira a data, o valor, a natureza e a situação desta linha antes de confirmar.'];
        rows.push(draft);items++;
      }
      if (items) continue;
    }
    const blocks: string[][] = [];
    let block: string[] = [];
    for (const line of lines) {
      if (heading.test(fold(line)) && block.length && amounts(block).length) {
        blocks.push(block);
        block = [];
      }
      block.push(line);
    }
    blocks.push(block);
    for (const group of blocks) {
      if (rows.length >= 40) throw new Error('O documento excede 40 lançamentos. Separe-o antes de enviar.');
      rows.push(interpret(group, index + 1, rows.length + 1));
    }
  }
  return rows;
}
