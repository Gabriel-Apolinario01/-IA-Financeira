import { createHash } from 'node:crypto';
import { documentDrafts } from '../../../lib/document-drafts';
import { MAX_DOCUMENT_BYTES, readDocument, documentSignature } from '../../../lib/document-reader';
import { RepositoryError } from '../../../lib/repository';
import { transcribeImage, visionConfigured } from '../../../lib/document-vision';
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
    if (mime === 'application/pdf' && request.headers.get('x-document-action') === 'preview') {
      try { return jsonResponse({images:(await readDocument(bytes,mime,true)).map(p=>p.thumbnail)}); }
      catch { throw new RepositoryError(422,'Não foi possível renderizar as páginas do PDF.'); }
    }
    const useVision = request.headers.get('x-document-vision-consent') === 'once';
    const config = { key:process.env.GROQ_API_KEY, model:process.env.GROQ_VISION_MODEL, enabled:process.env.DOCUMENT_VISION_ENABLED };
    if (useVision && (!mime.startsWith('image/') || !visionConfigured(config)))
      throw new RepositoryError(400,'Visão externa indisponível. Escolha o OCR local.');
    if (useVision) {
      const limit = Number(process.env.AI_GLOBAL_DAILY_LIMIT || 200);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new RepositoryError(503,'Limite de IA inválido.');
      await repository.consumeRate('ai:'+ownerId,'ai-user',20,86_400_000);
      await repository.consumeRate('system:ai-budget','ai-global',limit,86_400_000);
    }
    try {
      const pages = useVision ? [await transcribeImage(bytes,mime,true,config)] : await readDocument(bytes, mime);
      const hash = createHash('sha256').update(bytes).digest('hex');
      return jsonResponse({ hash, pages, rows: documentDrafts(pages) });
    } catch { throw new RepositoryError(422, 'Falha na leitura. Confira a nitidez, o tamanho e o limite de quatro páginas.'); }
  } catch (err) { return errorResponse(err); }
}
