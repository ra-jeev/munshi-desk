import assert from "node:assert/strict";
import { test } from "node:test";

// Stage 2 roles (Task 3): operators are denied every owner action with 403,
// owners keep full access, and the org creator (org owner, no app-role row
// yet) is an owner. The framework's role resolution and the actions both run
// against the same disposable PGlite via getDb().
process.env.DATABASE_URL = `pglite:/tmp/munshi-roles-test-${crypto.randomUUID()}`;

async function setup() {
  const { getDb, schema } = await import("../db/index.ts");
  const { getDbExec } = await import("@agent-native/core/db");
  // Run the same migration path as scripts/migrate-production.ts so the
  // framework org/app-role tables exist in the disposable PGlite.
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
  await exec.execute({
    sql: "INSERT INTO organizations (id, name, created_by, created_at) VALUES (?, ?, ?, ?)",
    args: [orgId, "Test factory", ownerEmail, now],
  });
  // Org tables are framework tables (not in the app drizzle schema), so they
  // are seeded through getDbExec with static parameterized SQL.
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
  const customerId = crypto.randomUUID();
  const machineId = crypto.randomUUID();
  await db.insert(schema.factories).values({
    id: crypto.randomUUID(),
    orgId,
    revision: 0,
    calendar: { shiftStart: "09:00", shiftEnd: "19:00", weeklyOff: [0] },
  });
  await db.insert(schema.customers).values({
    id: customerId,
    orgId,
    name: "Test customer",
  });
  await db.insert(schema.machines).values([
    {
      id: crypto.randomUUID(),
      orgId,
      name: "Cutter",
      stage: "cutting",
      speedPerHour: 1000,
      kgPerHour: 25,
      changeoverMin: 15,
    },
    {
      id: machineId,
      orgId,
      name: "Pouch machine 2",
      stage: "packing",
      speedPerHour: 1000,
      kgPerHour: 25,
      changeoverMin: 15,
    },
  ]);
  return { orgId, ownerEmail, operatorEmail, machineId };
}

const OWNER_ACTIONS = [
  "get-factory",
  "check-proposal",
  "simulate-schedule",
  "search-plans",
  "save-proposal",
  "load-demo-data",
  "view-screen",
  "list-factory-operators",
  "set-operator-machine",
] as const;

const STUB_PAYMENT = {
  operation: {
    kind: "record-payment",
    customerId: crypto.randomUUID(),
    amountPaise: 100,
    mode: "cash",
  },
};

test("operators get 403 from every owner action, owners pass the guard", async () => {
  const { orgId, ownerEmail, operatorEmail, machineId } = await setup();
  const ownerCtx = { userEmail: ownerEmail, orgId, caller: "cli" as const };
  const operatorCtx = { userEmail: operatorEmail, orgId, caller: "cli" as const };
  // Valid args per action: input validation runs before authorize, so empty
  // args would fail with a validation error instead of reaching the guard.
  const argsFor: Record<string, unknown> = {
    "get-factory": {},
    "check-proposal": STUB_PAYMENT,
    "simulate-schedule": STUB_PAYMENT,
    "search-plans": STUB_PAYMENT,
    "save-proposal": {
      ...STUB_PAYMENT,
      plannedAt: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      revision: 0,
    },
    "load-demo-data": { requestId: crypto.randomUUID() },
    "view-screen": {},
    "list-factory-operators": {},
    "set-operator-machine": { email: operatorEmail, machineId },
  };
  for (const name of OWNER_ACTIONS) {
    const mod = await import(`../../actions/${name}.ts`);
    const action = mod.default;
    // Operator: authorize throws before run() on every owner action —
    // including check-proposal, which is how a payment reaches the guard.
    await assert.rejects(
      async () => action.run(argsFor[name], operatorCtx),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "ForbiddenError" &&
        /Requires munshi-desk permission factory\.owner/.test(error.message),
      `${name} must deny operators with 403`,
    );
    // Owner: the guard passes; run() proceeds (succeeds, or fails later for
    // other reasons, but never with the owner 403).
    try {
      await action.run(argsFor[name], ownerCtx);
    } catch (error) {
      if (error instanceof Error && error.name === "ForbiddenError")
        assert.fail(`${name} must not deny the owner with 403`);
    }
  }
  // Payment through check-proposal is denied for the operator too.
  const checkProposal = (await import("../../actions/check-proposal.ts")).default;
  await assert.rejects(
    async () =>
      checkProposal.run(
        {
          operation: {
            kind: "record-payment",
            customerId: crypto.randomUUID(),
            amountPaise: 100,
            mode: "cash",
          },
        },
        operatorCtx,
      ),
    /Requires munshi-desk permission factory\.owner/,
  );
});

test("owner get-factory succeeds and links an operator to a machine", async () => {
  const { orgId, ownerEmail, operatorEmail, machineId } = await setup();
  const ownerCtx = { userEmail: ownerEmail, orgId, caller: "cli" as const };
  const getFactory = (await import("../../actions/get-factory.ts")).default;
  const data = await getFactory.run({}, ownerCtx);
  assert.equal(data.ready, true);
  assert.equal(data.machines.length, 2);

  const list = (await import("../../actions/list-factory-operators.ts")).default;
  const linked = await list.run({}, ownerCtx);
  assert.deepEqual(linked.operators, [{ email: operatorEmail, machineId: null }]);

  const setLink = (await import("../../actions/set-operator-machine.ts")).default;
  const result = await setLink.run({ email: operatorEmail, machineId }, ownerCtx);
  assert.equal(result.ok, true);
  assert.equal(result.machineName, "Pouch machine 2");

  const after = await list.run({}, ownerCtx);
  assert.deepEqual(after.operators, [{ email: operatorEmail, machineId }]);

  // Linking a non-member or a missing machine fails validation (not 403).
  await assert.rejects(
    async () => setLink.run({ email: "nobody@example.test", machineId }, ownerCtx),
    /not a member/,
  );
  await assert.rejects(
    async () => setLink.run({ email: operatorEmail, machineId: crypto.randomUUID() }, ownerCtx),
    /Machine not found/,
  );
});

test("org creator without an app-role assignment is still the owner", async () => {
  await setup();
  const { getDbExec } = await import("@agent-native/core/db");
  const { getDb, schema } = await import("../db/index.ts");
  const exec = getDbExec();
  // A second org where the creator has no app_member_roles row at all.
  const creatorId = crypto.randomUUID();
  const creatorEmail = "creator@example.test";
  const now = Date.now();
  await exec.execute({
    sql: "INSERT INTO organizations (id, name, created_by, created_at) VALUES (?, ?, ?, ?)",
    args: [creatorId, "Fresh factory", creatorEmail, now],
  });
  await exec.execute({
    sql: "INSERT INTO org_members (id, org_id, email, role, joined_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), creatorId, creatorEmail, "owner", now],
  });
  await getDb().insert(schema.factories).values({
    id: crypto.randomUUID(),
    orgId: creatorId,
    revision: 0,
    calendar: { shiftStart: "09:00", shiftEnd: "19:00", weeklyOff: [0] },
  });
  const getFactory = (await import("../../actions/get-factory.ts")).default;
  const data = await getFactory.run({}, { userEmail: creatorEmail, orgId: creatorId, caller: "cli" as const });
  assert.equal(data.ready, true);
});
