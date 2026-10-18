import type { Command } from "../../../lib/types";
import { authenticatedContext, errorResponse, jsonBody, jsonResponse } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { ownerId, repository } = await authenticatedContext(request);
    const body = await jsonBody(request);
    await repository.consumeRate(ownerId, "command", 60);
    // Identity always comes from native sign-in; body owner/user fields are ignored.
    const data = await repository.execute(ownerId, body.command as Command, body.revision as number, body.generation as string);
    return jsonResponse(data);
  } catch (error) { return errorResponse(error); }
}
