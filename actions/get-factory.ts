import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { ownerGuard } from "../server/lib/access.ts";
import { orgFor, snapshot, view } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Read the current factory orders, machine plan, customers, payments and account balances. Use these IDs and revision for proposals.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  // Stage 2 owner-only: money/orders are invisible to operators. TODO (Task 4): operators get my-jobs instead; this stays owner-only.
  authorize: ownerGuard,
  link: () => ({
    url: buildDeepLink({ view: "today", to: "/today" }),
    label: "Open factory",
  }),
  run: async (_, ctx) => view(await snapshot(orgFor(ctx))),
});
