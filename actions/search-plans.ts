import { defineAction } from "@agent-native/core/action";

import { proposalSchema } from "../server/lib/contracts.ts";
import { orgFor, snapshot, preview } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Try fixed scheduling options for an urgent order. Returns the best plan among the plans tried, including the selected operation. This is the deterministic planning fallback and the baseline for model plans.",
  schema: proposalSchema,
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) =>
    preview(await snapshot(orgFor(ctx)), args.operation, true),
});
