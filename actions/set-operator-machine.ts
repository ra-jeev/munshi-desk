import { defineAction, fail } from "@agent-native/core/action";
import { getDbExec } from "@agent-native/core/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.ts";
import { ownerGuard } from "../server/lib/access.ts";
import { orgFor } from "../server/lib/factory.ts";

// Stage 2 (Task 3): the owner links one operator member to one machine in
// the same org. Owner-only; Task 4's per-action machine checks read this
// table. Approval-gated like the other owner's writes.
// TODO (Task 4): NOT owner-only — my-jobs, report-progress and
// report-machine-off check the caller's machine link instead of this guard.
export default defineAction({
  description:
    "Link one operator member to one machine in this org (Stage 2). Owner-only, needs approval. The operator email must be a current org member; the machine must belong to this org.",
  schema: z.object({
    email: z
      .string()
      .email()
      .describe("Email of the org member assigned the operator role"),
    machineId: z
      .string()
      .uuid()
      .describe("Machine UUID from list-factory-operators or get-factory"),
  }),
  authorize: ownerGuard,
  needsApproval: true,
  allowPersistentApproval: false,
  run: async ({ email, machineId }, ctx) => {
    const orgId = orgFor(ctx);
    const normalized = email.trim().toLowerCase();
    const db = getDb();
    const { rows: memberRows } = await getDbExec().execute({
      // Static parameterized SQL (no interpolation); org_members is a
      // framework table outside the app's drizzle schema.
      sql: "SELECT role FROM org_members WHERE org_id = ? AND LOWER(email) = ? AND federation_removal_pending_at IS NULL LIMIT 1",
      args: [orgId, normalized],
    });
    const [machine, existing] = await Promise.all([
      db
        .select()
        .from(schema.machines)
        .where(
          and(
            eq(schema.machines.id, machineId),
            eq(schema.machines.orgId, orgId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select()
        .from(schema.operatorMachines)
        .where(
          and(
            eq(schema.operatorMachines.orgId, orgId),
            eq(schema.operatorMachines.operatorEmail, normalized),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    if (memberRows.length === 0)
      return fail("That email is not a member of this organization.", {
        statusCode: 400,
        errorCode: "operator_not_a_member",
      });
    if (!machine)
      return fail("Machine not found in this organization.", {
        statusCode: 400,
        errorCode: "machine_not_found",
      });
    if (existing && existing.machineId === machineId)
      return {
        ok: true,
        email: normalized,
        machineId,
        machineName: machine.name,
        message: "Operator is already linked to this machine.",
      };
    await db
      .insert(schema.operatorMachines)
      .values({ orgId, operatorEmail: normalized, machineId })
      .onConflictDoUpdate({
        target: [schema.operatorMachines.orgId, schema.operatorMachines.operatorEmail],
        set: { machineId },
      });
    return {
      ok: true,
      email: normalized,
      machineId,
      machineName: machine.name,
      message: `Operator linked to ${machine.name}.`,
    };
  },
});
