import { runMigrations } from "@agent-native/core/db";
export const migrations = [
  {
    version: 1,
    name: "munshi-factory-orders-and-ledger",
    sql: `
CREATE TABLE IF NOT EXISTS munshi_factories (id TEXT PRIMARY KEY, org_id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 0, calendar JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS munshi_customers (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS munshi_machines (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('cutting','packing')), speed_per_hour INTEGER NOT NULL CHECK(speed_per_hour > 0), kg_per_hour INTEGER NOT NULL CHECK(kg_per_hour > 0), changeover_min INTEGER NOT NULL CHECK(changeover_min >= 0), down_from TEXT, down_to TEXT, down_reason TEXT);
CREATE TABLE IF NOT EXISTS munshi_orders (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES munshi_customers(id), product TEXT NOT NULL, size TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), unit TEXT NOT NULL CHECK(unit IN ('packets','kg')), due_date TEXT NOT NULL, rate_paise INTEGER NOT NULL CHECK(rate_paise >= 0), priority INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS munshi_payments (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES munshi_customers(id), amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), mode TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS munshi_requests (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS munshi_customer_org ON munshi_customers(org_id, name);
CREATE INDEX IF NOT EXISTS munshi_machine_org ON munshi_machines(org_id, name);
CREATE INDEX IF NOT EXISTS munshi_order_org ON munshi_orders(org_id, due_date);
CREATE INDEX IF NOT EXISTS munshi_payment_org ON munshi_payments(org_id, customer_id);
CREATE INDEX IF NOT EXISTS munshi_request_org ON munshi_requests(org_id);
`,
  },
  {
    version: 2,
    name: "freeze-approved-plan-time",
    sql: "ALTER TABLE munshi_factories ADD COLUMN IF NOT EXISTS planned_at TEXT;",
  },
  {
    version: 3,
    name: "factory-rates-and-job-progress",
    sql: `ALTER TABLE munshi_factories ADD COLUMN IF NOT EXISTS default_rates JSONB NOT NULL DEFAULT '{"packets":85,"kg":15000}'; ALTER TABLE munshi_orders ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}';`,
  },
];
export default runMigrations(migrations, { table: "munshi_migrations" });
