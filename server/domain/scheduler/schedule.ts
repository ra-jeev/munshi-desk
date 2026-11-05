// Deterministic two-stage scheduler: cutting → packing on parallel machines.
// Pure code (no dates from the clock, no DB) so it can be tested and re-run on
// a copied state for "what if" questions.
//
// Time is "plan minutes": minutes since 00:00 on the plan's base date, in the
// factory's local time. Dates are YYYY-MM-DD strings, weekdays come from UTC
// math on those strings, so the result does not depend on the phone's time zone.

import { sidesMm } from '../agent/size.ts';

export type Stage = 'cutting' | 'packing';
export const STAGES: Stage[] = ['cutting', 'packing'];

/**
 * A cutter is a slitter: it cuts wide film rolls into narrow ones, so its speed is kgPerHour.
 * A packing (pouch) machine makes the pouches, so its speed is speedPerHour (packets).
 * Packets and kg are turned into each other with the pouch weight (see pouchGrams).
 */
export type Machine = { id: number; name: string; stage: Stage; speedPerHour: number; kgPerHour: number; changeoverMin: number };

export type PlanOrder = {
  id: number;
  customer: string;
  size: string;
  quantity: number;
  /** 'kg' plans by weight; anything else is packets. */
  unit?: string;
  dueDate: string; // YYYY-MM-DD
  priority: number; // higher first
  createdAt: string;
  /** Stages already finished; they are not planned again. */
  doneStages?: Stage[];
  /**
   * A stage running now on this machine; it is planned first on that machine.
   * startedAt (plan minutes) keeps its end where it was; without it the whole
   * stage is planned from now.
   */
  running?: { stage: Stage; machineId: number; startedAt?: number };
};

export type Shift = { start: string; end: string };

export type Calendar = {
  /** One shift, used when `shifts` is missing. With `shifts`, the first start (kept for older code). */
  shiftStart: string;
  /** With `shifts`, the last end (kept for older code). */
  shiftEnd: string;
  /**
   * 1 to 3 shifts in order ("HH:MM", end may be "24:00"). Work is done only
   * inside them; the time between two shifts is closed.
   */
  shifts?: Shift[];
  weeklyOff: number[];
  /** Dates (YYYY-MM-DD) the factory is closed, like the weekly off. */
  holidays?: string[];
  /** Extra minutes after the last shift's end on a date (YYYY-MM-DD), for all machines. */
  overtime?: Record<string, number>;
};
export type Down = { machineId: number; from: number; to: number }; // plan minutes

export type PlanInput = {
  baseDate: string; // day 0
  now: number; // plan minutes
  calendar: Calendar;
  machines: Machine[];
  orders: PlanOrder[];
  down?: Down[];
  /** Size each machine last ran, for the first changeover. */
  lastSize?: Record<number, string>;
  /** Film weight in grams per m² (both layers together), for turning packets into kg. */
  filmGsm?: number;
};

export type PlannedJob = {
  orderId: number;
  stage: Stage;
  machineId: number;
  seq: number;
  start: number;
  end: number;
  changeover: boolean;
  /** A running stage that should have finished by now; ask the owner. */
  overdue?: boolean;
};

export type OrderResult = {
  orderId: number;
  finish: number;
  dueBy: number; // end of the last shift on the due date
  lateMin: number; // > 0 means late
  lateDays: number; // calendar days past the due date
};

export type Plan = { jobs: PlannedJob[]; orders: OrderResult[] };

const DAY = 1440;
const MAX_DAYS = 366;

export function hm(s: string) {
  const [h = 0, m = 0] = s.split(':').map(Number);
  return h * 60 + m;
}

