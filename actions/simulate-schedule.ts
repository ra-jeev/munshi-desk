import { defineAction } from "@agent-native/core/action";

import { ownerGuard } from "../server/lib/access.ts";
import { proposalSchema } from "../server/lib/contracts.ts";
import { orgFor, snapshot, preview } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Simulate an exact proposed order placement, overtime or machine stoppage on the real scheduler. Returns delivery times and who moves. Does not save.",
  schema: proposalSchema,
  http: { method: "GET" },
  readOnly: true,
  // Stage 2 owner-only. TODO (Task 4): operators get their own machine-checked reads.
  authorize: ownerGuard,
  run: async (args, ctx) =>
    preview(
      await snapshot(orgFor(ctx)),
      args.operation,
      false,
      new Date(),
      true,
    ),
});
