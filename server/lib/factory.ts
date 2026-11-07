import { fail } from "@agent-native/core/action";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb, schema } from "../db/index.ts";
import { normalizeSize } from "../domain/agent/size.ts";
import {
  dayIndex,
  schedule as rawSchedule,
  stamp,
  type PlanInput,
} from "../domain/scheduler/schedule.ts";
import {
  bestOption,
  better,
  simulate,
  type Option,
} from "../domain/scheduler/simulate.ts";
import type { Operation, OrderFields } from "./contracts.ts";
import {
  completedStages,
  minuteFromIso,
  revisedSnapshot,
} from "./factory-changes.ts";
import { orderLifecycle } from "./lifecycle.ts";

function schedule(input: PlanInput) {
  try {
    return rawSchedule(input);
  } catch {
    return fail(
      "The current machines and working calendar cannot produce a plan within one year. Adjust them and preview again.",
      { statusCode: 422, errorCode: "schedule_unavailable" },
    );
  }
}
export type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export function orgFor(
  ctx: { orgId?: string | null; userEmail?: string | null } | undefined,
) {
  if (!ctx?.userEmail)
    return fail("Sign in to open your factory.", {
      statusCode: 401,
      errorCode: "sign_in_required",
    });
  return (
    ctx.orgId ??
    fail(
      "Create or select an organization in the sidebar to open your demo factory.",
      { statusCode: 403, errorCode: "organization_required" },
    )
  );
}
export const todayIST = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export async function snapshot(orgId: string, db: Db | Tx = getDb()) {
  const [factory] = await db
    .select()
    .from(schema.factories)
    .where(eq(schema.factories.orgId, orgId))
    .limit(1);
  const [customers, machines, orders, payments, alerts] = await Promise.all([
    db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.orgId, orgId))
      .orderBy(schema.customers.name)
      .limit(500),
    db
      .select()
      .from(schema.machines)
      .where(eq(schema.machines.orgId, orgId))
      .orderBy(schema.machines.stage, schema.machines.name, schema.machines.id)
      .limit(50),
    db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orgId, orgId))
      .orderBy(schema.orders.createdAt, schema.orders.id)
      .limit(1000),
    db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orgId, orgId))
      .orderBy(schema.payments.createdAt)
      .limit(5000),
    // Stage 2 (Task 4): owner alerts from saved operator reports. Only
    // unresolved rows; get-factory is owner-only so operators never see them.
    db
      .select()
      .from(schema.operatorAlerts)
      .where(
        and(
          eq(schema.operatorAlerts.orgId, orgId),
          isNull(schema.operatorAlerts.resolvedAt),
        ),
      )
      .orderBy(schema.operatorAlerts.createdAt)
      .limit(100),
  ]);
  return {
    factory,
    customers,
    machines,
    alerts,
    orders: orders.map((o) => ({
      ...o,
      status: orderLifecycle.parseState(o.status),
    })),
    payments,
  };
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
export function planning(s: Snapshot, now = new Date()): PlanInput {
  if (!s.factory)
    return fail("Load demo data first.", {
      statusCode: 409,
      errorCode: "factory_missing",
    });
  const baseDate = todayIST(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  return {
    baseDate,
    now: parts[0]! * 60 + parts[1]!,
    calendar: s.factory.calendar,
    machines: s.machines.map((m, i) => ({ ...m, id: i + 1 })),
    orders: s.orders.flatMap((o, i) =>
      o.status === "pending"
        ? [
            {
              ...o,
              doneStages: completedStages(o),
              ...(() => {
                const stage = (["cutting", "packing"] as const).find(
                  (stage) => o.progress[stage]?.state === "running",
                );
                if (!stage) return {};
                const progress = o.progress[stage]!;
                const machineId =
                  s.machines.findIndex((m) => m.id === progress.machineId) + 1;
                if (!machineId)
                  return fail(
                    "A running job has no machine. Restore its machine before replanning.",
                    { statusCode: 409, errorCode: "running_machine_missing" },
                  );
                return {
                  running: {
                    stage,
                    machineId,
                    startedAt: minuteFromIso(baseDate, progress.startedAt),
                  },
                };
              })(),
              id: i + 1,
              customer:
                s.customers.find((c) => c.id === o.customerId)?.name ??
                "Unknown customer",
            },
          ]
        : [],
    ),
    down: s.machines.flatMap((m, i) =>
      m.downFrom && m.downTo
        ? [
            {
              machineId: i + 1,
              from: dayIndex(baseDate, m.downFrom) * 1440,
              to: (dayIndex(baseDate, m.downTo) + 1) * 1440,
            },
          ]
        : [],
    ),
  };
}
export function normalizedOrder(order: OrderFields, s: Snapshot) {
  if (!s.customers.some((c) => c.id === order.customerId))
    return fail("Choose a customer from this factory.", {
      statusCode: 404,
      errorCode: "customer_not_found",
    });
  const size = normalizeSize(order.size);
  if (!size)
    return fail(
      "Give both pouch dimensions and the unit, for example 4x6 inch.",
      { statusCode: 422, errorCode: "invalid_size" },
    );
  if (!Number.isSafeInteger(order.quantity * order.ratePaise))
    return fail("The order amount is too large.", {
      statusCode: 422,
      errorCode: "amount_too_large",
    });
  return { ...order, size };
}
export function preview(
  s: Snapshot,
  op: Operation,
  search = false,
  now = new Date(),
  exact = false,
) {
  if (op.kind === "update-order")
    op = { ...op, order: normalizedOrder(op.order, s) };
  const revised = revisedSnapshot(s, op, now);
  if (op.kind === "add-customer")
    return {
      id: "proposal",
      plannedAt: now.toISOString(),
      requestId: crypto.randomUUID(),
      revision: s.factory!.revision,
      operation: op,
      priority: 0,
      deliveries: [] as {
        id: string;
        customer: string;
        ready: string;
        lateDays: number;
        moved: boolean;
        previousReady: string | null;
      }[],
      lateOrders: 0,
      option: {
        place: "normal" as const,
        overtime: {} as Record<string, number>,
      },
      customerName: op.name,
      machineName: null,
      balanceBeforePaise: null,
      balanceAfterPaise: null,
    };
  if (op.kind === "record-payment") {
    if (!s.factory)
      return fail("Load demo data first.", {
        statusCode: 409,
        errorCode: "factory_missing",
      });
    const customer = s.customers.find((c) => c.id === op.customerId);
    if (!customer)
      return fail("Customer not found.", {
        statusCode: 404,
        errorCode: "customer_not_found",
      });
    const billed = s.orders
      .filter((o) => o.customerId === customer.id && o.status !== "cancelled")
      .reduce((n, o) => n + o.quantity * o.ratePaise, 0);
    const paid = s.payments
      .filter((p) => p.customerId === customer.id)
      .reduce((n, p) => n + p.amountPaise, 0);
    return {
      id: "proposal",
      plannedAt: now.toISOString(),
      requestId: crypto.randomUUID(),
      revision: s.factory.revision,
      operation: op,
      priority: 0,
      deliveries: [] as {
        id: string;
        customer: string;
        ready: string;
        lateDays: number;
        moved: boolean;
        previousReady: string | null;
      }[],
      lateOrders: 0,
      option: {
        place: "normal" as const,
        overtime: {} as Record<string, number>,
      },
      customerName: customer.name,
      machineName: null,
      balanceBeforePaise: billed - paid,
      balanceAfterPaise: billed - paid - op.amountPaise,
    };
  }
  const input = planning(s, now);
  const before = schedule(
    planning(s, s.factory?.plannedAt ? new Date(s.factory.plannedAt) : now),
  );
  let after = before;
  let choice: Option = { place: "normal", overtime: {} };
  let priority = 0;
  let planningNote: string | null = null;
  if (op.kind === "create-order") {
    const o = normalizedOrder(op.order, s);
    const order = {
      ...o,
      id: -1,
      customer: s.customers.find((c) => c.id === o.customerId)!.name,
      priority: 0,
      createdAt: new Date().toISOString(),
    };
    const change = { kind: "add" as const, order };
    if (op.noOvertime && Object.values(op.option.overtime).some((m) => m > 0))
      return fail("Overtime is not allowed for this proposal.", {
        statusCode: 422,
        errorCode: "overtime_forbidden",
      });
    let outcome;
    try {
      const candidate = simulate(input, change, op.option);
      const baseline = exact
        ? null
        : bestOption(input, change, { noOvertime: op.noOvertime ?? false });
      outcome =
        search && baseline
          ? baseline
          : baseline
            ? better(candidate, baseline)
            : candidate;
      if (!search && baseline && outcome !== candidate)
        planningNote =
          "The fixed search found a better option. This preview uses that plan.";
    } catch {
      return fail(
        "This order cannot fit within the one-year planning window. Check the quantity, speeds and working hours.",
        { statusCode: 422, errorCode: "schedule_unavailable" },
      );
    }
    choice = outcome.option;
    priority = outcome.priority;
    const overtime = { ...input.calendar.overtime };
    for (const [date, minutes] of Object.entries(choice.overtime))
      overtime[date] = Math.max(overtime[date] ?? 0, minutes);
    after = schedule({
      ...input,
      orders: [...input.orders, { ...order, priority }],
      calendar: { ...input.calendar, overtime },
    });
  } else if (op.kind === "machine-down") {
    const index = s.machines.findIndex((m) => m.id === op.machineId);
    if (index < 0)
      return fail("Machine not found.", {
        statusCode: 404,
        errorCode: "machine_not_found",
      });
    if (op.to < op.from)
      return fail("The end date must be on or after the start date.", {
        statusCode: 422,
        errorCode: "invalid_dates",
      });
    after = schedule(
      planning(
        {
          ...revised,
          machines: revised.machines.map((m) =>
            m.id === op.machineId
              ? {
                  ...m,
                  downFrom: op.from,
                  downTo: op.to,
                  downReason: op.reason,
                }
              : m,
          ),
        },
        now,
      ),
    );
  } else if (op.kind === "cancel-order") {
    const index = s.orders.findIndex(
      (o) => o.id === op.orderId && o.status === "pending",
    );
    if (index < 0)
      return fail("Open order not found.", {
        statusCode: 404,
        errorCode: "order_not_found",
      });
    after = schedule({
      ...input,
      orders: input.orders.filter((o) => o.id !== index + 1),
    });
  } else if (
    op.kind === "update-order" ||
    op.kind === "job-progress" ||
    op.kind === "update-settings"
  ) {
    after = schedule(planning(revised, now));
  }
  const deliveries = after.orders.map((r) => {
    const old = before.orders.find((b) => b.orderId === r.orderId);
    const row = revised.orders[r.orderId - 1]!;
    return {
      id: r.orderId === -1 ? "proposed" : row.id,
      customer:
        r.orderId === -1 && op.kind === "create-order"
          ? s.customers.find((c) => c.id === op.order.customerId)!.name
          : s.customers.find((c) => c.id === row.customerId)!.name,
      ready: stamp(input.baseDate, r.finish),
      lateDays: r.lateDays,
      moved: !!old && old.finish !== r.finish,
      previousReady: old ? stamp(input.baseDate, old.finish) : null,
    };
  });
  return {
    id: "proposal",
    orderDetails:
      "orderId" in op
        ? (s.orders.find((o) => o.id === op.orderId) ?? null)
        : null,
    machineName:
      op.kind === "job-progress" || op.kind === "machine-down"
        ? (s.machines.find((m) => m.id === op.machineId)?.name ?? null)
        : null,
    customerName:
      op.kind === "create-order" || op.kind === "update-order"
        ? s.customers.find((c) => c.id === op.order.customerId)!.name
        : op.kind === "job-progress" || op.kind === "cancel-order"
          ? (s.customers.find(
              (c) =>
                c.id === s.orders.find((o) => o.id === op.orderId)?.customerId,
            )?.name ?? null)
          : null,
    balanceBeforePaise: null,
    balanceAfterPaise: null,
    plannedAt: now.toISOString(),
    requestId: crypto.randomUUID(),
    revision: s.factory!.revision,
    operation:
      op.kind === "create-order"
        ? { ...op, order: normalizedOrder(op.order, s), option: choice }
        : op,
    priority,
    planningNote,
    deliveries,
    lateOrders: deliveries.filter((d) => d.lateDays > 0).length,
    option: choice,
  };
}
export function view(s: Snapshot) {
  if (!s.factory)
    return {
      id: "factory",
      today: todayIST(),
      ready: false as const,
      revision: 0,
      customers: s.customers,
      machines: s.machines,
      orders: s.orders,
      payments: s.payments,
      jobs: [],
      deliveries: [],
      accounts: [],
      alerts: s.alerts,
      calendar: null,
      defaultRates: { packets: 85, kg: 15000 },
    };
  const input = planning(
    s,
    s.factory.plannedAt ? new Date(s.factory.plannedAt) : new Date(),
  );
  const plan = schedule(input);
  return {
    id: s.factory.id,
    today: todayIST(),
    ready: true as const,
    revision: s.factory.revision,
    customers: s.customers,
    machines: s.machines,
    orders: s.orders,
    payments: s.payments,
    calendar: s.factory.calendar,
    defaultRates: s.factory.defaultRates,
    alerts: s.alerts,
    jobs: plan.jobs.map((j) => ({
      ...j,
      id: `${s.orders[j.orderId - 1]!.id}-${j.stage}`,
      state: s.orders[j.orderId - 1]!.progress[j.stage]?.state ?? "queued",
      quantity: s.orders[j.orderId - 1]!.quantity,
      unit: s.orders[j.orderId - 1]!.unit,
      orderId: s.orders[j.orderId - 1]!.id,
      machineId: s.machines[j.machineId - 1]!.id,
      customer: s.customers.find(
        (c) => c.id === s.orders[j.orderId - 1]!.customerId,
      )!.name,
      start: stamp(input.baseDate, j.start),
      end: stamp(input.baseDate, j.end),
    })),
    deliveries: plan.orders.map((r) => ({
      ...r,
      id: s.orders[r.orderId - 1]!.id,
      ready: stamp(input.baseDate, r.finish),
    })),
    accounts: s.customers.map((c) => ({
      ...c,
      billedPaise: s.orders
        .filter((o) => o.customerId === c.id && o.status !== "cancelled")
        .reduce((n, o) => n + o.quantity * o.ratePaise, 0),
      paidPaise: s.payments
        .filter((p) => p.customerId === c.id)
        .reduce((n, p) => n + p.amountPaise, 0),
    })),
  };
}
export async function commit(
  orgId: string,
  args: {
    requestId: string;
    revision: number;
    plannedAt: string;
    operation: Operation;
  },
  database: Db = getDb(),
) {
  return database.transaction(async (tx) => {
    const [factory] = await tx
      .select()
      .from(schema.factories)
      .where(eq(schema.factories.orgId, orgId))
      .limit(1)
      .for("update");
    if (!factory)
      return fail("Load demo data first.", {
        statusCode: 409,
        errorCode: "factory_missing",
      });
    const fingerprint = JSON.stringify({
      revision: args.revision,
      plannedAt: args.plannedAt,
      operation: args.operation,
    });
    const [prior] = await tx
      .select()
      .from(schema.requests)
      .where(
        and(
          eq(schema.requests.id, args.requestId),
          eq(schema.requests.orgId, orgId),
        ),
      )
      .limit(1);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        return fail(
          "This request ID belongs to a different proposal. Preview again with a new ID.",
          { statusCode: 409, errorCode: "request_changed" },
        );
      return prior.result;
    }
    if (factory.revision !== args.revision)
      return fail(
        "The factory plan changed. Preview this proposal again before saving.",
        { statusCode: 409, errorCode: "stale_revision" },
      );
    const plannedAt = new Date(args.plannedAt);
    if (
      !Number.isFinite(plannedAt.getTime()) ||
      plannedAt.getTime() > Date.now() + 5000 ||
      Date.now() - plannedAt.getTime() > 600000
    )
      return fail("This preview expired. Preview again before saving.", {
        statusCode: 409,
        errorCode: "preview_expired",
      });
    const s = await snapshot(orgId, tx);
    const checked = preview(s, args.operation, false, plannedAt);
    const op = checked.operation;
    if (
      args.operation.kind === "create-order" &&
      JSON.stringify(args.operation.option) !== JSON.stringify(checked.option)
    )
      return fail(
        "This option is worse than the fixed-search baseline. Preview the recommended plan before saving.",
        { statusCode: 422, errorCode: "plan_below_baseline" },
      );
    let id: string = crypto.randomUUID();
    const revised = revisedSnapshot(s, op, plannedAt);
    const createdAt = new Date().toISOString();
    if (op.kind === "create-order") {
      await tx.insert(schema.orders).values({
        ...op.order,
        id,
        orgId,
        priority: checked.priority,
        status: "pending",
        createdAt,
      });
      const overtime = { ...factory.calendar.overtime };
      for (const [date, minutes] of Object.entries(op.option.overtime))
        overtime[date] = Math.max(overtime[date] ?? 0, minutes);
      await tx
        .update(schema.factories)
        .set({ calendar: { ...factory.calendar, overtime } })
        .where(eq(schema.factories.id, factory.id));
    } else if (op.kind === "record-payment")
      await tx.insert(schema.payments).values({
        id,
        orgId,
        customerId: op.customerId,
        amountPaise: op.amountPaise,
        mode: op.mode,
        createdAt,
      });
    else if (op.kind === "add-customer") {
      await tx.insert(schema.customers).values({
        id,
        orgId,
        name: op.name.trim().replace(/\s+/g, " "),
        phone: op.phone,
      });
    } else if (op.kind === "update-order") {
      id = op.orderId;
      const rows = await tx
        .update(schema.orders)
        .set(op.order)
        .where(
          and(
            eq(schema.orders.id, id),
            eq(schema.orders.orgId, orgId),
            eq(schema.orders.status, "pending"),
          ),
        )
        .returning({ id: schema.orders.id });
      if (!rows.length)
        return fail("The order changed. Preview again.", {
          statusCode: 409,
          errorCode: "order_changed",
        });
    } else if (op.kind === "cancel-order") {
      id = op.orderId;
      const rows = await tx
        .update(schema.orders)
        .set({ status: orderLifecycle.transition("pending", "cancel") })
        .where(
          and(
            eq(schema.orders.id, id),
            eq(schema.orders.orgId, orgId),
            inArray(schema.orders.status, [
              ...orderLifecycle.fromStates("cancel"),
            ]),
          ),
        )
        .returning({ id: schema.orders.id });
      if (!rows.length)
        return fail("The order changed. Preview again.", {
          statusCode: 409,
          errorCode: "order_changed",
        });
    } else if (op.kind === "job-progress") {
      id = op.orderId;
      const order = revised.orders.find((o) => o.id === id)!;
      const rows = await tx
        .update(schema.orders)
        .set({ progress: order.progress, status: order.status })
        .where(
          and(
            eq(schema.orders.id, id),
            eq(schema.orders.orgId, orgId),
            eq(schema.orders.status, "pending"),
          ),
        )
        .returning({ id: schema.orders.id });
      if (!rows.length)
        return fail("The job changed. Preview again.", {
          statusCode: 409,
          errorCode: "order_changed",
        });
    } else if (op.kind === "update-settings") {
      id = factory.id;
      await tx
        .update(schema.factories)
        .set({
          calendar: revised.factory!.calendar,
          defaultRates: op.settings.defaultRates,
        })
        .where(eq(schema.factories.id, id));
      await tx.delete(schema.machines).where(eq(schema.machines.orgId, orgId));
      await tx.insert(schema.machines).values(revised.machines);
    } else {
      id = op.machineId;
      await tx
        .update(schema.machines)
        .set({ downFrom: op.from, downTo: op.to, downReason: op.reason })
        .where(
          and(eq(schema.machines.id, id), eq(schema.machines.orgId, orgId)),
        );
    }
    const revision = factory.revision + 1;
    await tx
      .update(schema.factories)
      .set({
        revision,
        ...(!["record-payment", "add-customer"].includes(op.kind)
          ? { plannedAt: args.plannedAt }
          : {}),
      })
      .where(eq(schema.factories.id, factory.id));
    const result = {
      id,
      revision,
      message: (
        {
          "record-payment": "Payment recorded.",
          "create-order": "Order added to the plan.",
          "update-order": "Order updated and plan refreshed.",
          "cancel-order": "Order cancelled.",
          "machine-down": "Machine stoppage recorded and plan updated.",
          "add-customer": "Customer added.",
          "job-progress": "Job progress recorded.",
          "update-settings": "Factory settings saved.",
        } as const
      )[op.kind],
    };
    await tx
      .insert(schema.requests)
      .values({ id: args.requestId, orgId, fingerprint, result });
    return result;
  });
}
