// "What if" on the real scheduler: add or change one order, move it first or last, or
// add overtime, and see when it is ready and whose orders get late because of it.
// Pure code, so the planner (Muse Wonder, or the fallback search) can try many
// options without touching the database.

import { dateOf, dayIndex, isClosed, schedule, stamp, type PlanInput, type PlanOrder } from './schedule.ts';

/** Id used for an order that is not saved yet. */
export const NEW_ORDER_ID = -1;
export const MAX_OVERTIME_MIN = 4 * 60;

export type Change =
  /** extra: more items of the same message, planned with the first one and placed like it. */
  | { kind: 'add'; order: PlanOrder; extra?: PlanOrder[] }
  | { kind: 'patch'; orderId: number; patch: Partial<Pick<PlanOrder, 'dueDate' | 'quantity' | 'unit' | 'size'>> };

export type Option = {
  /**
   * first: before every other open order. last: after them (it waits, nobody
   * else moves). normal: by due date like any order, which can still push others.
   */
  place: Place;
  /** Extra minutes after shift end on a date (YYYY-MM-DD), all machines. */
  overtime: Record<string, number>;
};

export type Place = 'first' | 'normal' | 'last';
export const PLACES: Place[] = ['normal', 'first', 'last'];
export const AS_IS: Option = { place: 'normal', overtime: {} };

export type Hurt = { orderId: number; customer: string; dueDate: string; wasLateDays: number; lateDays: number; ready: string };

export type Outcome = {
  option: Option;
  targetId: number;
  ready: string; // "YYYY-MM-DD HH:MM"
  lateDays: number;
  /** Other orders that finish more days late than in today's plan. */
  hurt: Hurt[];
  overtimeMin: number;
  /** The target's priority with this option, to save with it. */
  priority: number;
};

const targetId = (c: Change) => (c.kind === 'add' ? c.order.id : c.orderId);

export function simulate(base: PlanInput, change: Change, option: Option = AS_IS): Outcome {
  const before = schedule(base);
  const id = targetId(change);

  // Only the fields that are set: an undefined quantity must not wipe the real one.
  const patch = change.kind === 'patch' ? Object.fromEntries(Object.entries(change.patch).filter(([, v]) => v != null)) : {};
  let orders = base.orders.map((o) => (change.kind === 'patch' && o.id === id ? { ...o, ...patch } : o));
  if (change.kind === 'add') orders = [...orders, change.order, ...(change.extra ?? [])];
  const mineIds = new Set([id, ...(change.kind === 'add' ? (change.extra ?? []).map((o) => o.id) : [])]);
  const target = orders.find((o) => o.id === id);
  if (!target) throw new Error(`simulate(): order ${id} is not open`);
  const others = base.orders.filter((o) => !mineIds.has(o.id)).map((o) => o.priority);
  const priority =
    option.place === 'first' ? Math.max(0, ...others) + 1 : option.place === 'last' ? Math.min(0, ...others) - 1 : target.priority;
  orders = orders.map((o) => (mineIds.has(o.id) ? { ...o, priority } : o));

  const overtime = { ...(base.calendar.overtime ?? {}) };
  for (const [date, min] of Object.entries(option.overtime)) overtime[date] = Math.max(overtime[date] ?? 0, min);
  const after = schedule({ ...base, orders, calendar: { ...base.calendar, overtime } });

  const was = new Map(before.orders.map((r) => [r.orderId, r]));
  const hurt: Hurt[] = [];
  for (const r of after.orders) {
    if (mineIds.has(r.orderId)) continue;
    const old = was.get(r.orderId);
    if (!old || r.lateDays <= old.lateDays) continue;
    const o = orders.find((x) => x.id === r.orderId)!;
    hurt.push({ orderId: o.id, customer: o.customer, dueDate: o.dueDate, wasLateDays: old.lateDays, lateDays: r.lateDays, ready: stamp(base.baseDate, r.finish) });
  }
  // Several items: ready when the last one is, late by the latest one.
  const mine = after.orders.filter((r) => mineIds.has(r.orderId));
  const finish = Math.max(...mine.map((r) => r.finish));
  return {
    option,
    targetId: id,
    ready: stamp(base.baseDate, finish),
    lateDays: Math.max(...mine.map((r) => r.lateDays)),
    hurt,
    overtimeMin: Object.values(option.overtime).reduce((n, m) => n + m, 0),
    priority,
  };
}

/** Same order of preference the planner is asked to follow. */
export function better(a: Outcome, b: Outcome) {
  const key = (o: Outcome) => [
    o.lateDays > 0 ? 1 : 0,
    o.hurt.length,
    o.hurt.reduce((n, h) => n + h.lateDays - h.wasLateDays, 0),
    o.lateDays,
    o.overtimeMin,
    o.option.place === 'normal' ? 0 : 1,
  ];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? a : b;
  return a;
}

/** Working dates from today up to the target's due date (at most `max`), for overtime. */
export function overtimeDates(base: PlanInput, dueDate: string, max = 3) {
  const out: string[] = [];
  const last = Math.max(0, dayIndex(base.baseDate, dueDate));
  for (let d = 0; d <= last && out.length < max; d++) {
    if (!isClosed(base.calendar, base.baseDate, d)) out.push(dateOf(base.baseDate, d));
  }
  return out;
}

/**
 * "When can it be ready?": the order planned by its due date like any other,
 * with no extra overtime. Nothing moves on purpose, so it is the honest answer.
 */
export function readyEstimate(base: PlanInput, change: Change): Pick<Outcome, 'ready' | 'lateDays' | 'hurt'> {
  const { ready, lateDays, hurt } = simulate(base, change, AS_IS);
  return { ready, lateDays, hurt };
}

export type SearchOpts = {
  /** The owner said no overtime: only try places. */
  noOvertime?: boolean;
};

/**
 * The fallback planner: try a small, fixed set of options and keep the best.
 * Used when Muse Wonder is slow or fails, and to check that its pick is sane.
 */
export function bestOption(base: PlanInput, change: Change, opts: SearchOpts = {}): Outcome {
  const tries: Option[] = PLACES.map((place) => ({ place, overtime: {} }));
  if (opts.noOvertime) return tries.map((t) => simulate(base, change, t)).reduce(better);
  const due = change.kind === 'add' ? [change.order, ...(change.extra ?? [])].map((o) => o.dueDate).sort().at(-1)! : (change.patch.dueDate ?? base.orders.find((o) => o.id === change.orderId)!.dueDate);
  const dates = overtimeDates(base, due);
  for (const place of PLACES) {
    for (const hours of [1, 2, 4]) {
      for (let n = 1; n <= dates.length; n++) {
        tries.push({ place, overtime: Object.fromEntries(dates.slice(0, n).map((d) => [d, hours * 60])) });
      }
    }
  }
  return tries.map((t) => simulate(base, change, t)).reduce(better);
}

/** True when the owner should choose: the order is late as planned, or it makes someone else late. */
export function hasConflict(o: Outcome) {
  return o.lateDays > 0 || o.hurt.length > 0;
}
