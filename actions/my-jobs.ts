import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { orgFor, snapshot } from "../server/lib/factory.ts";
import { myJobs, operatorMachineId } from "../server/lib/operator.ts";

// Stage 2 (Task 4): operator-only read. NOT ownerGuard: the machine check in
// run() is the authorization (see server/lib/operator.ts). Returns only the
// operator's own machine jobs, today and tomorrow (IST), with no money,
// customers, prices, orders detail or other machines.
export default defineAction({
  description:
    "Read jobs on the operator's own machine today and tomorrow (IST). Operator-only; the returned jobs are stripped of money, customers, prices and other machines. Call before report-progress.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_, ctx) => {
    const orgId = orgFor(ctx);
    const machineId = await operatorMachineId(orgId, ctx!.userEmail!);
    return myJobs(await snapshot(orgId), machineId);
  },
});
