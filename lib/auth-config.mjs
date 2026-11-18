import { betterAuth } from 'better-auth';

export function createEmailAuth(database) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error('Configure BETTER_AUTH_SECRET (32 caracteres ou mais) e BETTER_AUTH_URL.');
  }
  const url = new URL(baseURL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.origin !== baseURL) {
    throw new Error('BETTER_AUTH_URL deve ser a origem HTTPS pública, sem caminho; HTTP somente em localhost.');
  }
  return betterAuth({
    appName: 'IA Financeira', secret, baseURL, database,
    trustedOrigins: [url.origin],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true, storage: 'database', window: 60, max: 60,
      customRules: { '/sign-up/email': { window: 60, max: 10 }, '/sign-in/email': { window: 60, max: 30 } },
    },
    advanced: {
      useSecureCookies: url.protocol === 'https:',
      // Shared limit: never trust a client-supplied X-Forwarded-For for authentication.
      ipAddress: { ipAddressHeaders: [] },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    logger: { level: 'error', log: () => console.error('authentication_service_error') },
  });
}
