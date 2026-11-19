import { createHash } from 'node:crypto';
import { documentDrafts } from '../../../lib/document-drafts';
import { MAX_DOCUMENT_BYTES, readDocument, documentSignature } from '../../../lib/document-reader';
import { RepositoryError } from '../../../lib/repository';
import { authenticatedContext, boundedBody, errorResponse, jsonResponse, requireSameOrigin } from '../_shared';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { ownerId, repository } = await authenticatedContext(request);
    const mime = request.headers.get('content-type') ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime))
      throw new RepositoryError(415, 'Selecione JPEG, PNG, WebP ou PDF.');
    await repository.consumeRate(ownerId, 'document', 5);
    const bytes = Buffer.from(await boundedBody(request, MAX_DOCUMENT_BYTES, 15_000));
    if (!documentSignature(bytes, mime)) throw new RepositoryError(415, 'O conteúdo não corresponde ao formato informado.');
    try {
      const pages = await readDocument(bytes, mime);
      const hash = createHash('sha256').update(bytes).digest('hex');
      return jsonResponse({ hash, pages, rows: documentDrafts(pages) });
    } catch { throw new RepositoryError(422, 'Falha na leitura. Confira a nitidez, o tamanho e o limite de quatro páginas.'); }
  } catch (err) { return errorResponse(err); }
}
