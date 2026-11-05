import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a real date",
  )
  .describe("Factory date in Asia/Kolkata, YYYY-MM-DD");
export const orderFields = z.object({
  customerId: z.string().min(1).describe("Customer UUID from get-factory"),
  product: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("Product name, for example transparent pouches"),
  size: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe("Pouch dimensions with units, for example 4x6 inch"),
  quantity: z.coerce
    .number()
    .int()
    .positive()
    .max(10000000)
    .describe("Positive quantity in the selected unit"),
  unit: z.enum(["packets", "kg"]).describe("Quantity unit, packets or kg"),
  dueDate: date,
  ratePaise: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000000)
    .describe(
      "Price per selected unit in integer Indian paise, 100 paise = INR 1",
    ),
});
export const planOption = z.object({
  place: z
    .enum(["normal", "first", "last"])
    .default("normal")
    .describe("Normal due-date order, first priority, or last priority"),
  overtime: z
    .record(
      date,
      z
        .number()
        .int()
        .min(0)
        .max(240)
        .describe("Extra work minutes after shift end, maximum 240 per day"),
    )
    .default({})
    .describe("Extra work minutes by factory date, YYYY-MM-DD"),
});
export const settingsFields = z.object({
  shifts: z
    .array(
      z.object({
        start: z
          .string()
          .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
          .describe("Shift start in IST, HH:MM"),
        end: z
          .string()
          .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/)
          .describe("Shift end in IST, HH:MM, or 24:00"),
      }),
    )
    .min(1)
    .max(3)
    .refine(
      (shifts) =>
        shifts.every(
          (v, i) =>
            v.start < v.end && (i === 0 || shifts[i - 1]!.end <= v.start),
        ),
      "Shifts must be in order and must not overlap",
    )
    .describe("One to three working shifts, sorted by start time"),
  weeklyOff: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(6)
        .describe("Weekday, Sunday 0 to Saturday 6"),
    )
    .max(6)
    .describe("Days closed each week"),
  holidays: z.array(date).max(100).describe("Factory closure dates"),
  defaultRates: z
    .object({
      packets: z
        .number()
        .int()
        .min(0)
        .max(10000000)
        .describe("Default paise per packet"),
      kg: z
        .number()
        .int()
        .min(0)
        .max(10000000)
        .describe("Default paise per kilogram"),
    })
    .describe("Default rates by quantity unit"),
  machines: z
    .array(
      z.object({
        id: z
          .string()
          .uuid()
          .describe(
            "Machine UUID, preserve existing IDs or generate a UUID for a new machine",
          ),
        name: z.string().trim().min(1).max(80).describe("Machine name"),
        stage: z.enum(["cutting", "packing"]).describe("Production stage"),
        speedPerHour: z
          .number()
          .int()
          .positive()
          .max(1000000)
          .describe("Packets per hour"),
        kgPerHour: z
          .number()
          .int()
          .positive()
          .max(100000)
          .describe("Kilograms per hour"),
        changeoverMin: z
          .number()
          .int()
          .min(0)
          .max(480)
          .describe("Size changeover minutes"),
      }),
    )
    .min(2)
    .max(50)
    .refine(
      (ms) =>
        ms.some((m) => m.stage === "cutting") &&
        ms.some((m) => m.stage === "packing"),
      "Keep at least one cutter and one packing machine",
    )
    .refine(
      (ms) => new Set(ms.map((m) => m.id)).size === ms.length,
      "Machine IDs must be unique",
    )
    .describe("Complete machine list"),
});
export const operation = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create-order").describe("Create a new order"),
    noOvertime: z
      .boolean()
      .optional()
      .describe(
        "Set true when the owner forbids overtime; all planning must respect this constraint",
      ),
    order: orderFields.describe("Validated order fields"),
    option: planOption
      .default({ place: "normal", overtime: {} })
      .describe("The exact simulated scheduling option"),
  }),
  z.object({
    kind: z.literal("record-payment").describe("Record money received"),
    customerId: z.string().min(1).describe("Customer UUID from get-factory"),
    amountPaise: z.coerce
      .number()
      .int()
      .positive()
      .max(100000000)
      .describe("Money received in integer Indian paise"),
    mode: z.enum(["cash", "UPI", "bank", "cheque"]).describe("Payment method"),
  }),
  z.object({
    kind: z.literal("cancel-order").describe("Cancel an open order"),
    orderId: z.string().min(1).describe("Existing order UUID"),
  }),
  z.object({
    kind: z
      .literal("machine-down")
      .describe("Report a machine stoppage and preview the resulting schedule"),
    machineId: z.string().min(1).describe("Machine UUID from get-factory"),
    from: date,
    to: date,
    reason: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe("Reason the machine cannot run"),
  }),
  z.object({
    kind: z.literal("update-order").describe("Edit an existing open order"),
    orderId: z.string().uuid().describe("Order UUID"),
    order: orderFields.describe("Complete revised order fields"),
  }),
  z.object({
    kind: z.literal("add-customer").describe("Add a customer"),
    name: z.string().trim().min(1).max(100).describe("Customer business name"),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{7,16}$|^$/)
      .default("")
      .describe(
        "Optional phone number, digits with optional country code, or empty",
      ),
  }),
  z.object({
    kind: z
      .literal("job-progress")
      .describe("Start, pause or complete one production stage"),
    orderId: z.string().uuid().describe("Order UUID"),
    machineId: z.string().uuid().describe("Machine UUID doing the work"),
    stage: z.enum(["cutting", "packing"]).describe("Production stage"),
    status: z.enum(["started", "paused", "done"]).describe("Progress report"),
    quantity: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Full order quantity in its unit; partial completions are not supported in this demo",
      ),
  }),
  z.object({
    kind: z
      .literal("update-settings")
      .describe(
        "Change the factory working calendar, machine speeds or default rates",
      ),
    settings: settingsFields.describe("Complete revised factory settings"),
  }),
]);
export const proposalSchema = z.object({
  operation: z
    .preprocess((value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }, operation)
    .describe("One proposed factory change as an object"),
  previewId: z
    .string()
    .uuid()
    .optional()
    .describe("Optional UUID to request a fresh preview"),
});
export const writeSchema = proposalSchema.extend({
  plannedAt: z
    .string()
    .datetime({ offset: true })
    .describe(
      "Exact preview timestamp in UTC ISO format, from check-proposal or simulate-schedule",
    ),
  requestId: z
    .string()
    .uuid()
    .describe(
      "UUID for this exact proposal. Reuse only for unchanged retries; edits need a new UUID.",
    ),
  revision: z.coerce
    .number()
    .int()
    .nonnegative()
    .describe("Schedule revision returned by the preview, never guess it"),
});
export type Operation = z.infer<typeof operation>;
export type OrderFields = z.infer<typeof orderFields>;
