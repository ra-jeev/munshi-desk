import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import { migrations } from "../plugins/db.ts";
import { commit, snapshot, preview, view, type Db } from "./factory.ts";

test("factory commits deduplicate retries, reject stale or changed requests and isolate organizations", async (t) => {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    if (!new URL(url).pathname.endsWith("_test"))
      throw new Error("Use a dedicated _test database.");
    const client = postgres(url, { max: 4, onnotice: () => {} });
    t.after(() => client.end());
    for (const m of migrations) await client.unsafe(m.sql);
    db = postgresDrizzle(client, { schema }) as unknown as Db;
  } else {
    const pg = new PGlite();
    t.after(() => pg.close());
    for (const m of migrations) await pg.exec(m.sql);
    db = drizzle(pg, { schema }) as unknown as Db;
  }
  const orgId = crypto.randomUUID(),
    customerId = crypto.randomUUID();
  await db.insert(schema.factories).values({
    id: crypto.randomUUID(),
    orgId,
    revision: 0,
    calendar: { shiftStart: "09:00", shiftEnd: "19:00", weeklyOff: [0] },
  });
  await db
    .insert(schema.customers)
    .values({ id: customerId, orgId, name: "Test customer" });
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
      id: crypto.randomUUID(),
      orgId,
      name: "Pouch",
      stage: "packing",
      speedPerHour: 1000,
      kgPerHour: 25,
      changeoverMin: 15,
    },
  ]);
  const plannedAt = new Date().toISOString();
  const requestId = crypto.randomUUID();
  const operation = {
    kind: "record-payment" as const,
    customerId,
    amountPaise: 250000,
    mode: "UPI" as const,
  };
  const first = await commit(
    orgId,
    { plannedAt, requestId, revision: 0, operation },
    db,
  );
  assert.deepEqual(
    await commit(orgId, { plannedAt, requestId, revision: 0, operation }, db),
    first,
  );
  assert.equal((await snapshot(orgId, db)).payments.length, 1);
  await assert.rejects(
    commit(
      orgId,
      {
        plannedAt,
        requestId,
        revision: 0,
        operation: { ...operation, amountPaise: 300000 },
      },
      db,
    ),
    /different proposal/,
  );
  await assert.rejects(
    commit(
      orgId,
      { plannedAt, requestId: crypto.randomUUID(), revision: 0, operation },
      db,
    ),
    /plan changed/,
  );
  await commit(
    orgId,
    { plannedAt, requestId: crypto.randomUUID(), revision: 1, operation },
    db,
  );
  assert.equal((await snapshot(orgId, db)).payments.length, 2);
  assert.equal((await snapshot("another-org", db)).payments.length, 0);
  await assert.rejects(
    commit(
      "another-org",
      { plannedAt, requestId: crypto.randomUUID(), revision: 2, operation },
      db,
    ),
    /Load demo/,
  );
  const s = await snapshot(orgId, db);
  const order = {
    kind: "create-order" as const,
    order: {
      customerId,
      product: "Pouches",
      size: "4 by 6 inch",
      quantity: 5000,
      unit: "packets" as const,
      dueDate: "2026-11-10",
      ratePaise: 85,
    },
    option: { place: "normal" as const, overtime: {} },
  };
  const p = preview(s, order);
  const inferior = {
    ...order,
    noOvertime: true,
    option: { place: "last" as const, overtime: {} },
  };
  const exact = preview(s, inferior, false, new Date(plannedAt), true);
  assert.equal(
    exact.option.place,
    "last",
    "exact simulation preserves the requested candidate",
  );
  const safe = preview(s, inferior, false, new Date(plannedAt));
  assert.equal(
    safe.option.place,
    "normal",
    "final preview keeps the fixed baseline when the candidate loses the tie rule",
  );
  assert.deepEqual(
    safe.option.overtime,
    {},
    "no-overtime constraint applies to baseline search",
  );
  await assert.rejects(
    commit(
      orgId,
      {
        plannedAt,
        requestId: crypto.randomUUID(),
        revision: 2,
        operation: inferior,
      },
      db,
    ),
    /worse than the fixed-search baseline/,
  );
  assert.throws(
    () =>
      preview(s, {
        ...inferior,
        option: { place: "normal", overtime: { "2026-11-07": 60 } },
      }),
    /Overtime is not allowed/,
  );
  assert.equal(
    (await snapshot(orgId, db)).orders.length,
    0,
    "preview does not persist",
  );
  assert.equal(p.operation.kind, "create-order");
  await commit(
    orgId,
    {
      plannedAt,
      requestId: crypto.randomUUID(),
      revision: 2,
      operation: order,
    },
    db,
  );
  const current = view(await snapshot(orgId, db));
  assert.equal(current.orders[0]?.size, "4x6 inch");
  assert.equal(current.jobs.length, 2);
  assert.equal(current.accounts[0]?.billedPaise, 425000);
  assert.equal(current.accounts[0]?.paidPaise, 500000);
  // Two writers share a revision. Exactly one may commit.
  const concurrent = await Promise.allSettled(
    [1, 2].map(() =>
      commit(
        orgId,
        { plannedAt, requestId: crypto.randomUUID(), revision: 3, operation },
        db,
      ),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await snapshot(orgId, db)).payments.length, 3);
});

