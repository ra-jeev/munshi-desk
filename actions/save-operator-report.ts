import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.ts";
import { commit, orgFor, snapshot } from "../server/lib/factory.ts";
import { jobProgressOrMachineDown } from "../server/lib/operator-actions-schema.ts";
import {
  alertDetail,
  assertJobOnOwnMachine,
  operatorMachineId,
} from "../server/lib/operator.ts";

// Stage 2 (Task 4): save an operator report after the operator's own
// approval (needsApproval, preview first via check-operator-proposal, as for
// owner writes). Same save code as owner writes (commit): the report updates
// job progress / machine stop, and a new owner alert appears on Today. A plan
// change still needs a fresh owner plan/approval — this never replans.
export default defineAction({
  description:
    "Save exactly the previewed operator report after the operator approves it. Requires its schedule revision and a fresh UUID requestId. Saves job progress or a machine stop on the operator's own machine and alerts the owner. Unchanged retries reuse that UUID.",
  schema: z.object({
    operation: jobProgressOrMachineDown.describe(
      "One operator report: job-progress or machine-down on the operator's own machine",
    ),
    plannedAt: z
      .string()
      .datetime({ offset: true })
      .describe(
        "Exact preview timestamp in UTC ISO format, from check-operator-proposal",
      ),
    requestId: z
      .string()
      .uuid()
      .describe(
        "UUID for this exact proposal. Reuse only for unchanged retries; edits need a new UUID.",
      ),
    revision: z.coerce
      .number()
      .int()
      .nonnegative()
      .describe("Schedule revision returned by the preview, never guess it"),
  }),
  needsApproval: true,
  allowPersistentApproval: false,
  run: async (args, ctx) => {
    const orgId = orgFor(ctx);
    const email = ctx!.userEmail!;
    const mine = await operatorMachineId(orgId, email);
    assertJobOnOwnMachine(await snapshot(orgId), args.operation, mine);
    // Idempotency: commit() replays the stored result for a repeated
    // requestId. Only the first save creates the owner alert.
    const [prior] = await getDb()
      .select()
      .from(schema.requests)
      .where(
        and(
          eq(schema.requests.id, args.requestId),
          eq(schema.requests.orgId, orgId),
        ),
      )
      .limit(1);
    const result = await commit(orgId, args);
    if (!prior)
      await getDb()
        .insert(schema.operatorAlerts)
        .values({
          id: crypto.randomUUID(),
          orgId,
          createdAt: new Date().toISOString(),
          operatorEmail: email.trim().toLowerCase(),
          kind:
            args.operation.kind === "machine-down" ? "machine-off" : "progress",
          machineId: mine,
          detail: alertDetail(args.operation),
        });
    return { ...result, alerted: !prior };
  },
});
