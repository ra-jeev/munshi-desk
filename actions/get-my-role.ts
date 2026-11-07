import { defineAction } from "@agent-native/core/action";
import { listAppMemberRoles } from "@agent-native/core/org-team";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.ts";
import { orgFor } from "../server/lib/factory.ts";

// Stage 2 (Task 4): who am I in this org? Any signed-in member may call it.
// The client uses it to gate navigation (operators see My jobs, not the
// factory screens). For an operator it returns only their own machine.
export default defineAction({
  description:
    "Return the caller's Munshi role in this org (owner or operator) and, for operators, their own linked machine.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_, ctx) => {
    const orgId = orgFor(ctx);
    const email = ctx!.userEmail!.trim().toLowerCase();
    const assignments = await listAppMemberRoles("munshi-desk", orgId);
    const mine = assignments.find(
      (a) => a.email.toLowerCase() === email,
    );
    const roles = mine?.roles ?? [];
    // No app-role row at all = org creator path (allowOrgAdmins): an owner.
    const role = roles.includes("operator") && !roles.includes("owner")
      ? "operator"
      : "owner";
    let machineId: string | null = null;
    let machineName: string | null = null;
    if (role === "operator") {
      const [link] = await getDb()
        .select({
          machineId: schema.operatorMachines.machineId,
          name: schema.machines.name,
        })
        .from(schema.operatorMachines)
        .innerJoin(
          schema.machines,
          eq(schema.machines.id, schema.operatorMachines.machineId),
        )
        .where(
          and(
            eq(schema.operatorMachines.orgId, orgId),
            eq(schema.operatorMachines.operatorEmail, email),
          ),
        )
        .limit(1);
      machineId = link?.machineId ?? null;
      machineName = link?.name ?? null;
    }
    return { role, email, machineId, machineName };
  },
});
