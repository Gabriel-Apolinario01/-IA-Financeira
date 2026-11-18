import { createHmac } from 'node:crypto';
import { getAuth } from '../../../../lib/auth';
import { azurePostgresGateway } from '../../../../lib/azure-postgres';
import { FinanceRepository, RepositoryError } from '../../../../lib/repository';
import { errorResponse, jsonBody, jsonResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const endpoints = new Set(['sign-in/email', 'sign-up/email', 'sign-out', 'get-session', 'change-password']);

async function handle(request: Request) {
  try {
    if (process.env.AZURE_AUTH_MODE !== 'email') throw new RepositoryError(503, 'O acesso por e-mail ainda não está configurado.');
    const endpoint = new URL(request.url).pathname.replace(/^\/api\/auth\//, '');
    if (!endpoints.has(endpoint)) return jsonResponse({ error: 'Recurso indisponível.' }, 404);
    const auth = getAuth();
    let forwarded = request;
    if (request.method === 'POST') {
      const body = await jsonBody(request, 4_096);
      if (endpoint === 'sign-up/email' && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80)) {
        throw new RepositoryError(400, 'Informe um nome com até 80 caracteres.');
      }
      if (endpoint === 'sign-in/email' || endpoint === 'sign-up/email') {
        if (typeof body.email !== 'string' || body.email.length > 254) throw new RepositoryError(400, 'Informe um e-mail válido.');
        body.email = body.email.trim().toLowerCase();
        const identity = createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(body.email as string).digest('hex');
        const repository = new FinanceRepository(azurePostgresGateway());
        await repository.consumeRate('system:auth', 'auth', 60);
        await repository.consumeRate(`auth:${identity}`, 'auth', 15, 900_000);
      }
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      forwarded = new Request(request.url, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    const response = await auth.handler(forwarded);
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('x-content-type-options', 'nosniff');
    // Library errors may contain database details. Do not send raw errors to the browser.
    if (response.status >= 500) return jsonResponse({ error: 'O acesso está indisponível. Tente novamente.' }, 503);
    return response;
  } catch (error) { return errorResponse(error); }
}
export const GET = handle;
export const POST = handle;
