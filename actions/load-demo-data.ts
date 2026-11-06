import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.ts";
import { dateOf, isClosed } from "../server/domain/scheduler/schedule.ts";
import { orgFor, todayIST } from "../server/lib/factory.ts";

/** The nth working day after `today` (skips the weekly off and holidays). */
export function workingDueDate(today: string, n: number) {
  const calendar = { shiftStart: "09:00", shiftEnd: "19:00", weeklyOff: [0], holidays: [] as string[], overtime: {} };
  let day = 0;
  while (n > 0) {
    day++;
    if (!isClosed(calendar, today, day)) n--;
  }
  return dateOf(today, day);
}
export default defineAction({
  description:
    "Replace this organization factory with fictional demo orders, machines and payments. Destructive reset, requires confirmation.",
  schema: z.object({
    requestId: z
      .string()
      .uuid()
      .describe(
        "UUID identifying this reset; reuse only when retrying the same reset",
      ),
  }),
  needsApproval: true,
  allowPersistentApproval: false,
  run: async (args, ctx) => {
    const orgId = orgFor(ctx);
    return getDb().transaction(async (tx) => {
      const calendar = {
        shiftStart: "09:00",
        shiftEnd: "19:00",
        weeklyOff: [0],
        holidays: [],
        overtime: {},
      };
      await tx
        .insert(schema.factories)
        .values({ id: crypto.randomUUID(), orgId, revision: 0, calendar })
        .onConflictDoNothing();
      const [factory] = await tx
        .select()
        .from(schema.factories)
        .where(eq(schema.factories.orgId, orgId))
        .limit(1)
        .for("update");
      if (!factory)
        return fail("Could not initialize factory.", {
          statusCode: 409,
          errorCode: "factory_missing",
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
        if (prior.fingerprint !== "load-demo")
          return fail("Request ID already used.", {
            statusCode: 409,
            errorCode: "request_changed",
          });
        return prior.result;
      }
      await tx.delete(schema.payments).where(eq(schema.payments.orgId, orgId));
      await tx.delete(schema.orders).where(eq(schema.orders.orgId, orgId));
      await tx
        .delete(schema.customers)
        .where(eq(schema.customers.orgId, orgId));
      await tx.delete(schema.machines).where(eq(schema.machines.orgId, orgId));
      const customers = [
        "Sharma Packaging",
        "Verma Foods",
        "Gupta Traders",
        "Khan Enterprises",
      ].map((name) => ({ id: crypto.randomUUID(), orgId, name, phone: "" }));
      await tx.insert(schema.customers).values(customers);
      await tx.insert(schema.machines).values([
        {
          id: crypto.randomUUID(),
          orgId,
          name: "Cutter 1",
          stage: "cutting" as const,
          speedPerHour: 3000,
          kgPerHour: 30,
          changeoverMin: 20,
        },
        {
          id: crypto.randomUUID(),
          orgId,
          name: "Pouch machine 1",
          stage: "packing" as const,
          speedPerHour: 1600,
          kgPerHour: 20,
          changeoverMin: 30,
        },
        {
          id: crypto.randomUUID(),
          orgId,
          name: "Pouch machine 2",
          stage: "packing" as const,
          speedPerHour: 1200,
          kgPerHour: 15,
          changeoverMin: 25,
        },
      ]);
      const today = todayIST();
      const createdAt = new Date().toISOString();
      await tx.insert(schema.orders).values([
        {
          id: crypto.randomUUID(),
          orgId,
          customerId: customers[0]!.id,
          product: "Transparent pouches",
          size: "4x6 inch",
          quantity: 12000,
          unit: "packets",
          dueDate: workingDueDate(today, 1),
          ratePaise: 85,
          priority: 0,
          status: "pending",
          createdAt,
        },
        {
          id: crypto.randomUUID(),
          orgId,
          customerId: customers[1]!.id,
          product: "Food pouches",
          size: "6x8 inch",
          quantity: 18000,
          unit: "packets",
          dueDate: workingDueDate(today, 2),
          ratePaise: 120,
          priority: 0,
          status: "pending",
          createdAt,
        },
        {
          id: crypto.randomUUID(),
          orgId,
          customerId: customers[2]!.id,
          product: "Retail pouches",
          size: "8x12 inch",
          quantity: 20000,
          unit: "packets",
          dueDate: workingDueDate(today, 3),
          ratePaise: 180,
          priority: 0,
          status: "pending",
          createdAt,
        },
      ]);
      await tx.insert(schema.payments).values({
        id: crypto.randomUUID(),
        orgId,
        customerId: customers[0]!.id,
        amountPaise: 400000,
        mode: "UPI",
        createdAt,
      });
      const revision = factory.revision + 1;
      await tx
        .update(schema.factories)
        .set({
          revision,
          calendar,
          plannedAt: createdAt,
          defaultRates: { packets: 85, kg: 15000 },
        })
        .where(eq(schema.factories.id, factory.id));
      const result = {
        id: factory.id,
        revision,
        message: "Fictional demo data loaded.",
      };
      await tx.insert(schema.requests).values({
        id: args.requestId,
        orgId,
        fingerprint: "load-demo",
        result,
      });
      return result;
    });
  },
});