test("orders, customers, progress and settings share validated transactional behavior", async (t) => {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    if (!new URL(url).pathname.endsWith("_test"))
      throw new Error("Use a dedicated _test database.");
    const client = postgres(url, { max: 4, onnotice: () => {} });
    t.after(() => client.end());
    for (const m of migrations) await client.unsafe(m.sql);
    db = postgresDrizzle(client, { schema }) as unknown as Db;
  } else {
    const pg = new PGlite();
    t.after(() => pg.close());
    for (const m of migrations) await pg.exec(m.sql);
    db = drizzle(pg, { schema }) as unknown as Db;
  }
  const orgId = crypto.randomUUID(),
    customerId = crypto.randomUUID(),
    cutterId = crypto.randomUUID(),
    packerId = crypto.randomUUID();
  await db.insert(schema.factories).values({
    id: crypto.randomUUID(),
    orgId,
    revision: 0,
    calendar: { shiftStart: "00:00", shiftEnd: "24:00", weeklyOff: [] },
  });
  await db
    .insert(schema.customers)
    .values({ id: customerId, orgId, name: "First customer" });
  await db.insert(schema.machines).values([
    {
      id: cutterId,
      orgId,
      name: "Cutter",
      stage: "cutting",
      kgPerHour: 30,
      speedPerHour: 2000,
      changeoverMin: 15,
    },
    {
      id: packerId,
      orgId,
      name: "Pouch",
      stage: "packing",
      kgPerHour: 20,
      speedPerHour: 1000,
      changeoverMin: 20,
    },
  ]);
  const change = async (operation: import("./contracts.ts").Operation) => {
    const s = await snapshot(orgId, db);
    const p = preview(s, operation);
    return commit(
      orgId,
      {
        requestId: p.requestId,
        revision: p.revision,
        plannedAt: p.plannedAt,
        operation: p.operation,
      },
      db,
    );
  };
  await change({
    kind: "add-customer",
    name: "Second customer",
    phone: "+91 98765 43210",
  });
  assert.equal((await snapshot(orgId, db)).customers.length, 2);
  const s = await snapshot(orgId, db);
  assert.throws(
    () =>
      preview(s, {
        kind: "add-customer",
        name: " SECOND   CUSTOMER ",
        phone: "",
      }),
    /already exists/,
  );
  const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const fields = {
    customerId,
    product: "Pouches",
    size: "4x6 inch",
    quantity: 1000,
    unit: "packets" as const,
    dueDate: due,
    ratePaise: 100,
  };
  const first = await change({
    kind: "create-order",
    order: fields,
    option: { place: "normal", overtime: {} },
  });
  await change({
    kind: "update-order",
    orderId: first.id,
    order: { ...fields, quantity: 2000, ratePaise: 125 },
  });
  let state = await snapshot(orgId, db);
  assert.equal(state.orders.find((o) => o.id === first.id)?.quantity, 2000);
  assert.equal(
    view(state).accounts.find((c) => c.id === customerId)?.billedPaise,
    250000,
  );
  const job = (
    stage: "cutting" | "packing",
    status: "started" | "paused" | "done",
    orderId = first.id,
    quantity = 2000,
  ) => ({
    kind: "job-progress" as const,
    orderId,
    machineId: stage === "cutting" ? cutterId : packerId,
    stage,
    status,
    quantity,
  });
  await assert.rejects(change(job("packing", "started")), /Complete cutting/);
  await assert.rejects(
    change({ ...job("cutting", "started"), machineId: crypto.randomUUID() }),
    /Choose a machine/,
  );
  await assert.rejects(
    change(job("cutting", "done", first.id, 1000)),
    /full order quantity/,
  );
  await change(job("cutting", "started"));
  const second = await change({
    kind: "create-order",
    order: fields,
    option: { place: "normal", overtime: {} },
  });
  await assert.rejects(
    change(job("cutting", "started", second.id, 1000)),
    /already running/,
  );
  await assert.rejects(
    change({
      kind: "machine-down",
      machineId: cutterId,
      from: due,
      to: due,
      reason: "Service",
    }),
    /Pause the running/,
  );
  await assert.rejects(
    change({ kind: "update-order", orderId: first.id, order: fields }),
    /Production has started/,
  );
  await change(job("cutting", "paused"));
  await change(job("cutting", "started", second.id, 1000));
  await change(job("cutting", "done", second.id, 1000));
  await change(job("cutting", "started"));
  await change(job("cutting", "done"));
  await change(job("packing", "started"));
  state = await snapshot(orgId, db);
  assert.equal(
    view(state).jobs.find(
      (j) => j.orderId === first.id && j.stage === "packing",
    )?.state,
    "running",
  );
  const settings = {
    shifts: [{ start: "00:00", end: "24:00" }],
    weeklyOff: [],
    holidays: [],
    defaultRates: { packets: 90, kg: 16000 },
    machines: state.machines.map(
      ({ id, name, stage, speedPerHour, kgPerHour, changeoverMin }) => ({
        id,
        name,
        stage,
        speedPerHour,
        kgPerHour,
        changeoverMin,
      }),
    ),
  };
  await assert.rejects(
    change({
      kind: "update-settings",
      settings: {
        ...settings,
        machines: settings.machines.map((m) => ({
          ...m,
          speedPerHour: m.speedPerHour + 100,
        })),
      },
    }),
    /Pause running jobs/,
  );
  const clock = state.factory!.plannedAt;
  await change({
    kind: "record-payment",
    customerId,
    amountPaise: 50000,
    mode: "UPI",
  });
  assert.equal(
    (await snapshot(orgId, db)).factory!.plannedAt,
    clock,
    "a payment does not move the saved plan clock",
  );
  await change(job("packing", "done"));
  state = await snapshot(orgId, db);
  assert.equal(state.orders.find((o) => o.id === first.id)?.status, "done");
  assert.ok(!view(state).jobs.some((j) => j.orderId === first.id));
  await assert.rejects(change(job("packing", "done")), /Open order not found/);
  await change({
    kind: "update-settings",
    settings: {
      ...settings,
      shifts: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "18:00" },
      ],
      holidays: [due],
    },
  });
  state = await snapshot(orgId, db);
  assert.equal(state.factory!.defaultRates.packets, 90);
  assert.equal(state.factory!.calendar.shifts?.length, 2);
  assert.ok(view(state).jobs.every((j) => !j.start.startsWith(due)));
  await change({ kind: "cancel-order", orderId: second.id });
  state = await snapshot(orgId, db);
  assert.equal(view(state).jobs.length, 0);
  assert.equal(
    view(state).accounts.find((c) => c.id === customerId)?.billedPaise,
    250000,
  );
  const { operation } = await import("./contracts.ts");
  assert.equal(
    operation.safeParse({
      kind: "update-settings",
      settings: { ...settings, weeklyOff: [0, 1, 2, 3, 4, 5, 6] },
    }).success,
    false,
  );
  assert.equal(
    operation.safeParse({
      kind: "update-settings",
      settings: {
        ...settings,
        shifts: [
          { start: "09:00", end: "13:00" },
          { start: "12:00", end: "19:00" },
        ],
      },
    }).success,
    false,
  );
  assert.equal(
    operation.safeParse({
      kind: "update-settings",
      settings: {
        ...settings,
        machines: settings.machines.filter((m) => m.stage !== "cutting"),
      },
    }).success,
    false,
  );
});
