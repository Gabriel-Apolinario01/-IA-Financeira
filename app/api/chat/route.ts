import { answerChat, validateChat } from '../../../lib/financial-chat';
import { authenticatedContext, errorResponse, jsonBody, jsonResponse, readWithTimeout } from '../_shared';
import { RepositoryError } from '../../../lib/repository';

export async function POST(request: Request) {
  try {
    const {ownerId,repository} = await authenticatedContext(request);
    const body = await jsonBody(request, 13000);
    let input;
    try { input = validateChat(body); } catch { throw new RepositoryError(400,'Pergunta ou histórico inválido. Use até 600 caracteres por pergunta.'); }
    await repository.consumeRate(ownerId,'chat',10);
    const state = input.shareMetrics ? (await readWithTimeout(repository.get(ownerId))).state : null;
    return jsonResponse(await answerChat(input,state,{key:process.env.GROQ_API_KEY,model:process.env.GROQ_MODEL,
      enabled: process.env.AI_PROVIDER === 'groq' ? process.env.AI_ENABLED : 'false',
      reserve:async () => {
        const limit = Number(process.env.AI_GLOBAL_DAILY_LIMIT || 200);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new RepositoryError(503,'Revise o limite de IA.');
        await repository.consumeRate('ai:'+ownerId,'ai-user',20,86_400_000);
        await repository.consumeRate('system:ai-budget','ai-global',limit,86_400_000);
      }}));
  } catch (error) { return errorResponse(error); }
}