function dayNumber(iso: string) {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Day index of `iso` relative to `baseDate`. */
export function dayIndex(baseDate: string, iso: string) {
  return dayNumber(iso) - dayNumber(baseDate);
}

export function dateOf(baseDate: string, day: number) {
  return new Date((dayNumber(baseDate) + day) * 86_400_000).toISOString().slice(0, 10);
}

function weekday(baseDate: string, day: number) {
  return new Date((dayNumber(baseDate) + day) * 86_400_000).getUTCDay();
}

/** Closed on this day: the weekly off or a holiday. */
export function isClosed(calendar: Calendar, baseDate: string, day: number) {
  return calendar.weeklyOff.includes(weekday(baseDate, day)) || (calendar.holidays?.includes(dateOf(baseDate, day)) ?? false);
}

/** The shifts of a working day: `shifts`, or the one shiftStart–shiftEnd. */
export function shiftsOf(calendar: Calendar): Shift[] {
  return calendar.shifts?.length ? calendar.shifts : [{ start: calendar.shiftStart, end: calendar.shiftEnd }];
}

/** Minutes after 00:00 when the first shift starts. */
export function dayStart(calendar: Calendar) {
  return hm(shiftsOf(calendar)[0]!.start);
}

/** Minutes after 00:00 when the last shift ends (no overtime). */
export function dayEnd(calendar: Calendar) {
  return hm(shiftsOf(calendar).at(-1)!.end);
}

/**
 * Working time on a day as [from, to) plan minutes, in order: the shifts, the
 * last one made longer by that date's overtime. None on a closed day.
 */
export function workIntervals(calendar: Calendar, baseDate: string, day: number): [number, number][] {
  if (isClosed(calendar, baseDate, day)) return [];
  const out = shiftsOf(calendar).map<[number, number]>((x) => [day * DAY + hm(x.start), day * DAY + hm(x.end)]);
  out[out.length - 1]![1] += calendar.overtime?.[dateOf(baseDate, day)] ?? 0;
  return out;
}

/** "YYYY-MM-DD HH:MM" for a plan minute. */
export function stamp(baseDate: string, t: number) {
  const day = Math.floor(t / DAY);
  const m = t - day * DAY;
  return `${dateOf(baseDate, day)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Do `minutes` of work on a machine starting no earlier than `from`, only
 * inside shift hours (never between two shifts) and outside its down windows.
 * Splits across shifts and days. Returns when the work really started and when it ends.
 */
export function placeWork(input: Pick<PlanInput, 'baseDate' | 'calendar'>, down: Down[], from: number, minutes: number) {
  const blocks = [...down].sort((a, b) => a.from - b.from);

  let t = from;
  let left = minutes;
  let start: number | null = null;
  for (let day = Math.floor(from / DAY); day < Math.floor(from / DAY) + MAX_DAYS; day++) {
    for (const [s, e] of workIntervals(input.calendar, input.baseDate, day)) {
      let a = Math.max(t, s);
      while (a < e) {
        // Skip past any down window covering a.
        const blocking = blocks.find((d) => d.from <= a && d.to > a);
        if (blocking) {
          a = blocking.to;
          continue;
        }
        const nextDown = blocks.find((d) => d.from > a);
        const b = Math.min(e, nextDown ? nextDown.from : Infinity);
        if (left === 0) return { start: a, end: a };
        start ??= a;
        const take = Math.min(left, b - a);
        left -= take;
        a += take;
        if (left === 0) return { start, end: a };
      }
      // Overtime past midnight must not be used again by the next day.
      t = Math.max(t, a);
    }
    t = Math.max(t, (day + 1) * DAY);
  }
  throw new Error('Plan is more than a year long; check machine speeds and shift hours.');
}

/** Film per m² of one pouch side, when the owner has not set it: a common clear + metallised laminate. */
export const DEFAULT_FILM_GSM = 60;
/** Used when the size is not two numbers ("12 inch"). */
const FALLBACK_POUCH_GRAMS = 4;

/** Grams of film in one flat pouch: two sides of width x length. */
export function pouchGrams(size: string, gsm = DEFAULT_FILM_GSM) {
  const sides = sidesMm(size);
  if (sides.length !== 2 || !(gsm > 0)) return FALLBACK_POUCH_GRAMS;
  return ((sides[0]! / 1000) * (sides[1]! / 1000) * 2 * gsm) || FALLBACK_POUCH_GRAMS;
}

/** The cutter slits kg of film; the pouch machine makes packets. */
function workMinutes(o: PlanOrder, m: Machine, gsm?: number) {
  const grams = pouchGrams(o.size, gsm);
  const hours =
    m.stage === 'cutting'
      ? (o.unit === 'kg' ? o.quantity : (o.quantity * grams) / 1000) / m.kgPerHour
      : (o.unit === 'kg' ? (o.quantity * 1000) / grams : o.quantity) / m.speedPerHour;
  return Math.max(1, Math.ceil(hours * 60));
}

function orderSort(a: PlanOrder, b: PlanOrder) {
  const ra = a.running ? 1 : 0;
  const rb = b.running ? 1 : 0;
  return rb - ra || b.priority - a.priority || a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
}

/** A job placed on a machine, kept so later jobs can fill the gaps around it. */
type Block = {
  job: PlannedJob;
  size: string;
  /** Earliest its work may start (now, or its cutting end for packing). */
  ready: number;
  /** Work minutes without the changeover. */
  work: number;
  /** A running stage: it never moves and nothing is put before it. */
  running: boolean;
};

/** Where a job would go on one machine. Computing it changes nothing. */
type Fit = {
  m: Machine;
  changeover: boolean;
  start: number;
  end: number;
  overdue: boolean;
  /** Size of the job just before it (or the machine's last size), null if unknown. */
  prevSize: string | null;
  /** Index in the machine's block list where it goes. */
  at: number;
  /** New times for the block after it, when its changeover changes because of this job. */
  next?: { start: number; end: number; changeover: boolean };
};

export function schedule(input: PlanInput): Plan {
  const down = input.down ?? [];
  const e = dayEnd(input.calendar);
  const lastSize = new Map(input.machines.map((m) => [m.id, input.lastSize?.[m.id] ?? null] as const));
  const blocks = new Map<number, Block[]>(input.machines.map((m) => [m.id, []]));
  const jobs: PlannedJob[] = [];
  const done: { o: PlanOrder; dueBy: number; jobs: PlannedJob[] }[] = [];

  /**
   * The earliest gap on machine `m` where the job fits, at or after `ready`.
   * Gaps are tried in time order, so the first one that fits also ends first.
   * A gap fits when the job (with its own changeover) ends before the next
   * block starts, and the next block still ends by its planned end with the
   * changeover it now needs (it follows this job's size). Nothing goes before
   * a running block.
   */
  function fit(m: Machine, o: PlanOrder, run: PlanOrder['running'], ready: number): Fit {
    const mDown = down.filter((d) => d.machineId === m.id);
    const list = blocks.get(m.id)!;
    const work = workMinutes(o, m, input.filmGsm);

    if (run?.startedAt != null) {
      // Already started: the setup is done and the work keeps its place.
      const slot = placeWork(input, mDown, run.startedAt, work);
      const at = list.findIndex((b) => b.job.start > slot.start);
      return {
        m,
        changeover: false,
        start: slot.start,
        end: Math.max(slot.end, input.now),
        overdue: slot.end < input.now,
        prevSize: null,
        at: at < 0 ? list.length : at,
      };
    }

    const from = Math.max(ready, input.now);
    for (let i = 0; i <= list.length; i++) {
      const prev = i > 0 ? list[i - 1] : undefined;
      const next = list[i] as Block | undefined;
      if (next?.running) continue;
      const gapFrom = Math.max(from, prev ? prev.job.end : from);
      if (next && gapFrom >= next.job.start) continue;
      const prevSize = prev ? prev.size : (lastSize.get(m.id) ?? null);
      const changeover = !run && prevSize != null && prevSize !== o.size;
      const slot = placeWork(input, mDown, gapFrom, work + (changeover ? m.changeoverMin : 0));
      const base = { m, changeover, start: slot.start, end: slot.end, overdue: false, prevSize, at: i };
      if (!next) return base;

      const need = next.size !== o.size;
      if (need === next.job.changeover) {
        if (slot.end <= next.job.start) return base;
        continue;
      }
      // The next block's changeover changes: plan it again right after this job
      // (and not before its own ready time). Its end must not get later.
      const moved = placeWork(input, mDown, Math.max(slot.end, next.ready), next.work + (need ? m.changeoverMin : 0));
      if (moved.end <= next.job.end) return { ...base, next: { start: moved.start, end: moved.end, changeover: need } };
    }
    throw new Error('unreachable: the gap after the last block always fits');
  }

  /** Where each machine of this stage could do it, earliest finish first. Changes nothing. */
  function options(o: PlanOrder, stage: Stage, ready: number) {
    const machines = input.machines.filter((m) => m.stage === stage);
    if (machines.length === 0) throw new Error(`No machine for ${stage}`);
    const run = o.running?.stage === stage ? o.running : undefined;
    return (run ? machines.filter((m) => m.id === run.machineId) : machines)
      .map((m) => fit(m, o, run, ready))
      .sort((a, b) => a.end - b.end || a.m.id - b.m.id);
  }

  /** Earliest the remaining stages could finish if the next one can start at `ready`. */
  function finishRest(o: PlanOrder, stages: Stage[], ready: number) {
    for (const stage of stages) ready = options(o, stage, ready)[0]!.end;
    return ready;
  }

  for (const o of [...input.orders].sort(orderSort)) {
    const dueBy = dayIndex(input.baseDate, o.dueDate) * DAY + e;
    const todo = STAGES.filter((stage) => !o.doneStages?.includes(stage));
    const mine: PlannedJob[] = [];
    let ready = input.now;

    todo.forEach((stage, i) => {
      const opts = options(o, stage, ready);
      // Earliest finish wins. A same-size slot (no changeover) wins only if
      // the whole order, later stages included, still finishes on time.
      const sameSize = opts.find(
        (x) => !x.changeover && x.prevSize === o.size && x !== opts[0] && finishRest(o, todo.slice(i + 1), x.end) <= dueBy,
      );
      const pick = sameSize ?? opts[0]!;
      const list = blocks.get(pick.m.id)!;

      if (pick.next) {
        const nb = list[pick.at]!;
        nb.job.start = pick.next.start;
        nb.job.end = pick.next.end;
        nb.job.changeover = pick.next.changeover;
      }
      const job: PlannedJob = {
        orderId: o.id,
        stage,
        machineId: pick.m.id,
        seq: 0, // set at the end, in start order per machine
        start: pick.start,
        end: pick.end,
        changeover: pick.changeover,
        ...(pick.overdue ? { overdue: true } : {}),
      };
      const run = o.running?.stage === stage;
      list.splice(pick.at, 0, { job, size: o.size, ready: Math.max(ready, input.now), work: workMinutes(o, pick.m, input.filmGsm), running: run });
      jobs.push(job);
      mine.push(job);
      ready = pick.end;
    });
    done.push({ o, dueBy, jobs: mine });
  }

  for (const list of blocks.values()) {
    list.sort((a, b) => a.job.start - b.job.start);
    list.forEach((b, i) => (b.job.seq = i + 1));
  }

  // Finish times are read at the end: a later job can move an earlier one
  // forward (when it saves that job a changeover).
  const results: OrderResult[] = done.map(({ o, dueBy, jobs: mine }) => {
    const finish = mine.length ? mine[mine.length - 1]!.end : input.now;
    const lateMin = Math.max(0, finish - dueBy);
    const lateDays = Math.max(0, Math.floor(finish / DAY) - dayIndex(input.baseDate, o.dueDate));
    return { orderId: o.id, finish, dueBy, lateMin, lateDays };
  });

  return { jobs, orders: results };
}
