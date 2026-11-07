import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

// Stage 2 operator flow (Task 4): my-jobs filtering + stripping, machine
// checks (other machine's job id -> 403), operator preview/save, owner
// alerts on get-factory view(), and the demo operator account.
process.env.DATABASE_URL = `pglite:/tmp/munshi-operator-test-${crypto.randomUUID()}`;

async function setup() {
  const { getDb, schema } = await import("../db/index.ts");
  const { getDbExec } = await import("@agent-native/core/db");
  const { withMigrationRuntime, closeDbExec } = await import("@agent-native/core/db");
  const { runFrameworkReleaseMigrations, runAppReleaseMigrations } = await import(
    "@agent-native/core/server"
  );
  await withMigrationRuntime(async () => {
    await runFrameworkReleaseMigrations(null);
    await runAppReleaseMigrations();
  });
  await closeDbExec();
  const exec = getDbExec();
  const db = getDb();
  const orgId = crypto.randomUUID();
  const ownerEmail = "owner@example.test";
  const operatorEmail = "operator@example.test";
  const now = Date.now();
  const nowIso = new Date().toISOString();
  await exec.execute({
    sql: "INSERT INTO organizations (id, name, created_by, created_at) VALUES (?, ?, ?, ?)",
    args: [orgId, "Test factory", ownerEmail, now],
  });
  await exec.execute({
    sql: "INSERT INTO org_members (id, org_id, email, role, joined_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), orgId, ownerEmail, "owner", now],
  });
  await exec.execute({
    sql: "INSERT INTO org_members (id, org_id, email, role, joined_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), orgId, operatorEmail, "member", now],
  });
  await exec.execute({
    sql: "INSERT INTO app_member_roles (id, org_id, app_id, email, role, updated_by, updated_at) VALUES (?, ?, 'munshi-desk', ?, ?, ?, ?)",
    args: [crypto.randomUUID(), orgId, ownerEmail, "owner", ownerEmail, now],
  });
  await exec.execute({
    sql: "INSERT INTO app_member_roles (id, org_id, app_id, email, role, updated_by, updated_at) VALUES (?, ?, 'munshi-desk', ?, ?, ?, ?)",
    args: [crypto.randomUUID(), orgId, operatorEmail, "operator", ownerEmail, now],
  });
  const { todayIST } = await import("./factory.ts");
  const customerId = crypto.randomUUID();
  const cutterId = crypto.randomUUID();
  const pouchId = crypto.randomUUID();
  await db.insert(schema.factories).values({
    id: crypto.randomUUID(),
    orgId,
    revision: 0,
    // 24h calendar so job starts never hit outside_shift / weekly-off edges.
    calendar: { shiftStart: "00:00", shiftEnd: "24:00", weeklyOff: [] },
    plannedAt: nowIso,
  });
  await db.insert(schema.customers).values({
    id: customerId,
    orgId,
    name: "Secret customer",
  });
  await db.insert(schema.machines).values([
    { id: cutterId, orgId, name: "Cutter 1", stage: "cutting", speedPerHour: 3000, kgPerHour: 30, changeoverMin: 20 },
    { id: pouchId, orgId, name: "Pouch machine 2", stage: "packing", speedPerHour: 1200, kgPerHour: 15, changeoverMin: 25 },
  ]);
  const orderId = crypto.randomUUID();
  const today = todayIST();
  await db.insert(schema.orders).values({
    id: orderId,
    orgId,
    customerId,
    product: "Transparent pouches",
    size: "4x6 inch",
    quantity: 1200,
    unit: "packets",
    dueDate: today,
    ratePaise: 85,
    priority: 0,
    status: "pending",
    createdAt: nowIso,
    progress: { cutting: { state: "done", machineId: cutterId, startedAt: nowIso, quantity: 1200 } },
  });
  await db
    .insert(schema.operatorMachines)
    .values({ orgId, operatorEmail, machineId: pouchId });
  return { orgId, ownerEmail, operatorEmail, cutterId, pouchId, orderId, today };
}

