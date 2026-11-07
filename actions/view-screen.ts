import { defineAction } from "@agent-native/core/action";
import {
  readAppState,
  readAppStateForCurrentTab,
} from "@agent-native/core/application-state";
import { z } from "zod";

import { ownerGuard } from "../server/lib/access.ts";
import { snapshot, view } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Read the current factory screen, focused order or customer, visible schedule and relevant balances.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  // Stage 2 owner-only: it returns orders/customers/balances. TODO (Task 4): operators get their own my-jobs screen context; this stays owner-only.
  authorize: ownerGuard,
  run: async (_, ctx) => {
    const navigation =
      (await readAppStateForCurrentTab("navigation")) ??
      (await readAppState("navigation"));
    if (!ctx?.orgId || !ctx.userEmail) return { navigation };
    const data = view(await snapshot(ctx.orgId));
    const nav = navigation as {
      view?: string;
      orderId?: string;
      customerId?: string;
    } | null;
    const orders = nav?.orderId
      ? data.orders.filter((o) => o.id === nav.orderId)
      : data.orders.filter((o) => o.status === "pending").slice(0, 8);
    const accounts = nav?.customerId
      ? data.accounts.filter((c) => c.id === nav.customerId)
      : nav?.view === "accounts"
        ? data.accounts.slice(0, 8)
        : [];
    return {
      navigation,
      today: data.today,
      revision: data.revision,
      orders: orders.map((o) => ({
        ...o,
        customer: data.customers.find((c) => c.id === o.customerId)?.name,
      })),
      accounts,
      jobs: ["today", "machines"].includes(nav?.view ?? "")
        ? data.jobs.slice(0, 12)
        : [],
      ...(nav?.view === "factory-settings"
        ? {
            calendar: data.calendar,
            defaultRates: data.defaultRates,
            machines: data.machines,
          }
        : {}),
    };
  },
});
