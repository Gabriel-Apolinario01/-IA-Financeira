import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { FinanceRepository, RepositoryError, type SqlGateway } from "../lib/repository";
import type { Command } from "../lib/types";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE workspaces (owner_id TEXT PRIMARY KEY, generation TEXT NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, processed_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE rate_limits (owner_id TEXT NOT NULL, bucket TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id, bucket));
  `);
  const gateway: SqlGateway = {
    async get<T>(sql: string, values: (string | number | null)[]) { return (db.prepare(sql).get(...values) as T | undefined) ?? null; },
    async run(sql, values) { return { changes: Number(db.prepare(sql).run(...values).changes) }; },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        for (const { sql, values } of statements) db.prepare(sql).run(...values);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, gateway, repository: new FinanceRepository(gateway) };
}

// Read the same workspace generation a browser receives before sending a command.
async function execute(repo: FinanceRepository, ownerId: string, command: Command, revision: number) {
  const generation = (await repo.get(ownerId)).generation;
  return repo.execute(ownerId, command, revision, generation);
}

const transaction = (id: string, amount = 12_300): Command => ({
  id: `save-${id}`, type: "transaction.save", payload: {
    id, description: "Parcela", amount, type: "expense", category: "dividas",
    date: "2026-10-06", status: "realized", expenseKind: "fixed",
  },
});
const goal = (id: string): Command => ({ id: `goal-${id}`, type: "goal.save", payload: {
  id, name: "Reserva planejada", kind: "general", target: 100_000, deadline: null,
  initialAmount: 20_000, initialDate: "2026-10-01", essentialBase: null, reserveMonths: null, archived: false,
} });
const debt = (id: string, transactionId: string): Command => ({ id: `debt-${id}`, type: "debt.save", payload: {
  id, name: "Dívida", balance: 90_000, installment: 12_300, dueDate: "2026-10-06",
  interestRate: null, interestUnit: "unknown", transactionId,
} });
const status = (code: number) => (error: unknown) => error instanceof RepositoryError && error.status === code;

test("an empty account persists across repository instances and never receives demo data", async () => {
  const { db, gateway, repository } = database();
  try {
    const first = await repository.get("owner-A");
    assert.equal(first.revision, 0);
    assert.equal(first.state.transactions.length, 0);
    assert.equal(first.state.profile.onboardingDone, false);
    await execute(repository, "owner-A", transaction("expense-A"), 0);
    const restored = await new FinanceRepository(gateway).get("owner-A");
    assert.equal(restored.revision, 1);
    assert.equal(restored.state.transactions[0].amount, 12_300);
    assert.equal((await repository.get("owner-B")).state.transactions.length, 0);
  } finally { db.close(); }
});

test("owner B cannot read, delete, or link owner A records even with known IDs", async () => {
  const { db, repository } = database();
  try {
    await execute(repository, "owner-A", transaction("secret-expense"), 0);
    await execute(repository, "owner-A", goal("secret-goal"), 1);
    await assert.rejects(execute(repository, "owner-B", { id: "attack-delete", type: "transaction.delete", payload: { id: "secret-expense", ownerId: "owner-A" } }, 0), status(400));
    await assert.rejects(execute(repository, "owner-B", debt("foreign-debt", "secret-expense"), 0), status(400));
    await assert.rejects(execute(repository, "owner-B", { id: "attack-movement", type: "movement.add", payload: { id: "movement-B", goalId: "secret-goal", type: "withdrawal", amount: 100, date: "2026-10-06", note: "" } }, 0), status(400));
    // Same ID in another aggregate creates only a separate B-owned object.
    await execute(repository, "owner-B", transaction("secret-expense", 50), 0);
    assert.equal((await repository.get("owner-A")).state.transactions[0].amount, 12_300);
    const exportedB = JSON.stringify(await repository.export("owner-B"));
    assert.ok(!exportedB.includes("secret-goal"));
    assert.equal((await repository.get("owner-A")).revision, 2);
    await assert.rejects(repository.get(""), status(401));
  } finally { db.close(); }
});

test("command receipts deduplicate retries and reject changed payloads", async () => {
  const { db, repository } = database();
  try {
    const command = transaction("expense-A");
    const first = await execute(repository, "A", command, 0);
    const retry = await execute(repository, "A", command, 0);
    assert.deepEqual(retry, first);
    await assert.rejects(execute(repository, "A", { ...command, payload: { ...command.payload, amount: 20_000 } }, 1), status(409));
    assert.equal((await repository.get("A")).state.transactions.length, 1);
    await execute(repository, "A", goal("goal-A"), 1);
    const movement: Command = { id: "move-1", type: "movement.add", payload: { id: "m-1", goalId: "goal-A", type: "deposit", amount: 2_500, date: "2026-10-06", note: "Aporte" } };
    await execute(repository, "A", movement, 2);
    await execute(repository, "A", movement, 2);
    assert.equal((await repository.get("A")).state.movements.length, 1);
    assert.equal((await repository.get("A")).revision, 3);
  } finally { db.close(); }
});

test("concurrent updates use compare-and-swap; a stale revision cannot overwrite data", async () => {
  const { db, repository } = database();
  try {
    await repository.get("A");
    const results = await Promise.allSettled([
      execute(repository, "A", transaction("first"), 0),
      execute(repository, "A", transaction("second"), 0),
    ]);
    assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
    const failed = results.find(item => item.status === "rejected");
    assert.ok(failed?.status === "rejected" && status(409)(failed.reason));
    const after = await repository.get("A");
    assert.equal(after.state.transactions.length, 1);
    assert.equal(after.revision, 1);
    const loser = results[0].status === "rejected" ? "first" : "second";
    await execute(repository, "A", transaction(loser), 1);
    assert.equal((await repository.get("A")).state.transactions.length, 2);
  } finally { db.close(); }
});

test("a double submission racing at the same revision is applied exactly once", async () => {
  const { db, repository } = database();
  try {
    await repository.get("A");
    const results = await Promise.all([execute(repository, "A", transaction("same"), 0), execute(repository, "A", transaction("same"), 0)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0].revision, 1);
  } finally { db.close(); }
});

test("debt linkage validates ownership and deleting a transaction detaches its debt", async () => {
  const { db, repository } = database();
  try {
    await execute(repository, "A", transaction("payment"), 0);
    await execute(repository, "A", debt("loan", "payment"), 1);
    const before = await repository.get("A");
    assert.equal(before.state.transactions.length, 1, "linking debt must not duplicate payment");
    await execute(repository, "A", { id: "delete-payment", type: "transaction.delete", payload: { id: "payment" } }, 2);
    const after = await repository.get("A");
    assert.equal(after.state.debts[0].transactionId, null);
    assert.equal(after.state.transactions.length, 0);
  } finally { db.close(); }
});

test("export includes all owned collections; deletion removes workspace and rate data only for owner", async () => {
  const { db, repository } = database();
  try {
    await execute(repository, "A", transaction("a"), 0);
    await execute(repository, "A", goal("a"), 1);
    await execute(repository, "B", transaction("b"), 0);
    await repository.consumeRate("A", "command", 10);
    await repository.consumeRate("B", "command", 10);
    const exported = await repository.export("A");
    assert.deepEqual(Object.keys(exported.state).sort(), ["profile", "transactions", "budgets", "goals", "movements", "debts", "savingActions"].sort());
    assert.equal(exported.state.goals.length, 1);
    assert.ok(!JSON.stringify(exported).includes("processed_json"));
    await repository.delete("A");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE owner_id = ?").get("A")?.count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE owner_id = ?").get("A")?.count, 0);
    assert.equal((await repository.get("B")).state.transactions.length, 1);
    assert.equal((await repository.export("A")).state.transactions.length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE owner_id = ?").get("A")?.count, 0, "export must not recreate a deleted workspace");
  } finally { db.close(); }
});

test("a pre-deletion mutation cannot write into a recreated workspace", async () => {
  const { db, gateway, repository } = database();
  try {
    await repository.get("A");
    let release: () => void = () => {};
    let reached: () => void = () => {};
    const paused = new Promise<void>(resolve => { release = resolve; });
    const updating = new Promise<void>(resolve => { reached = resolve; });
    const delayedGateway: SqlGateway = { ...gateway, async run(sql, values) {
      if (sql.startsWith("UPDATE workspaces")) { reached(); await paused; }
      return gateway.run(sql, values);
    } };
    const pending = execute(new FinanceRepository(delayedGateway), "A", transaction("old"), 0);
    await updating;
    await repository.delete("A");
    await repository.get("A");
    release();
    await assert.rejects(pending, status(409));
    assert.equal((await repository.get("A")).state.transactions.length, 0);
  } finally { db.close(); }
});

test("rate limits are atomic, separated by owner and bucket, and reset next window", async () => {
  const { db, gateway } = database();
  try {
    let time = Date.UTC(2026, 9, 6, 12, 0, 0);
    const repository = new FinanceRepository(gateway, () => new Date(time));
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => repository.consumeRate("A", "diagnosis", 3)));
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 3);
    await assert.rejects(repository.consumeRate("A", "diagnosis", 3), status(429));
    await repository.consumeRate("B", "diagnosis", 3);
    await repository.consumeRate("A", "command", 3);
    time += 60_000;
    await repository.consumeRate("A", "diagnosis", 3);
  } finally { db.close(); }
});

test("invalid commands never advance the persisted revision", async () => {
  const { db, repository } = database();
  try {
    await assert.rejects(execute(repository, "A", transaction("negative", -1), 0), status(400));
    await assert.rejects(execute(repository, "A", { id: "bad", type: "unknown", payload: {} }, 0), status(400));
    await assert.rejects(execute(repository, "A", transaction("x"), -1), status(400));
    assert.equal((await repository.get("A")).revision, 0);
  } finally { db.close(); }
});


test("old browser generation is rejected even when the recreated revision matches", async () => {
  const { db, repository } = database();
  try {
    const old = await execute(repository, "A", transaction("old-record"), 0);
    await repository.delete("A");
    const recreated = await execute(repository, "A", transaction("new-record"), 0);
    assert.equal(old.revision, recreated.revision);
    assert.notEqual(old.generation, recreated.generation);
    await assert.rejects(repository.execute("A", transaction("old-record", 500), old.revision, old.generation), status(409));
    await assert.rejects(repository.execute("A", transaction("missing-generation"), recreated.revision, ""), status(409));
    const after = await repository.get("A");
    assert.deepEqual(after, recreated);
  } finally { db.close(); }
});