const is403 = (e: unknown) =>
  e instanceof Error && /not on your machine|Ask the owner/.test(e.message);

test("my-jobs shows only the operator's machine jobs, stripped of owner fields", async () => {
  const { orgId, operatorEmail, pouchId, orderId } = await setup();
  const myJobs = (await import("../../actions/my-jobs.ts")).default;
  const data = await myJobs.run({}, { userEmail: operatorEmail, orgId, caller: "cli" as const });
  assert.equal(data.machineId, pouchId);
  assert.equal(data.machineName, "Pouch machine 2");
  assert.ok(data.jobs.length >= 1, "packing job scheduled today/tomorrow");
  assert.ok(data.jobs.every((j: { orderId: string }) => j.orderId === orderId));
  for (const job of data.jobs) {
    assert.deepEqual(
      Object.keys(job).sort(),
      ["end", "id", "orderId", "product", "quantity", "size", "stage", "start", "state", "unit"].sort(),
    );
  }
  const raw = JSON.stringify(data);
  assert.ok(!raw.includes("Secret customer"), "no customer names");
  assert.ok(!raw.includes("ratePaise"), "no prices");
  assert.ok(!raw.includes("payments"), "no payments");
  assert.ok(!raw.includes("Cutter 1"), "no other machine names");
});

test("machine checks: other machine's job id gets 403 on preview and save", async () => {
  const { orgId, operatorEmail, cutterId, orderId, today } = await setup();
  const ctx = { userEmail: operatorEmail, orgId, caller: "cli" as const };
  const check = (await import("../../actions/check-operator-proposal.ts")).default;
  const save = (await import("../../actions/save-operator-report.ts")).default;
  const progress = {
    kind: "job-progress",
    orderId,
    machineId: cutterId,
    stage: "cutting",
    status: "started",
    quantity: 1200,
  } as const;
  await assert.rejects(async () => check.run({ operation: progress }, ctx), is403);
  await assert.rejects(
    async () =>
      save.run(
        {
          operation: progress,
          plannedAt: new Date().toISOString(),
          requestId: crypto.randomUUID(),
          revision: 0,
        },
        ctx,
      ),
    is403,
  );
  const down = {
    kind: "machine-down",
    machineId: cutterId,
    from: today,
    to: today,
    reason: "roller toot gaya",
  } as const;
  await assert.rejects(async () => check.run({ operation: down }, ctx), is403);
  // Non-operator operations are refused too.
  await assert.rejects(
    async () =>
      check.run(
        {
          operation: {
            kind: "record-payment",
            customerId: crypto.randomUUID(),
            amountPaise: 100,
            mode: "cash",
          },
        } as never,
        ctx,
      ),
    (e: unknown) => e instanceof Error,
  );
});

test("operator saves own machine-off report; owner sees an alert on view(); ack resolves it", async () => {
  const { orgId, ownerEmail, operatorEmail, pouchId, today } = await setup();
  const ownerCtx = { userEmail: ownerEmail, orgId, caller: "cli" as const };
  const opCtx = { userEmail: operatorEmail, orgId, caller: "cli" as const };
  const check = (await import("../../actions/check-operator-proposal.ts")).default;
  const save = (await import("../../actions/save-operator-report.ts")).default;
  const preview = await check.run(
    {
      operation: {
        kind: "machine-down",
        machineId: pouchId,
        from: today,
        to: today,
        reason: "roller toot gaya",
      },
    },
    opCtx,
  );
  assert.equal(preview.machineName, "Pouch machine 2");
  assert.ok(!JSON.stringify(preview).includes("Secret customer"));
  const result = await save.run(
    {
      operation: preview.operation,
      plannedAt: preview.plannedAt,
      requestId: preview.requestId,
      revision: preview.revision,
    },
    opCtx,
  );
  assert.equal(result.alerted, true);
  // Retry with same requestId: no second alert row.
  await save.run(
    {
      operation: preview.operation,
      plannedAt: preview.plannedAt,
      requestId: preview.requestId,
      revision: preview.revision,
    },
    opCtx,
  );
  const getFactory = (await import("../../actions/get-factory.ts")).default;
  const view = await getFactory.run({}, ownerCtx);
  assert.equal(view.alerts.length, 1);
  const alert = view.alerts[0]!;
  assert.equal(alert.operatorEmail, operatorEmail);
  assert.equal(alert.kind, "machine-off");
  assert.ok(alert.detail.includes("roller toot gaya"));
  const ack = (await import("../../actions/ack-operator-alert.ts")).default;
  await ack.run({ alertId: alert.id }, ownerCtx);
  const after = await getFactory.run({}, ownerCtx);
  assert.equal(after.alerts.length, 0);
});

