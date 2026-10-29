import { executeFinanceCommand } from "./imports";
import { emptyState } from "./demo";
import type { Command, FinanceState } from "./types";

export type SqlValue = string | number | null;
export type SqlStatement = { sql: string; values: SqlValue[] };
export interface SqlGateway {
  get<T>(sql: string, values: SqlValue[]): Promise<T | null>;
  run(sql: string, values: SqlValue[]): Promise<{ changes: number }>;
  batch(statements: SqlStatement[]): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export type Snapshot = { state: FinanceState; revision: number; generation: string };
type WorkspaceRow = {
  owner_id: string; generation: string; state_json: string; revision: number; processed_json: string;
  created_at: string; updated_at: string;
};
type Receipt = { hash: string; revision: number };
type Receipts = Record<string, Receipt>;
const SELECT = "SELECT owner_id, generation, state_json, revision, processed_json, created_at, updated_at FROM workspaces WHERE owner_id = ?";
const MAX_AGGREGATE_BYTES = 2_000_000;

function owner(value: string): string {
  if (!value || value.length > 512) throw new RepositoryError(401, "Entre na sua conta para continuar.");
  return value;
}

function snapshot(row: WorkspaceRow): Snapshot {
  return { state: JSON.parse(row.state_json) as FinanceState, revision: row.revision, generation: row.generation };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

async function commandHash(command: Command): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(command)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function replay(row: WorkspaceRow, commandId: string, hash: string): Snapshot | null {
  const receipts = JSON.parse(row.processed_json) as Receipts;
  if (!Object.hasOwn(receipts, commandId)) return null;
  if (receipts[commandId].hash !== hash) {
    throw new RepositoryError(409, "Este envio já foi usado para outra alteração. Atualize a página e tente novamente.");
  }
  return snapshot(row);
}

export class FinanceRepository {
  constructor(private readonly db: SqlGateway, private readonly now: () => Date = () => new Date()) {}

  private async find(ownerId: string): Promise<WorkspaceRow | null> {
    return this.db.get<WorkspaceRow>(SELECT, [owner(ownerId)]);
  }

  async get(ownerId: string): Promise<Snapshot> {
    return snapshot(await this.getOrCreate(ownerId));
  }

  private async getOrCreate(ownerId: string): Promise<WorkspaceRow> {
    const identity = owner(ownerId);
    const existing = await this.find(identity);
    if (existing) return existing;
    const timestamp = this.now().toISOString();
    await this.db.run(
      "INSERT INTO workspaces (owner_id, generation, state_json, revision, processed_json, created_at, updated_at) VALUES (?, ?, ?, 0, '{}', ?, ?) ON CONFLICT(owner_id) DO NOTHING",
      [identity, crypto.randomUUID(), JSON.stringify(emptyState()), timestamp, timestamp],
    );
    const result = await this.find(identity);
    if (!result) throw new RepositoryError(503, "Não foi possível abrir sua conta agora. Tente novamente.");
    return result;
  }

  async execute(ownerId: string, command: Command, expectedRevision: number, expectedGeneration: string): Promise<Snapshot> {
    owner(ownerId);
    if (typeof expectedGeneration !== 'string' || !expectedGeneration || expectedGeneration.length > 120) {
      throw new RepositoryError(409, 'Atualize a página para carregar a versão atual da conta.');
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new RepositoryError(400, "A versão dos dados é inválida. Atualize a página.");
    }
    if (!command || typeof command !== "object" || Array.isArray(command)
      || typeof command.id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(command.id)
      || typeof command.type !== "string" || !command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) {
      throw new RepositoryError(400, "A alteração enviada é inválida.");
    }
    const hash = await commandHash(command);
    const row = await this.getOrCreate(ownerId);
    if (row.generation !== expectedGeneration) {
      throw new RepositoryError(409, 'Esta conta foi reiniciada. Atualize a página antes de fazer novas alterações.');
    }
    const previous = replay(row, command.id, hash);
    if (previous) return previous;
    if (row.revision !== expectedRevision) {
      throw new RepositoryError(409, "Seus dados mudaram em outra janela. Atualize e repita a alteração.");
    }
    let state: FinanceState;
    try {
      state = await executeFinanceCommand(snapshot(row).state, command);
    } catch (error) {
      throw new RepositoryError(400, error instanceof Error ? error.message : "Confira os dados informados.");
    }
    const receipts = JSON.parse(row.processed_json) as Receipts;
    Object.defineProperty(receipts, command.id, { value: { hash, revision: row.revision + 1 }, enumerable: true });
    const stateJson = JSON.stringify(state);
    const processedJson = JSON.stringify(receipts);
    if (new TextEncoder().encode(stateJson + processedJson).byteLength > MAX_AGGREGATE_BYTES) {
      throw new RepositoryError(413, "Esta conta atingiu o limite de armazenamento do MVP. Exporte seus dados antes de continuar.");
    }
    const updated = await this.db.run(
      "UPDATE workspaces SET state_json = ?, processed_json = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ? AND generation = ?",
      [stateJson, processedJson, this.now().toISOString(), ownerId, expectedRevision, row.generation],
    );
    if (updated.changes === 1) return { state, revision: expectedRevision + 1, generation: row.generation };
    const latest = await this.find(ownerId);
    if (latest && latest.generation === expectedGeneration) {
      const duplicate = replay(latest, command.id, hash);
      if (duplicate) return duplicate;
    }
    throw new RepositoryError(409, "Seus dados mudaram em outra janela. Atualize e repita a alteração.");
  }

  async export(ownerId: string) {
    const row = await this.find(ownerId);
    return {
      app: "IA Financeira", schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      ...(row ? snapshot(row) : { state: emptyState(), revision: 0 }),
    };
  }

  async delete(ownerId: string): Promise<void> {
    const identity = owner(ownerId);
    await this.db.batch([
      { sql: "DELETE FROM workspaces WHERE owner_id = ?", values: [identity] },
      { sql: "DELETE FROM rate_limits WHERE owner_id = ?", values: [identity] },
    ]);
  }

  async consumeRate(ownerId: string, bucket: "command" | "diagnosis", limit: number, windowMs = 60_000): Promise<void> {
    const windowStart = Math.floor(this.now().getTime() / windowMs) * windowMs;
    const row = await this.db.get<{ request_count: number }>(
      "INSERT INTO rate_limits (owner_id, bucket, window_start, request_count) VALUES (?, ?, ?, 1) ON CONFLICT(owner_id, bucket) DO UPDATE SET request_count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.request_count + 1 ELSE 1 END, window_start = excluded.window_start RETURNING request_count",
      [owner(ownerId), bucket, windowStart],
    );
    if (!row || row.request_count > limit) throw new RepositoryError(429, "Muitas tentativas em pouco tempo. Aguarde um minuto.");
  }
}
