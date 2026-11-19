import { emptyState } from '../lib/demo';
import { explainMonth } from '../lib/explanations';

import { aiConfig } from '../lib/ai-config';
const config = aiConfig();
if (config.enabled !== 'true' || !config.key || !config.model) {
  console.error('Configure AI_ENABLED=true, chave e modelo do provedor no ambiente privado.');
  process.exitCode = 1;
} else {
  const state = emptyState();
  state.profile.aiConsent = true;
  state.profile.groqConsent = true;
  const result = await explainMonth(state, '2026-11', 'Como organizar uma reserva?', config);
  // One paid request, using synthetic zero balances; no credential or response payload is logged.
  if (result.mode !== 'assisted') {
    console.error('IA não validada: confira acesso ao modelo, chave, saldo e conectividade.');
    process.exitCode = 1;
  } else console.log('Integração real validada: resposta do provedor aceita pelos controles de saída.');
}
