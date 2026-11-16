import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { FinanceRepository, RepositoryError, type SqlGateway } from "../lib/repository";
import type { Command } from "../lib/types";
import { monthMetrics } from '../lib/finance';

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

for (const source of ['tsv','ofx'] as const) {
  test(`reviewed ${source} preserves nature and dashboard totals after repository reload`, async () => {
    const {db,gateway,repository}=database();
    try {
      const content=source==='tsv'?'data\tdescricao\tvalor\n2026-10-06\tRenda ficticia\t3000,00\n2026-10-06\tCompra ficticia\t-500,00\n2026-10-06\tTransferencia ficticia\t-800,00':
        '<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>'+[['3000.00','Renda'],['-500.00','Compra'],['-800.00','Transferencia']].map(([amount,memo],i)=>`<STMTTRN><DTPOSTED>20261006<TRNAMT>${amount}<FITID>fixture${i}<MEMO>${memo}</STMTTRN>`).join('')+'</BANKTRANLIST></STMTRS></OFX>';
      const lines=source==='tsv'?[2,3,4]:[1,2,3];
      const payload={name:`ficticio.${source}`,content,account:'Principal',locale:'br',accepted:lines,natures:Object.fromEntries(lines.map((line,i)=>[line,['income','expense','transfer'][i]]))};
      await execute(repository,'A',{id:'fixture',type:'import.commit',payload},0);
      const restored=await new FinanceRepository(gateway).get('A');
      const metrics=monthMetrics(restored.state,'2026-10');
      assert.equal(metrics.income,300000);assert.equal(metrics.expenses,50000);assert.equal(metrics.result,250000);assert.equal(metrics.cashResult,170000);
      await assert.rejects(execute(repository,'A',{id:'again',type:'import.commit',payload},1),status(400));
    } finally {db.close();}
  });
}

test('reviewed CSV persists edited fields and consistent totals through partial imports, reload, undo and restore', async () => {
  const { db, gateway, repository } = database();
  try {
    const content='data;descricao;valor\n2026-10-06;Entrada;3000,00\n2026-10-06;Compra;-200,00\n2026-10-06;Transferencia;-800,00\n2026-10-06;Fatura;-200,00\n2026-10-06;Estorno;50,00';
    const payload={name:'revisao.csv',content,account:'Principal',locale:'br',accepted:[2,3,4,5],natures:{'2':'income','3':'expense','4':'transfer','5':'invoice_payment'},edits:{'3':{description:'Compra revisada',category:'lazer'}}};
    const first=await execute(repository,'review',{id:'review1',type:'import.commit',payload},0);
    const purchase=first.state.transactions.find(t=>t.description==='Compra revisada')!;
    assert.equal(purchase.category,'lazer');assert.equal(purchase.origin?.originalDescription,'Compra');
    assert.equal(monthMetrics(first.state,'2026-10').result,280000);
    const refund={name:'revisao.csv',content,account:'Principal',locale:'br',accepted:[6],natures:{'6':'refund'},edits:{'6':{refundOf:purchase.id}}};
    const second=await execute(repository,'review',{id:'review2',type:'import.commit',payload:refund},1);
    const restored=await new FinanceRepository(gateway).get('review');
    assert.deepEqual(restored.state,JSON.parse(JSON.stringify(second.state)));
    assert.equal(monthMetrics(restored.state,'2026-10').expenses,15000);
    assert.equal(monthMetrics(restored.state,'2026-10').categoryExpenses.lazer,15000);
    await assert.rejects(execute(repository,'review',{id:'replay',type:'import.commit',payload:refund},2),status(400));
    await assert.rejects(execute(repository,'review',{id:'undo-original',type:'import.revert',payload:{id:'review1'}},2),status(400));
    const undone=await execute(repository,'review',{id:'undo-refund',type:'import.revert',payload:{id:'review2'}},2);
    assert.equal(monthMetrics(undone.state,'2026-10').expenses,20000);
    const redone=await execute(repository,'review',{id:'restore-refund',type:'import.restore',payload:{id:'review2'}},3);
    assert.equal(monthMetrics(redone.state,'2026-10').expenses,15000);
    assert.equal((await repository.get('other-user')).state.transactions.length,0);
    assert.equal((await repository.export('review')).state.transactions.length,5);
  } finally { db.close(); }
});

test('review edits reject reserved fields, invalid categories and unlinked refunds atomically', async () => {
  const { db, repository } = database();
  try {
    const payload={name:'a.csv',account:'Principal',locale:'br',content:'data;descricao;valor\n2026-10-06;Teste;12,34',accepted:[2],natures:{'2':'income'}};
    for (const edits of [{'2':{origin:{ownerId:'victim'}}},{'2':{category:'invalid'}},{'2':{description:''}},{'3':{description:'extra'}}]) {
      await assert.rejects(execute(repository,'A',{id:'invalid',type:'import.commit',payload:{...payload,edits}},0),status(400));
      assert.equal((await repository.get('A')).revision,0);
    }
    await assert.rejects(execute(repository,'A',{id:'refund',type:'import.commit',payload:{...payload,natures:{'2':'refund'}}},0),status(400));
  } finally { db.close(); }
});

for (const nature of ['income', 'expense', 'transfer', 'invoice_payment', 'refund', 'unidentified'] as const) {
  test(`server persists and reloads the valid nature ${nature}`, async () => {
    const { db, gateway, repository } = database();
    try {
      const command = transaction('nature'); command.payload.nature = nature;
      await execute(repository, 'A', command, 0);
      const restored = await new FinanceRepository(gateway).get('A');
      assert.equal(restored.state.transactions[0].nature, nature);
      const exported = JSON.parse(JSON.stringify(await repository.export('A')));
      assert.equal(exported.state.transactions[0].nature, nature);
    } finally { db.close(); }
  });
}

