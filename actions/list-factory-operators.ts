import { defineAction } from "@agent-native/core/action";
import { listAppMemberRoles } from "@agent-native/core/org-team";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.ts";
import { ownerGuard } from "../server/lib/access.ts";
import { orgFor } from "../server/lib/factory.ts";

// Stage 2 (Task 3): who are this org's operators and which machine each is
// linked to. Owner-only; Task 4's my-jobs reads the same table with the
// operator's own machine check.
// TODO (Task 4): NOT owner-only — my-jobs will expose just the caller's
// machine; do not add this action to the owner guard.
export default defineAction({
  description:
    "List this org's members assigned the operator role, each linked machine, and the org's machines. Owner-only; use it in Factory settings to link operators to machines.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  authorize: ownerGuard,
  run: async (_, ctx) => {
    const orgId = orgFor(ctx);
    const db = getDb();
    const [assignments, links, machines] = await Promise.all([
      listAppMemberRoles("munshi-desk", orgId),
      db
        .select()
        .from(schema.operatorMachines)
        .where(eq(schema.operatorMachines.orgId, orgId)),
      db
        .select()
        .from(schema.machines)
        .where(eq(schema.machines.orgId, orgId))
        .orderBy(schema.machines.stage, schema.machines.name, schema.machines.id),
    ]);
    const linkByEmail = new Map(links.map((l) => [l.operatorEmail, l.machineId]));
    return {
      operators: assignments
        .filter((a) => a.roles.includes("operator"))
        .map((a) => ({
          email: a.email,
          machineId: linkByEmail.get(a.email) ?? null,
        }))
        .sort((a, b) => a.email.localeCompare(b.email)),
      machines: machines.map((m) => ({ id: m.id, name: m.name, stage: m.stage })),
    };
  },
});
