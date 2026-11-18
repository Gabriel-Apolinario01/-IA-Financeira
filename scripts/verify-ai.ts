import { emptyState } from '../lib/demo';
import { explainMonth } from '../lib/explanations';

if (process.env.AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error('Configure AI_ENABLED=true, OPENAI_API_KEY e OPENAI_MODEL no ambiente privado.');
  process.exitCode = 1;
} else {
  const state = emptyState();
  state.profile.aiConsent = true;
  const result = await explainMonth(state, '2026-11', 'Como organizar uma reserva?', {
    key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, enabled: 'true',
  });
  // One paid request, using synthetic zero balances; no credential or response payload is logged.
  if (result.mode !== 'assisted') {
    console.error('IA não validada: confira acesso ao modelo, chave, saldo e conectividade.');
    process.exitCode = 1;
  } else console.log('Integração real validada: resposta do provedor aceita pelos controles de saída.');
}
