import { isValidMonth } from "../../../lib/finance";
import { aiConfig } from "../../../lib/ai-config";
import { explainMonth } from "../../../lib/explanations";
import { RepositoryError } from "../../../lib/repository";
import { authenticatedContext, errorResponse, jsonBody, jsonResponse, readWithTimeout } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { ownerId, repository } = await authenticatedContext(request);
    const body = await jsonBody(request, 4_096);
    if (!isValidMonth(body.month)) throw new RepositoryError(400, "Escolha um mês válido.");
    if (body.question !== undefined && (typeof body.question !== "string" || body.question.length > 600)) {
      throw new RepositoryError(400, "Sua pergunta pode ter até 600 caracteres.");
    }
    await repository.consumeRate(ownerId, "diagnosis", 10);
    const { state } = await readWithTimeout(repository.get(ownerId));
    const result = await explainMonth(state, body.month, typeof body.question === "string" ? body.question : "Como organizar meu orçamento?", {
      ...aiConfig(),
      reserveUsage: async () => {
        const limit = Number(process.env.AI_GLOBAL_DAILY_LIMIT || 200);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new RepositoryError(503, "A configuração de IA precisa ser revisada.");
        // Separate identities keep deleting financial records from resetting AI quotas.
        await repository.consumeRate(`ai:${ownerId}`, "ai-user", 20, 86_400_000);
        await repository.consumeRate("system:ai-budget", "ai-global", limit, 86_400_000);
      },
    });
    return jsonResponse(result);
  } catch (error) { return errorResponse(error); }
}
