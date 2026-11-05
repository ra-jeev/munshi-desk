import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { orgFor, snapshot, view } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Read the current factory orders, machine plan, customers, payments and account balances. Use these IDs and revision for proposals.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "today", to: "/today" }),
    label: "Open factory",
  }),
  run: async (_, ctx) => view(await snapshot(orgFor(ctx))),
});
