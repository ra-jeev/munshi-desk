import { z } from "zod";

import { operation, type Operation } from "./contracts.ts";

// The only two operation variants operators may preview or save. Reusing the
// owner's operation union keeps the progress rules (full quantity, cutting
// before packing) and the machine-stop rules (from+to required) identical.
export type OperatorOperation = Extract<
  Operation,
  { kind: "job-progress" } | { kind: "machine-down" }
>;
const operatorOperation = z.discriminatedUnion("kind", [
  operation.options.find((o) => o.shape.kind.value === "job-progress")!,
  operation.options.find((o) => o.shape.kind.value === "machine-down")!,
]);
// GET previews (the My jobs screen) send the operation as a JSON string in the
// query, like proposalSchema in contracts.ts; agent calls send an object.
export const jobProgressOrMachineDown: z.ZodType<OperatorOperation> = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
  operatorOperation,
) as unknown as z.ZodType<OperatorOperation>;
