import {
  index,
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
// Stage 2 (Task 4): owner alerts for operator reports (job progress and
// machine-off). One row per saved operator report; the owner sees unresolved
// alerts on Today (via get-factory view()) and acknowledges them. Additive.
export const operatorAlerts = pgTable(
  "munshi_operator_alerts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    createdAt: text("created_at").notNull(),
    operatorEmail: text("operator_email").notNull(),
    kind: text("kind", { enum: ["progress", "machine-off"] }).notNull(),
    machineId: text("machine_id").notNull(),
    detail: text("detail").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("munshi_operator_alert_org").on(t.orgId, t.createdAt)],
);
// Stage 2 (Task 3): each operator member is linked to one machine in the
// same org. The owner sets the link in Factory settings; Task 4 reads it for
// the operator screens/actions. One row per (org, operator).
export const operatorMachines = pgTable(
  "munshi_operator_machines",
  {
    orgId: text("org_id").notNull(),
    operatorEmail: text("operator_email").notNull(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("munshi_operator_machine_org").on(t.orgId, t.operatorEmail),
    index("munshi_operator_machine_machine").on(t.orgId, t.machineId),
  ],
);
