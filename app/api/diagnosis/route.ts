import { env } from "cloudflare:workers";
import { isValidMonth } from "../../../lib/finance";
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
      key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, enabled: env.AI_ENABLED,
    });
    return jsonResponse(result);
  } catch (error) { return errorResponse(error); }
}
