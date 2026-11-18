import { getAuth } from '../../../lib/auth';
import { errorResponse, jsonBody, jsonResponse } from '../_shared';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    await jsonBody(request, 100);
    if (process.env.AZURE_AUTH_MODE === 'email') {
      const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
      if (!response.ok) return jsonResponse({ error: 'Não foi possível sair.' }, 503);
      return jsonResponse({ redirect: '/' }, 200, response.headers);
    }
    return jsonResponse({ redirect: '/.auth/logout?post_logout_redirect_uri=%2F' });
  } catch (error) { return errorResponse(error); }
}
