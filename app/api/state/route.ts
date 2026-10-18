import { authenticatedContext, errorResponse, jsonResponse, readWithTimeout } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { ownerId, repository, identity } = await authenticatedContext(request);
    const data = await readWithTimeout(repository.get(ownerId));
    return jsonResponse({ ...data, identity });
  } catch (error) { return errorResponse(error); }
}
