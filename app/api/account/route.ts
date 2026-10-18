import { RepositoryError } from "../../../lib/repository";
import { authenticatedContext, errorResponse, jsonBody, jsonResponse, readWithTimeout } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { ownerId, repository } = await authenticatedContext(request);
    const data = await readWithTimeout(repository.export(ownerId));
    return jsonResponse(data, 200, { "content-disposition": 'attachment; filename="ia-financeira-dados.json"' });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { ownerId, repository } = await authenticatedContext(request);
    const body = await jsonBody(request, 1_024);
    if (body.confirmation !== "EXCLUIR") throw new RepositoryError(400, "Digite EXCLUIR para confirmar a exclusão dos dados do aplicativo.");
    await repository.delete(ownerId);
    return jsonResponse({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
