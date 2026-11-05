import { defineAction } from "@agent-native/core/action";

import { proposalSchema } from "../server/lib/contracts.ts";
import { orgFor, snapshot, preview } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Simulate an exact proposed order placement, overtime or machine stoppage on the real scheduler. Returns delivery times and who moves. Does not save.",
  schema: proposalSchema,
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) =>
    preview(
      await snapshot(orgFor(ctx)),
      args.operation,
      false,
      new Date(),
      true,
    ),
});
