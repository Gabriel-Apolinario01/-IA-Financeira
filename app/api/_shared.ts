import { getAzureUser } from "../azure-auth";
import { azurePostgresGateway, hasAzurePostgresConfig } from "../../lib/azure-postgres";
import { FinanceRepository, RepositoryError } from "../../lib/repository";

export async function authenticatedContext(request: Request) {
  const user = getAzureUser(request.headers);
  if (!user) throw new RepositoryError(401, "Entre com sua conta Microsoft para continuar.");
  if (!hasAzurePostgresConfig()) throw new RepositoryError(503, "O banco Azure ainda não está configurado.");
  return {
    ownerId: user.userId,
    identity: { displayName: user.displayName, localPreview: false },
    repository: new FinanceRepository(azurePostgresGateway()),
  };
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RepositoryError(403, "Esta alteração precisa ser enviada pelo próprio aplicativo.");
  }
}

export async function jsonBody(request: Request, maxBytes = 32_768): Promise<Record<string, unknown>> {
  requireSameOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new RepositoryError(415, "Envie os dados no formato JSON.");
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new RepositoryError(413, "O conteúdo enviado é muito grande.");
  if (!request.body) throw new RepositoryError(400, "Envie os dados da alteração.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expires = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel();
      reject(new RepositoryError(408, "O envio demorou demais. Tente novamente."));
    }, 5_000);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), expires]);
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        void reader.cancel();
        throw new RepositoryError(413, "O conteúdo enviado é muito grande.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(400, "O JSON enviado é inválido.");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

export function jsonResponse(value: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("cache-control", "private, no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  headers.set("vary", "Cookie");
  return new Response(JSON.stringify(value), { status, headers });
}

export function errorResponse(error: unknown): Response {
  const known = error instanceof RepositoryError;
  return jsonResponse(
    { error: known ? error.message : "Não foi possível concluir agora. Tente novamente." },
    known ? error.status : 503,
    known && error.status === 429 ? { "retry-after": "60" } : undefined,
  );
}

export async function readWithTimeout<T>(operation: Promise<T>, milliseconds = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RepositoryError(504, "A leitura demorou demais. Tente novamente.")), milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
