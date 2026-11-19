import { azurePostgresPool, hasAzurePostgresConfig } from '../../../lib/azure-postgres';
import { aiConfig } from '../../../lib/ai-config';
import { getAuth } from '../../../lib/auth';
import { jsonResponse } from '../_shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  let database = false, authentication = false;
  try {
    if (hasAzurePostgresConfig()) {
      await azurePostgresPool().query('SELECT 1 FROM workspaces LIMIT 1');
      database = true;
    }
    if (process.env.AZURE_AUTH_MODE === 'email') {
      getAuth();
      await azurePostgresPool().query('SELECT 1 FROM "user", "session", "account", "rateLimit" LIMIT 0');
      authentication = database;
    }
    else authentication = process.env.AZURE_AUTH_MODE === 'app-service' && process.env.WEBSITE_AUTH_ENABLED === 'true' && Boolean(process.env.AZURE_TENANT_ID);
  } catch { /* Readiness reports no infrastructure or credential details. */ }
  const ai = aiConfig();
  const aiConfigured = ai.enabled === 'true' && Boolean(ai.key && ai.model);
  return jsonResponse({ status: database && authentication ? 'ready' : 'unavailable', database, authentication, aiConfigured }, database && authentication ? 200 : 503);
}
