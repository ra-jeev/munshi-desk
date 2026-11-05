import { fail } from "@agent-native/core/action";

import {
  dayIndex,
  workIntervals,
  type Stage,
} from "../domain/scheduler/schedule.ts";
import type { Operation } from "./contracts.ts";
import type { Snapshot } from "./factory.ts";
import { jobLifecycle, orderLifecycle } from "./lifecycle.ts";

export function localClock(now: Date) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [h = 0, m = 0] = time.split(":").map(Number);
  return { date, minute: h * 60 + m };
}
export function minuteFromIso(baseDate: string, iso: string) {
  const c = localClock(new Date(iso));
  return dayIndex(baseDate, c.date) * 1440 + c.minute;
}
export const customerKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
export function openOrder(s: Snapshot, id: string) {
  const order = s.orders.find((o) => o.id === id);
  if (!order || orderLifecycle.parseState(order.status) !== "pending")
    return fail("Open order not found.", {
      statusCode: 404,
      errorCode: "order_not_found",
    });
  return order;
}
export function revisedSnapshot(
  s: Snapshot,
  op: Operation,
  now: Date,
): Snapshot {
  if (!s.factory)
    return fail("Load demo data first.", {
      statusCode: 409,
      errorCode: "factory_missing",
    });
  if (op.kind === "add-customer") {
    if (s.customers.some((c) => customerKey(c.name) === customerKey(op.name)))
      return fail("This customer already exists. Use the existing customer.", {
        statusCode: 409,
        errorCode: "customer_exists",
      });
    return s;
  }
  if (op.kind === "update-order") {
    const order = openOrder(s, op.orderId);
    if (Object.keys(order.progress).length)
      return fail(
        "Production has started for this order. Its production details can no longer be edited.",
        { statusCode: 409, errorCode: "order_has_progress" },
      );
    return {
      ...s,
      orders: s.orders.map((o) =>
        o.id === op.orderId ? { ...o, ...op.order } : o,
      ),
    };
  }
  if (op.kind === "job-progress") {
    const order = openOrder(s, op.orderId);
    const machine = s.machines.find(
      (m) => m.id === op.machineId && m.stage === op.stage,
    );
    if (!machine)
      return fail("Choose a machine in this factory for the selected stage.", {
        statusCode: 404,
        errorCode: "machine_not_found",
      });
    if (op.quantity !== order.quantity)
      return fail(
        "Report the full order quantity for this job. Partial completion is not supported in this demo.",
        { statusCode: 422, errorCode: "partial_progress" },
      );
    if (op.stage === "packing" && order.progress.cutting?.state !== "done")
      return fail("Complete cutting before starting or completing packing.", {
        statusCode: 409,
        errorCode: "cutting_not_done",
      });
    const old = order.progress[op.stage];
    const event =
      op.status === "started"
        ? "start"
        : op.status === "paused"
          ? "pause"
          : "complete";
    const state = jobLifecycle.parseState(old?.state ?? "queued");
    if (!jobLifecycle.can(state, event))
      return fail(`This job cannot be ${op.status} from its current state.`, {
        statusCode: 409,
        errorCode: "invalid_job_transition",
      });
    if (old?.state === "running" && old.machineId !== op.machineId)
      return fail("Report progress on the machine already running this job.", {
        statusCode: 409,
        errorCode: "running_machine_changed",
      });
    if (op.status === "started") {
      if (
        s.orders.some(
          (o) =>
            o.id !== order.id &&
            Object.values(o.progress).some(
              (p) => p?.state === "running" && p.machineId === machine.id,
            ),
        )
      )
        return fail(
          "This machine is already running another job. Pause or complete that job first.",
          { statusCode: 409, errorCode: "machine_busy" },
        );
      const clock = localClock(now);
      if (
        machine.downFrom &&
        machine.downTo &&
        clock.date >= machine.downFrom &&
        clock.date <= machine.downTo
      )
        return fail("This machine is reported off today.", {
          statusCode: 409,
          errorCode: "machine_down",
        });
      if (
        !workIntervals(s.factory.calendar, clock.date, 0).some(
          ([start, end]) => clock.minute >= start && clock.minute < end,
        )
      )
        return fail(
          "The factory is outside its working hours. Update shifts or overtime before starting this job.",
          { statusCode: 409, errorCode: "outside_shift" },
        );
    }
    const progress = {
      ...order.progress,
      [op.stage]: {
        state: jobLifecycle.transition(state, event),
        machineId: op.machineId,
        startedAt:
          op.status === "started"
            ? now.toISOString()
            : (old?.startedAt ?? now.toISOString()),
        quantity: op.quantity,
      },
    };
    const status =
      progress.packing?.state === "done"
        ? orderLifecycle.transition("pending", "complete")
        : "pending";
    return {
      ...s,
      orders: s.orders.map((o) =>
        o.id === order.id ? { ...o, progress, status } : o,
      ),
    };
  }
  if (op.kind === "update-settings") {
    const running = s.orders.some((o) =>
      Object.values(o.progress).some((p) => p?.state === "running"),
    );
    const calendar = {
      ...s.factory.calendar,
      shiftStart: op.settings.shifts[0]!.start,
      shiftEnd: op.settings.shifts.at(-1)!.end,
      shifts: op.settings.shifts,
      weeklyOff: [...new Set(op.settings.weeklyOff)],
      holidays: [...new Set(op.settings.holidays)],
    };
    const changedMachines =
      op.settings.machines.length !== s.machines.length ||
      op.settings.machines.some((m) => {
        const old = s.machines.find((o) => o.id === m.id);
        return (
          !old ||
          ["name", "stage", "speedPerHour", "kgPerHour", "changeoverMin"].some(
            (k) => m[k as keyof typeof m] !== old[k as keyof typeof old],
          )
        );
      });
    const oldShifts = s.factory.calendar.shifts ?? [
      {
        start: s.factory.calendar.shiftStart,
        end: s.factory.calendar.shiftEnd,
      },
    ];
    const changedCalendar =
      JSON.stringify(oldShifts) !== JSON.stringify(calendar.shifts) ||
      JSON.stringify(s.factory.calendar.weeklyOff) !==
        JSON.stringify(calendar.weeklyOff) ||
      JSON.stringify(s.factory.calendar.holidays ?? []) !==
        JSON.stringify(calendar.holidays);
    if (running && (changedMachines || changedCalendar))
      return fail(
        "Pause running jobs before changing machines or working hours.",
        { statusCode: 409, errorCode: "running_jobs" },
      );
    return {
      ...s,
      factory: {
        ...s.factory,
        calendar,
        defaultRates: op.settings.defaultRates,
      },
      machines: op.settings.machines.map((m) => ({
        ...m,
        orgId: s.factory!.orgId,
        downFrom: s.machines.find((o) => o.id === m.id)?.downFrom ?? null,
        downTo: s.machines.find((o) => o.id === m.id)?.downTo ?? null,
        downReason: s.machines.find((o) => o.id === m.id)?.downReason ?? null,
      })),
    };
  }
  if (op.kind === "machine-down") {
    if (
      s.orders.some((o) =>
        Object.values(o.progress).some(
          (p) => p?.state === "running" && p.machineId === op.machineId,
        ),
      )
    )
      return fail("Pause the running job before reporting this machine off.", {
        statusCode: 409,
        errorCode: "machine_running",
      });
  }
  if (op.kind === "cancel-order") {
    const order = openOrder(s, op.orderId);
    if (Object.values(order.progress).some((p) => p?.state === "running"))
      return fail("Pause the running job before cancelling this order.", {
        statusCode: 409,
        errorCode: "order_running",
      });
  }
  return s;
}
export function completedStages(s: Snapshot["orders"][number]): Stage[] {
  return (["cutting", "packing"] as const).filter(
    (stage) => s.progress[stage]?.state === "done",
  );
}