test('server rejects invalid nature values without changing the persisted revision', async () => {
  const { db, repository } = database();
  try {
    await execute(repository, 'A', transaction('legacy'), 0);
    for (const nature of ['invalid-secret-value', null, undefined, 42, true, [], {}, { type:'income' }]) {
      const command = transaction('invalid'); command.payload.nature = nature;
      await assert.rejects(execute(repository, 'A', command, 1), error =>
        error instanceof RepositoryError && error.status === 400 && error.message === 'Natureza financeira inválida.');
    }
    const snapshot = await repository.get('A');
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.state.transactions.length, 1);
    assert.equal(Object.hasOwn(snapshot.state.transactions[0], 'nature'), false);
  } finally { db.close(); }
});

test('updates preserve nature for older clients while legacy records stay unclassified', async () => {
  const { db, repository } = database();
  try {
    await execute(repository, 'A', transaction('legacy'), 0);
    const legacyEdit = transaction('legacy', 100); legacyEdit.id = 'edit-legacy';
    await execute(repository, 'A', legacyEdit, 1);
    assert.equal(Object.hasOwn((await repository.get('A')).state.transactions[0], 'nature'), false);
    const classify = transaction('legacy', 100); classify.id = 'classify'; classify.payload.nature = 'transfer';
    await execute(repository, 'A', classify, 2);
    const oldClientEdit = transaction('legacy', 200); oldClientEdit.id = 'edit-classified';
    await execute(repository, 'A', oldClientEdit, 3);
    assert.equal((await repository.get('A')).state.transactions[0].nature, 'transfer');
    const reclassify = transaction('legacy', 200); reclassify.id = 'reclassify'; reclassify.payload.nature = 'expense';
    await execute(repository, 'A', reclassify, 4);
    assert.equal((await repository.get('A')).state.transactions[0].nature, 'expense');
  } finally { db.close(); }
});

test('unknown transaction fields cannot set internal provenance or another owner', async () => {
  const { db, repository } = database();
  try {
    const command = transaction('safe');
    Object.assign(command.payload, JSON.parse('{"nature":"expense","origin":{"batchId":"forged"},"ownerId":"victim","revision":999,"__proto__":{"nature":"refund"}}'));
    await execute(repository, 'A', command, 0);
    const saved = (await repository.get('A')).state.transactions[0];
    assert.equal(saved.nature, 'expense');
    assert.equal(Object.hasOwn(saved, 'origin'), false);
    assert.equal(Object.hasOwn(saved, 'ownerId'), false);
    assert.equal(Object.hasOwn(saved, '__proto__'), false);
    assert.equal((await repository.get('victim')).state.transactions.length, 0);
  } finally { db.close(); }
});

test('reviewed import validates selected natures at the server boundary and persists valid ones', async () => {
  const { db, repository } = database();
  try {
    const command: Command = { id:'reviewed', type:'import.commit', payload:{
      name:'reviewed.csv', account:'Principal', locale:'br',
      content:'data;descricao;valor\n2026-10-29;Compra;-12,34', accepted:[2],
    } };
    for (const natures of [null, [], {}, {'2':'unidentified'}, {'2':'invalid'}, {'2':123}, {'3':'expense'}]) {
      await assert.rejects(execute(repository, 'A', {...command,payload:{...command.payload,natures}},0),status(400));
      assert.equal((await repository.get('A')).revision, 0);
    }
    command.payload.natures = {'2':'transfer'};
    const saved = await execute(repository, 'A', command, 0);
    assert.equal(saved.state.transactions[0].nature, 'transfer');
    assert.equal(saved.state.importBatches![0].transactions[0].nature, 'transfer');
    assert.equal(JSON.parse(JSON.stringify(await repository.export('A'))).state.transactions[0].nature, 'transfer');
    await assert.rejects(execute(repository,'victim',{id:'undo',type:'import.revert',payload:{id:'reviewed'}},0),status(400));
  } finally { db.close(); }
});

test('imports are atomic, durable, isolated and safe on concurrent retries', async () => {
  const { db, repository } = database();
  try {
    const initial = await repository.get('owner-import');
    const command: Command = { id:'batch1', type:'import.commit', payload:{ name:'a.csv', account:'Principal', locale:'br', content:'data;descricao;valor\n2026-10-29;Loja;-12,34', accepted:[2], hash:'forged', ownerId:'victim' } };
    const results = await Promise.allSettled([repository.execute('owner-import',command,0,initial.generation),repository.execute('owner-import',command,0,initial.generation)]);
    assert.ok(results.some(r => r.status === 'fulfilled'));
    const current = await repository.get('owner-import');
    assert.equal(current.state.transactions.length,1);
    assert.equal(current.revision,1);
    assert.notEqual(current.state.importBatches![0].hash,'forged');
    assert.equal((await repository.get('victim')).state.transactions.length,0);
    await assert.rejects(execute(repository,'victim',{id:'revert',type:'import.revert',payload:{id:'batch1'}},0),status(400));
    await assert.rejects(execute(repository,'owner-import',{...command,id:'batch2'},1),status(400));
    assert.equal((await repository.get('owner-import')).revision,1);
  } finally { db.close(); }
});

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
