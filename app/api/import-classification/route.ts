import { assistImportClassification, validateClassificationRequest } from '../../../lib/import-assistance';
import { RepositoryError } from '../../../lib/repository';
import { authenticatedContext, errorResponse, jsonBody, jsonResponse } from '../_shared';

export const dynamic='force-dynamic';
export async function POST(request: Request) {
  try {
    const {ownerId,repository}=await authenticatedContext(request);
    const body=await jsonBody(request,4096);
    try {validateClassificationRequest(body);} catch(error) {throw new RepositoryError(400,(error as Error).message);}
    await repository.consumeRate(ownerId,'import-classification',5);
    const result=await assistImportClassification(body,{
      key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL,
      // Separate, opt-in configuration: aggregate-diagnosis consent/config is insufficient.
      enabled:process.env.IMPORT_AI_ENABLED,
    });
    return jsonResponse(result);
  } catch(error) {return errorResponse(error);}
}
