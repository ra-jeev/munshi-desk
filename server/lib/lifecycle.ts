import { defineMachine } from "@agent-native/core/state-machine";

import type { Stage } from "../domain/scheduler/schedule.ts";
export const orderLifecycle = defineMachine({
  id: "munshi-order",
  states: ["pending", "done", "cancelled"] as const,
  initial: "pending",
  terminal: ["done", "cancelled"],
  transitions: {
    complete: { from: ["pending"], to: "done" },
    cancel: { from: ["pending"], to: "cancelled" },
  },
});
export const jobLifecycle = defineMachine({
  id: "munshi-job",
  states: ["queued", "running", "paused", "done"] as const,
  initial: "queued",
  terminal: ["done"],
  transitions: {
    start: { from: ["queued", "paused"], to: "running" },
    pause: { from: ["running"], to: "paused" },
    complete: { from: ["queued", "running", "paused"], to: "done" },
  },
});
export type JobProgress = {
  state: "queued" | "running" | "paused" | "done";
  machineId: string;
  startedAt: string;
  quantity: number;
};
export type OrderProgress = Partial<Record<Stage, JobProgress>>;
