import {
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { Calendar, Stage } from "../domain/scheduler/schedule.ts";
import type { OrderProgress } from "../lib/lifecycle.ts";

export const factories = pgTable(
  "munshi_factories",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    revision: integer("revision").notNull().default(0),
    plannedAt: text("planned_at"),
    calendar: jsonb("calendar").$type<Calendar>().notNull(),
    defaultRates: jsonb("default_rates")
      .$type<{ packets: number; kg: number }>()
      .notNull()
      .default({ packets: 85, kg: 15000 }),
  },
  (t) => [uniqueIndex("munshi_factory_org").on(t.orgId)],
);
export const customers = pgTable("munshi_customers", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
});
export const machines = pgTable("munshi_machines", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  stage: text("stage").$type<Stage>().notNull(),
  speedPerHour: integer("speed_per_hour").notNull(),
  kgPerHour: integer("kg_per_hour").notNull(),
  changeoverMin: integer("changeover_min").notNull(),
  downFrom: text("down_from"),
  downTo: text("down_to"),
  downReason: text("down_reason"),
});
export const orders = pgTable("munshi_orders", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  customerId: text("customer_id").notNull(),
  product: text("product").notNull(),
  size: text("size").notNull(),
  quantity: integer("quantity").notNull(),
  unit: text("unit", { enum: ["packets", "kg"] }).notNull(),
  dueDate: text("due_date").notNull(),
  ratePaise: integer("rate_paise").notNull(),
  priority: integer("priority").notNull().default(0),
  progress: jsonb("progress").$type<OrderProgress>().notNull().default({}),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
});
export const payments = pgTable("munshi_payments", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  customerId: text("customer_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  mode: text("mode").notNull(),
  createdAt: text("created_at").notNull(),
});
export const requests = pgTable("munshi_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  result: jsonb("result")
    .$type<{ id: string; revision: number; message: string }>()
    .notNull(),
});
