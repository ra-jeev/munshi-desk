// Stage 2 (Task 4): operator machine checks. Deliberately NOT accessFilter():
// every operator read and write verifies here that the job's machine is the
// caller's own linked machine (munshi_operator_machines). A job id naming any
// other machine gets a 403, so operators can never see or change money,
// orders, customers, prices or other machines — on screen or through the
// agent (operator actions return only their own jobs, stripped of those
// fields; owner actions stay ownerGuard and 403 for operators).
import { fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.ts";
import type { Operation } from "./contracts.ts";
import { preview, snapshot, todayIST, view, type Snapshot } from "./factory.ts";

/** The caller's linked machine, or 403 when the owner never linked them. */
export async function operatorMachineId(orgId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const [link] = await getDb()
    .select()
    .from(schema.operatorMachines)
    .where(
      and(
        eq(schema.operatorMachines.orgId, orgId),
        eq(schema.operatorMachines.operatorEmail, normalized),
      ),
    )
    .limit(1);
  if (!link)
    return fail("Ask the owner to link you to a machine first.", {
      statusCode: 403,
      errorCode: "operator_no_machine",
    });
  return link.machineId;
}

/** 403 when the claimed machine is not the operator's own machine. */
export function assertOwnMachine(operatorMachine: string, jobMachine: string) {
  if (jobMachine !== operatorMachine)
    return fail("That job is not on your machine.", {
      statusCode: 403,
      errorCode: "operator_wrong_machine",
    });
}

/** Only these two operation kinds may go through the operator actions. */
export function assertOperatorOperation(op: Operation) {
  if (op.kind !== "job-progress" && op.kind !== "machine-down")
    return fail("Operators can only report job progress or a machine stop.", {
      statusCode: 403,
      errorCode: "operator_forbidden_operation",
    });
  return op;
}

function datePlus(days: number) {
  const [y, m, d] = todayIST().split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Jobs on the operator's machine today and tomorrow (IST), stripped of every
 * owner-only field (no customer, money, price, due date, other machines).
 * Product/size/quantity stay: the operator needs them to do the work.
 */
export function myJobs(s: Snapshot, machineId: string) {
  const machine = s.machines.find((m) => m.id === machineId);
  if (!machine)
    return fail("Your machine is no longer in this factory.", {
      statusCode: 403,
      errorCode: "operator_no_machine",
    });
  const [today, tomorrow] = [todayIST(), datePlus(1)];
  const jobs = view(s).jobs
    .filter(
      (j) =>
        j.machineId === machineId &&
        (j.start.slice(0, 10) === today || j.start.slice(0, 10) === tomorrow),
    )
    .map((j) => {
      const order = s.orders.find((o) => o.id === j.orderId);
      return {
        id: j.id,
        orderId: j.orderId,
        stage: j.stage,
        state: j.state,
        quantity: j.quantity,
        unit: j.unit,
        product: order?.product ?? "",
        size: order?.size ?? "",
        start: j.start,
        end: j.end,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return {
    machineId,
    machineName: machine.name,
    stage: machine.stage,
    today,
    tomorrow,
    jobs,
  };
}

/**
 * Preview an operator report without saving. Reuses the owner's preview()
 * (same progress rules: full quantity, cutting before packing; same machine
 * stop rules: from+to required), then strips customer/money fields so the
 * operator never receives them.
 */
export function operatorPreview(s: Snapshot, op: Operation, now = new Date()) {
  assertOperatorOperation(op);
  const p = preview(s, op, false, now);
  return {
    id: p.id,
    plannedAt: p.plannedAt,
    requestId: p.requestId,
    revision: p.revision,
    operation: p.operation,
    machineName: p.machineName,
    orderSummary:
      "orderDetails" in p && p.orderDetails
        ? {
            product: p.orderDetails.product,
            size: p.orderDetails.size,
            quantity: p.orderDetails.quantity,
            unit: p.orderDetails.unit,
          }
        : null,
    deliveries: p.deliveries.map((d) => ({
      id: d.id,
      ready: d.ready,
      lateDays: d.lateDays,
      moved: d.moved,
    })),
    lateOrders: p.lateOrders,
    option: p.option,
  };
}

/** One-line alert text the owner sees on Today. */
export function alertDetail(op: Operation) {
  if (op.kind === "job-progress")
    return `${op.stage} ${op.status} · ${op.quantity}`;
  if (op.kind === "machine-down") return `${op.from} to ${op.to} · ${op.reason}`;
  return op.kind;
}
