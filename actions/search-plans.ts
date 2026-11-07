import { defineAction } from "@agent-native/core/action";

import { ownerGuard } from "../server/lib/access.ts";
import { proposalSchema } from "../server/lib/contracts.ts";
import { orgFor, snapshot, preview } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Try fixed scheduling options for an urgent order. Returns the best plan among the plans tried, including the selected operation. This is the deterministic planning fallback and the baseline for model plans.",
  schema: proposalSchema,
  http: { method: "GET" },
  readOnly: true,
  // Stage 2 owner-only. TODO (Task 4): operators get their own machine-checked reads.
  authorize: ownerGuard,
  run: async (args, ctx) =>
    preview(await snapshot(orgFor(ctx)), args.operation, true),
});