test("operator completes packing (cutting already done): progress save works and alerts owner", async () => {
  const { orgId, ownerEmail, operatorEmail, pouchId, orderId } = await setup();
  const ownerCtx = { userEmail: ownerEmail, orgId, caller: "cli" as const };
  const opCtx = { userEmail: operatorEmail, orgId, caller: "cli" as const };
  const check = (await import("../../actions/check-operator-proposal.ts")).default;
  const save = (await import("../../actions/save-operator-report.ts")).default;
  const preview = await check.run(
    {
      operation: {
        kind: "job-progress",
        orderId,
        machineId: pouchId,
        stage: "packing",
        status: "started",
        quantity: 1200,
      },
    },
    opCtx,
  );
  assert.ok(preview.orderSummary);
  assert.equal(preview.orderSummary!.product, "Transparent pouches");
  const result = await save.run(
    {
      operation: preview.operation,
      plannedAt: preview.plannedAt,
      requestId: preview.requestId,
      revision: preview.revision,
    },
    opCtx,
  );
  assert.equal(result.message, "Job progress recorded.");
  const getFactory = (await import("../../actions/get-factory.ts")).default;
  const view = await getFactory.run({}, ownerCtx);
  assert.equal(view.alerts.length, 1);
  assert.equal(view.alerts[0]!.kind, "progress");
  const order = view.orders.find((o: { id: string }) => o.id === orderId);
  assert.ok(order);
  assert.equal(order!.progress.packing?.state, "running");
});

test("demo data creates the made-up operator linked to Pouch machine 2", async () => {
  const { orgId, ownerEmail } = await setup();
  const { getDb, schema } = await import("../db/index.ts");
  const { getDbExec } = await import("@agent-native/core/db");
  const load = (await import("../../actions/load-demo-data.ts")).default;
  const { DEMO_OPERATOR_EMAIL } = await import("../../actions/load-demo-data.ts");
  assert.equal(DEMO_OPERATOR_EMAIL, "operator@munshi-demo.example");
  await load.run({ requestId: crypto.randomUUID() }, { userEmail: ownerEmail, orgId, caller: "cli" as const });
  const machines = await getDb().select().from(schema.machines).where(eq(schema.machines.orgId, orgId));
  const pouch2 = machines.find((m) => m.name === "Pouch machine 2");
  assert.ok(pouch2);
  const links = await getDb().select().from(schema.operatorMachines);
  const link = links.find((l) => l.operatorEmail === DEMO_OPERATOR_EMAIL && l.orgId === orgId);
  assert.ok(link);
  assert.equal(link!.machineId, pouch2.id);
  const exec = getDbExec();
  const { rows: members } = await exec.execute({
    sql: "SELECT email FROM org_members WHERE org_id = ? AND LOWER(email) = ?",
    args: [orgId, DEMO_OPERATOR_EMAIL],
  });
  assert.equal(members.length, 1);
  const { rows: roles } = await exec.execute({
    sql: "SELECT role FROM app_member_roles WHERE org_id = ? AND app_id = 'munshi-desk' AND LOWER(email) = ?",
    args: [orgId, DEMO_OPERATOR_EMAIL],
  });
  assert.equal(roles[0]?.role, "operator");
});
