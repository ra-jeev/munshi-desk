import { defineAction } from "@agent-native/core/action";

import { proposalSchema } from "../server/lib/contracts.ts";
import { orgFor, snapshot, preview } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Preview orders, payments, customers, progress, settings, cancellations or stops without saving. For new orders, rerun the proposed option and retain it only if at least as good as fixed search. Return the exact selected proposal and revision for approval. Show this preview before save-proposal.",
  schema: proposalSchema,
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: "munshi-proposal" },
  run: async (args, ctx) =>
    preview(await snapshot(orgFor(ctx)), args.operation),
});
