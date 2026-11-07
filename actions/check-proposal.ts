import { defineAction } from "@agent-native/core/action";

import { ownerGuard } from "../server/lib/access.ts";
import { proposalSchema } from "../server/lib/contracts.ts";
import { orgFor, snapshot, preview } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Preview orders, payments, customers, progress, settings, cancellations or stops without saving. For new orders, rerun the proposed option and retain it only if at least as good as fixed search. Return the exact selected proposal and revision for approval. Show this preview before save-proposal.",
  schema: proposalSchema,
  http: { method: "GET" },
  readOnly: true,
  // Stage 2 owner-only (includes record-payment previews). TODO (Task 4): Task 4 adds operator preview actions with machine checks; this stays owner-only.
  authorize: ownerGuard,
  chatUI: { renderer: "munshi-proposal" },
  run: async (args, ctx) =>
    preview(await snapshot(orgFor(ctx)), args.operation),
});
