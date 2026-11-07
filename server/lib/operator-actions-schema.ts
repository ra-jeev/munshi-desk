import { z } from "zod";

import { operation, type Operation } from "./contracts.ts";

// The only two operation variants operators may preview or save. Reusing the
// owner's operation union keeps the progress rules (full quantity, cutting
// before packing) and the machine-stop rules (from+to required) identical.
export type OperatorOperation = Extract<
  Operation,
  { kind: "job-progress" } | { kind: "machine-down" }
>;
export const jobProgressOrMachineDown: z.ZodType<OperatorOperation> =
  z.discriminatedUnion("kind", [
    operation.options.find((o) => o.shape.kind.value === "job-progress")!,
    operation.options.find((o) => o.shape.kind.value === "machine-down")!,
  ]) as unknown as z.ZodType<OperatorOperation>;
