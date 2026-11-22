import { aiConfig } from '../../../lib/ai-config';
import { interpretPage, textInterpretationConfigured } from '../../../lib/document-interpretation';
import { createHash } from 'node:crypto';
import { documentDrafts } from '../../../lib/document-drafts';
import { MAX_DOCUMENT_BYTES, readDocument, documentSignature } from '../../../lib/document-reader';
import { RepositoryError } from '../../../lib/repository';
import { transcribeImage } from '../../../lib/document-vision';
import { visionConfigured, privateVisionConfig } from '../../../lib/document-vision-config';
import { offerSecondReadings, redeemSecondReading } from '../../../lib/document-offers';
import { authenticatedContext, boundedBody, errorResponse, jsonResponse, requireSameOrigin } from '../_shared';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { ownerId, repository } = await authenticatedContext(request);
    const mime = request.headers.get('content-type') ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime))
      throw new RepositoryError(415, 'Selecione JPEG, PNG, WebP ou PDF.');
    const preview = mime === 'application/pdf' && request.headers.get('x-document-action') === 'preview';
    await repository.consumeRate(ownerId, preview ? 'document-preview' : 'document', 5);
    const bytes = Buffer.from(await boundedBody(request, MAX_DOCUMENT_BYTES, 15_000));
    if (!documentSignature(bytes, mime)) throw new RepositoryError(415, 'O conteúdo não corresponde ao formato informado.');
    if (preview) {
      try { return jsonResponse({images:(await readDocument(bytes,mime,true)).map(p=>p.thumbnail)}); }
      catch { throw new RepositoryError(422,'Não foi possível renderizar as páginas do PDF.'); }
    }
    const useVision = request.headers.get('x-document-vision-consent') === 'once';
    const config = privateVisionConfig();
    const hash = createHash('sha256').update(bytes).digest('hex');
    const interpret = request.headers.get('x-document-action') === 'interpret';
    if (interpret || useVision) {
      const textConfig = aiConfig();
      if (interpret && (request.headers.get('x-document-text-consent') !== 'once' || !textInterpretationConfigured(textConfig)))
        throw new RepositoryError(403,'Interpretação de texto indisponível ou sem consentimento.');
      if (interpret && useVision) throw new RepositoryError(400,'Escolha uma modalidade de leitura.');
      if (!interpret && !visionConfigured(config)) throw new RepositoryError(503,'Groq indisponível. Continue com a leitura local.');
      const page = interpret ? Number(request.headers.get('x-document-page')) : redeemSecondReading(request.headers.get('x-document-offer') ?? '',ownerId,hash);
      if (!page || !Number.isInteger(page) || page < 1 || page > 4) throw new RepositoryError(400,'Autorização expirada ou inválida. Faça outra leitura local para solicitar uma nova comparação.');
      const limit = Number(process.env.AI_GLOBAL_DAILY_LIMIT || 200);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new RepositoryError(503,'Limite de IA inválido.');
      await repository.consumeRate('ai:'+ownerId,'ai-user',20,86_400_000);
      await repository.consumeRate('system:ai-budget','ai-global',limit,86_400_000);
      try {
        if (interpret) {
          const source = (await readDocument(bytes,mime))[page-1];
          if (!source) throw Error();
          return jsonResponse({page,...await interpretPage(source.text,true,textConfig,fetch,page)});
        }
        let image = bytes;
        let imageType = mime;
        if (mime === 'application/pdf') {
          const thumbnail = (await readDocument(bytes, mime, true))[page - 1]?.thumbnail;
          if (!thumbnail) throw Error();
          image = Buffer.from(thumbnail, 'base64');
          imageType = 'image/jpeg';
        }
        const reading = await transcribeImage(image,imageType,true,config);
        return jsonResponse({ page, text: reading.text, rows: documentDrafts([reading]).map(row => ({...row,page})) });
      } catch { throw new RepositoryError(503,'Segunda leitura indisponível. A leitura local e suas edições continuam disponíveis.'); }
    }
    try {
      const pages = await readDocument(bytes, mime);
      const rows = documentDrafts(pages);
      return jsonResponse({ hash, pages, rows, textAvailable:textInterpretationConfigured(aiConfig()), offers: visionConfigured(config) ? offerSecondReadings(ownerId,hash,rows,pages) : [] });
    } catch { throw new RepositoryError(422, 'Falha na leitura. Confira a nitidez, o tamanho e o limite de quatro páginas.'); }
  } catch (err) { return errorResponse(err); }
}
