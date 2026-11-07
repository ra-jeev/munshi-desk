import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.ts";
import { ownerGuard } from "../server/lib/access.ts";
import { orgFor } from "../server/lib/factory.ts";

// Stage 2 (Task 4): the owner acknowledges an operator alert on Today after
// planning again. Owner-only (ownerGuard). Dismissing is bookkeeping only;
// it never changes the plan.
export default defineAction({
  description:
    "Mark one operator alert on Today as seen. Owner-only. Does not change the plan.",
  schema: z.object({
    alertId: z.string().uuid().describe("Operator alert UUID from get-factory"),
  }),
  authorize: ownerGuard,
  needsApproval: true,
  allowPersistentApproval: false,
  run: async ({ alertId }, ctx) => {
    const orgId = orgFor(ctx);
    const rows = await getDb()
      .update(schema.operatorAlerts)
      .set({ resolvedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.operatorAlerts.id, alertId),
          eq(schema.operatorAlerts.orgId, orgId),
          isNull(schema.operatorAlerts.resolvedAt),
        ),
      )
      .returning({ id: schema.operatorAlerts.id });
    if (!rows.length)
      return fail("That alert is already seen or does not exist.", {
        statusCode: 404,
        errorCode: "alert_not_found",
      });
    return { ok: true, id: alertId };
  },
});
