import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { jobProgressOrMachineDown } from "../server/lib/operator-actions-schema.ts";
import { orgFor, snapshot } from "../server/lib/factory.ts";
import {
  assertOwnMachine,
  operatorMachineId,
  operatorPreview,
} from "../server/lib/operator.ts";

// Stage 2 (Task 4): operator preview (read-only). Only job-progress and
// machine-down operations, each checked against the caller's own machine
// before previewing. The result is stripped of customer/money fields.
export default defineAction({
  description:
    "Preview an operator report (job progress started/paused/done, or own machine off) without saving. Operator-only and machine-checked. Show this preview, then send the exact proposal to save-operator-report for approval.",
  schema: z.object({
    operation: jobProgressOrMachineDown.describe(
      "One operator report: job-progress or machine-down on the operator's own machine",
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ operation }, ctx) => {
    const orgId = orgFor(ctx);
    const mine = await operatorMachineId(orgId, ctx!.userEmail!);
    assertOwnMachine(mine, operation.machineId);
    return operatorPreview(await snapshot(orgId), operation);
  },
});
