import { createEmailAuth } from './auth-config.mjs';
import { azurePostgresPool } from './azure-postgres';

let instance: ReturnType<typeof createEmailAuth> | undefined;
export function getAuth() {
  if (process.env.AZURE_AUTH_MODE !== 'email') throw new Error('Login por e-mail desativado.');
  return instance ??= createEmailAuth(azurePostgresPool());
}
