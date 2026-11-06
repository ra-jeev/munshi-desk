import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayIndex, placeWork, pouchGrams, schedule, stamp, type Machine, type PlanInput, type PlanOrder } from './schedule.ts';

const BASE = '2026-10-28'; // a Wednesday
const CAL = { shiftStart: '09:00', shiftEnd: '19:00', weeklyOff: [0] };
const MACHINES: Machine[] = [
  { id: 1, name: 'Cutter 1', stage: 'cutting', speedPerHour: 1500, kgPerHour: 5, changeoverMin: 30 },
  { id: 2, name: 'Cutter 2', stage: 'cutting', speedPerHour: 1200, kgPerHour: 5, changeoverMin: 30 },
  { id: 3, name: 'Packet Machine', stage: 'packing', speedPerHour: 1000, kgPerHour: 5, changeoverMin: 20 },
];
/**
 * A cutter is timed in kg of film, a packing machine in packets. These machines cut a pouch of
 * this size at the packets-per-hour they have in speedPerHour (or in `speeds`, by id), so a
 * packet order takes the same time to cut as it did when cutters ran in packets per hour.
 */
const machinesFor = (size: string, speeds: Record<number, number> = {}): Machine[] =>
  MACHINES.map((m) => (m.stage === 'cutting' ? { ...m, kgPerHour: ((speeds[m.id] ?? m.speedPerHour) * pouchGrams(size)) / 1000 } : m));
const M8x12 = machinesFor('8x12 inch');
const at = (day: number, h: number, m = 0) => day * 1440 + h * 60 + m;

function order(id: number, size: string, quantity: number, dueDate: string, extra: Partial<PlanOrder> = {}): PlanOrder {
  return { id, customer: `C${id}`, size, quantity, dueDate, priority: 0, createdAt: `2026-10-01 00:00:0${id % 10}`, ...extra };
}

function input(orders: PlanOrder[], extra: Partial<PlanInput> = {}): PlanInput {
  return { baseDate: BASE, now: at(0, 9), calendar: CAL, machines: MACHINES, orders, ...extra };
}

test('placeWork: splits across the shift end into the next day', () => {
  const r = placeWork({ baseDate: BASE, calendar: CAL }, [], at(0, 18), 120);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end)], ['2026-10-28 18:00', '2026-10-29 10:00']);
});

test('placeWork: work before the shift starts waits for 09:00', () => {
  const r = placeWork({ baseDate: BASE, calendar: CAL }, [], at(0, 6), 60);
  assert.equal(stamp(BASE, r.start), '2026-10-28 09:00');
});

test('placeWork: skips Sunday', () => {
  // Sat 2026-10-31 18:00 + 2 h → Mon 2026-11-02 10:00
  const r = placeWork({ baseDate: BASE, calendar: CAL }, [], at(3, 18), 120);
  assert.equal(stamp(BASE, r.end), '2026-11-02 10:00');
});

test('placeWork: machine down window is skipped', () => {
  const r = placeWork({ baseDate: BASE, calendar: CAL }, [{ machineId: 1, from: at(0, 10), to: at(0, 12) }], at(0, 9), 120);
  assert.equal(stamp(BASE, r.end), '2026-10-28 13:00');
});

test('schedule: packing starts after cutting ends, and machines never overlap', () => {
  const orders = [1, 2, 3, 4, 5, 6].map((i) => order(i, `4x${(i % 3) * 2 + 8} inch`, 1000 * i, '2026-11-05'));
  const plan = schedule(input(orders));
  for (const o of orders) {
    const cut = plan.jobs.find((j) => j.orderId === o.id && j.stage === 'cutting')!;
    const pack = plan.jobs.find((j) => j.orderId === o.id && j.stage === 'packing')!;
    assert.ok(pack.start >= cut.end, `order ${o.id}`);
  }
  for (const m of MACHINES) {
    const js = plan.jobs.filter((j) => j.machineId === m.id).sort((a, b) => a.start - b.start);
    for (let i = 1; i < js.length; i++) assert.ok(js[i].start >= js[i - 1].end, `overlap on ${m.name}`);
  }
});

test('schedule: changeover only when the size changes', () => {
  const plan = schedule(
    input([order(1, '8x12 inch', 1500, '2026-11-05'), order(2, '8x12 inch', 1500, '2026-11-05'), order(3, '5x8 inch', 1500, '2026-11-05')]),
  );
  const packing = plan.jobs.filter((j) => j.stage === 'packing').sort((a, b) => a.seq - b.seq);
  assert.deepEqual(
    packing.map((j) => j.changeover),
    [false, false, true],
  );
});

test('schedule: earliest due date goes first; a too-tight order is marked late', () => {
  const plan = schedule(input([order(1, '8x12 inch', 30000, '2026-11-10'), order(2, '6x10 inch', 9000, '2026-10-28')]));
  const first = plan.jobs.find((j) => j.machineId === 3 && j.seq === 1)!;
  assert.equal(first.orderId, 2);
  const r2 = plan.orders.find((r) => r.orderId === 2)!;
  // 9000 at 1000/h packing alone is 9 h, after cutting: cannot finish by 19:00 today.
  assert.ok(r2.lateMin > 0);
  assert.equal(r2.lateDays, 1);
});

test('schedule: higher priority jumps the queue', () => {
  const plan = schedule(input([order(1, '8x12 inch', 2000, '2026-10-29'), order(2, '8x12 inch', 2000, '2026-11-04', { priority: 1 })]));
  assert.equal(plan.jobs.find((j) => j.machineId === 3 && j.seq === 1)!.orderId, 2);
});

test('schedule: a running stage stays on its machine and a done stage is not planned', () => {
  const plan = schedule(
    input([
      order(1, '4x6 inch', 2000, '2026-11-02'),
      order(2, '4x6 inch', 2000, '2026-11-02', { running: { stage: 'cutting', machineId: 2 } }),
      order(3, '4x6 inch', 2000, '2026-11-02', { doneStages: ['cutting'] }),
    ]),
  );
  const cut2 = plan.jobs.find((j) => j.orderId === 2 && j.stage === 'cutting')!;
  assert.equal(cut2.machineId, 2);
  assert.equal(cut2.seq, 1);
  assert.equal(plan.jobs.filter((j) => j.orderId === 3).length, 1);
});

test('schedule: same-size machine is preferred when it is still on time', () => {
  const plan = schedule(input([order(1, '5x8 inch', 1200, '2026-11-05')], { lastSize: { 1: '8x12 inch', 2: '5x8 inch' } }));
  assert.equal(plan.jobs.find((j) => j.stage === 'cutting')!.machineId, 2);
});

test('dayIndex counts calendar days', () => {
  assert.equal(dayIndex(BASE, '2026-11-02'), 5);
});

test('schedule: same-size machine is not used when packing would then finish late', () => {
  // Cutter 2 already has 5x8 inch but is slow: cutting ends 15:40, packing 19:40 (late).
  // Cutter 1 needs a size change but ends 12:10, packing 16:10 (on time).
  const machines = machinesFor('5x8 inch', { 2: 600 });
  const plan = schedule(input([order(1, '5x8 inch', 4000, BASE)], { machines, lastSize: { 1: '8x12 inch', 2: '5x8 inch' } }));
  assert.equal(plan.jobs.find((j) => j.stage === 'cutting')!.machineId, 1);
  assert.equal(plan.orders[0].lateMin, 0);
});

test('schedule: a running stage keeps its start; an overdue one is flagged', () => {
  const run = { stage: 'cutting' as const, machineId: 1, startedAt: at(0, 9) };
  const plan = schedule(input([order(1, '8x12 inch', 3000, '2026-11-02', { running: run })], { now: at(0, 10), machines: M8x12 }));
  assert.equal(stamp(BASE, plan.jobs[0].end), '2026-10-28 11:00');
  const late = schedule(input([order(1, '8x12 inch', 3000, '2026-11-02', { running: run })], { now: at(0, 12), machines: M8x12 }));
  assert.equal(late.jobs[0].overdue, true);
  assert.equal(late.jobs[0].end, at(0, 12));
});

test('placeWork: a holiday is skipped like the weekly off', () => {
  const cal = { ...CAL, holidays: ['2026-10-29'] };
  const r = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 18), 120);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end)], ['2026-10-28 18:00', '2026-10-30 10:00']);
});

test('placeWork: a shift ending at 24:00 runs to midnight', () => {
  const cal = { ...CAL, shiftStart: '08:00', shiftEnd: '24:00' };
  const r = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 22), 180);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end)], ['2026-10-28 22:00', '2026-10-29 09:00']);
});

test('placeWork: overtime makes the day longer', () => {
  const cal = { ...CAL, overtime: { '2026-10-28': 120 } };
  const r = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 18), 120);
  assert.equal(stamp(BASE, r.end), '2026-10-28 20:00');
});

// Gap filling. At 11:20 Gupta (due Thursday) still needs 150 min of cutting, so the
// packet machine is free 11:20–13:50; Gupta packs 13:50–17:35. Agarwal's cutting is done.
const NOW = at(0, 11, 20);
const gupta = (extra: Partial<PlanOrder> = {}) => order(1, '8x12 inch', 3750, '2026-10-29', extra);
const agarwal = (qty: number, size = '8x12 inch', extra: Partial<PlanOrder> = {}) =>
  order(2, size, qty, '2026-10-30', { doneStages: ['cutting'], ...extra });
const packing = (plan: ReturnType<typeof schedule>, id: number) => plan.jobs.find((j) => j.orderId === id && j.stage === 'packing')!;

function noOverlap(plan: ReturnType<typeof schedule>) {
  for (const m of MACHINES) {
    const js = plan.jobs.filter((j) => j.machineId === m.id).sort((a, b) => a.seq - b.seq);
    for (let i = 0; i < js.length; i++) {
      assert.equal(js[i].seq, i + 1, `seq on ${m.name}`);
      if (i > 0) assert.ok(js[i].start >= js[i - 1].end, `overlap on ${m.name}`);
    }
  }
}

test('schedule: a short job that is ready later fills the idle gap before a long job', () => {
  const plan = schedule(input([gupta(), agarwal(2000)], { now: NOW, machines: M8x12 }));
  const a = packing(plan, 2);
  const g = packing(plan, 1);
  assert.deepEqual([stamp(BASE, a.start), stamp(BASE, a.end), a.seq], ['2026-10-28 11:20', '2026-10-28 13:20', 1]);
  assert.deepEqual([stamp(BASE, g.start), stamp(BASE, g.end), g.seq], ['2026-10-28 13:50', '2026-10-28 17:35', 2]);
  assert.equal(plan.orders.find((r) => r.orderId === 2)!.finish, a.end);
  noOverlap(plan);
});

test('schedule: a gap that is too short is not used', () => {
  // 3,000 packs in 3 h: it does not fit in 11:20–13:50, so it goes after Gupta.
  const plan = schedule(input([gupta(), agarwal(3000)], { now: NOW, machines: M8x12 }));
  assert.equal(packing(plan, 2).start, packing(plan, 1).end);
  assert.equal(packing(plan, 2).seq, 2);
  noOverlap(plan);
});

test('schedule: filling a gap does not take the setup time of the job after it', () => {
  // The machine last ran 8x12 inch, so Gupta needs no changeover. An 5x8 inch job in the gap
  // would need its own changeover and give Gupta one too: Gupta would end late, so no.
  const lastSize = { 3: '8x12 inch' };
  const plan = schedule(input([gupta(), agarwal(1500, '5x8 inch')], { now: NOW, lastSize, machines: M8x12 }));
  const g = packing(plan, 1);
  assert.deepEqual([stamp(BASE, g.start), stamp(BASE, g.end), g.changeover], ['2026-10-28 13:50', '2026-10-28 17:35', false]);
  assert.equal(packing(plan, 2).start, g.end);
  assert.equal(packing(plan, 2).changeover, true);
  noOverlap(plan);

  // The machine last ran 5x8 inch: Gupta already pays a changeover. A 8x12 inch job in the gap
  // pays it instead (8 → 12), and Gupta then needs none: it starts on time and ends sooner.
  const plan2 = schedule(input([gupta(), agarwal(1500)], { now: NOW, machines: M8x12, lastSize: { 3: '5x8 inch' } }));
  const a2 = packing(plan2, 2);
  const g2 = packing(plan2, 1);
  assert.deepEqual([stamp(BASE, a2.start), stamp(BASE, a2.end), a2.changeover], ['2026-10-28 11:20', '2026-10-28 13:10', true]);
  assert.deepEqual([stamp(BASE, g2.start), stamp(BASE, g2.end), g2.changeover], ['2026-10-28 13:50', '2026-10-28 17:35', false]);
  assert.equal(plan2.orders.find((r) => r.orderId === 1)!.finish, g2.end);
  noOverlap(plan2);

  // A different-size job whose changeovers still fit is put in the gap; Gupta pays its
  // changeover after the gap and keeps its end.
  const plan3 = schedule(input([gupta(), agarwal(1000, '5x8 inch')], { now: NOW, machines: M8x12, lastSize: { 3: '4x6 inch' } }));
  const g3 = packing(plan3, 1);
  const a3 = packing(plan3, 2);
  assert.deepEqual([stamp(BASE, a3.start), stamp(BASE, a3.end), a3.seq], ['2026-10-28 11:20', '2026-10-28 12:40', 1]);
  assert.deepEqual([stamp(BASE, g3.start), stamp(BASE, g3.end), g3.changeover], ['2026-10-28 13:50', '2026-10-28 17:55', true]);
  noOverlap(plan3);
});

test('schedule: running jobs are never moved and nothing is put before them', () => {
  // Packing for order 3 runs since 10:00 and ends 16:00 (6,000 at 1,000/h).
  const running = order(3, '6x10 inch', 6000, '2026-11-02', {
    doneStages: ['cutting'],
    running: { stage: 'packing', machineId: 3, startedAt: at(0, 10) },
  });
  const plan = schedule(input([agarwal(1000), running], { now: NOW, machines: M8x12 }));
  const r = packing(plan, 3);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end), r.seq, r.changeover], ['2026-10-28 10:00', '2026-10-28 16:00', 1, false]);
  assert.ok(packing(plan, 2).start >= r.end);
  noOverlap(plan);

  // A running stage with no start time is planned from now; a job ready earlier still waits.
  const plan2 = schedule(
    input([agarwal(1000), { ...running, running: { stage: 'packing', machineId: 3 } }], { now: NOW, machines: M8x12, lastSize: { 3: '4x6 inch' } }),
  );
  assert.deepEqual([stamp(BASE, packing(plan2, 3).start), packing(plan2, 3).seq], ['2026-10-28 11:20', 1]);
  assert.ok(packing(plan2, 2).start >= packing(plan2, 3).end);
});

test('schedule: an order by weight uses the machine speed in kg per hour', () => {
  // 10 kg at 5 kg/h on the cutter = 2 h, then 2 h on the packet machine.
  const plan = schedule(input([order(1, '8x12 inch', 10, '2026-10-30', { unit: 'kg' })]));
  const cut = plan.jobs.find((j) => j.stage === 'cutting')!;
  assert.equal(cut.end - cut.start, 120);
});

// Shifts with a closed time between them: 09:00–12:00 and 14:00–19:00.
const SPLIT = { ...CAL, shifts: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '19:00' }] };

test('placeWork: work that would cross 12:00 stops at 12:00 and goes on at 14:00', () => {
  const r = placeWork({ baseDate: BASE, calendar: SPLIT }, [], at(0, 11), 120);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end)], ['2026-10-28 11:00', '2026-10-28 15:00']);
  // Ready in the closed time: it waits for the next shift.
  const w = placeWork({ baseDate: BASE, calendar: SPLIT }, [], at(0, 12, 30), 60);
  assert.deepEqual([stamp(BASE, w.start), stamp(BASE, w.end)], ['2026-10-28 14:00', '2026-10-28 15:00']);
  // Before the first shift it waits for 09:00.
  assert.equal(stamp(BASE, placeWork({ baseDate: BASE, calendar: SPLIT }, [], at(0, 6), 30).start), '2026-10-28 09:00');
});

test('schedule: a job is planned around the closed time; due by the end of the last shift', () => {
  // 3,000 at 1,500/h = 2 h of cutting from 11:00: 11–12, then 14–15.
  const plan = schedule(input([order(1, '8x12 inch', 3000, BASE)], { now: at(0, 11), calendar: SPLIT, machines: [M8x12[0], M8x12[2]] }));
  const cut = plan.jobs.find((j) => j.stage === 'cutting')!;
  const pack = plan.jobs.find((j) => j.stage === 'packing')!;
  assert.deepEqual([stamp(BASE, cut.start), stamp(BASE, cut.end)], ['2026-10-28 11:00', '2026-10-28 15:00']);
  assert.deepEqual([stamp(BASE, pack.start), stamp(BASE, pack.end)], ['2026-10-28 15:00', '2026-10-28 18:00']);
  assert.equal(plan.orders[0].dueBy, at(0, 19));
  assert.equal(plan.orders[0].lateMin, 0);
});

test('placeWork: three shifts', () => {
  const cal = { ...CAL, shifts: [{ start: '06:00', end: '10:00' }, { start: '11:00', end: '15:00' }, { start: '16:00', end: '20:00' }] };
  // 400 min from 09:00: 09–10 (60), 11–15 (240), 16–17:40 (100).
  const r = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 9), 400);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end)], ['2026-10-28 09:00', '2026-10-28 17:40']);
  // 120 min from 19:00: 19–20, then the next day's first shift 06–07.
  const n = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 19), 120);
  assert.equal(stamp(BASE, n.end), '2026-10-29 07:00');
});

test('placeWork: overtime comes after the last shift, not in the closed time', () => {
  const cal = { ...SPLIT, overtime: { '2026-10-28': 120 } };
  const r = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 18), 180);
  assert.deepEqual([stamp(BASE, r.start), stamp(BASE, r.end)], ['2026-10-28 18:00', '2026-10-28 21:00']);
  const gap = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 11, 30), 60);
  assert.equal(stamp(BASE, gap.end), '2026-10-28 14:30');
});

test('placeWork: overtime past midnight is not used twice', () => {
  const cal = { ...CAL, shifts: [{ start: '00:00', end: '08:00' }, { start: '16:00', end: '24:00' }], overtime: { '2026-10-28': 60 } };
  // 23:00 + 180 min: 23–01 (with overtime), then 01:00–02:00 of the next day's first shift.
  const r = placeWork({ baseDate: BASE, calendar: cal }, [], at(0, 23), 180);
  assert.equal(stamp(BASE, r.end), '2026-10-29 02:00');
});

// Demo-data due dates (actions/load-demo-data.ts). The demo machines and speeds
// must finish all 3 orders on time just after the load, whatever the weekday,
// and a stop or an urgent order must still move a delivery.
import { dateOf as demoDateOf } from './schedule.ts';

const DEMO_CAL = { shiftStart: '09:00', shiftEnd: '19:00', weeklyOff: [0], holidays: [] as string[], overtime: {} };
const DEMO_MACHINES: Machine[] = [
  { id: 1, name: 'Cutter 1', stage: 'cutting', speedPerHour: 3000, kgPerHour: 30, changeoverMin: 20 },
  { id: 2, name: 'Pouch machine 1', stage: 'packing', speedPerHour: 1600, kgPerHour: 20, changeoverMin: 30 },
  { id: 3, name: 'Pouch machine 2', stage: 'packing', speedPerHour: 1200, kgPerHour: 15, changeoverMin: 25 },
];

// The nth working day after `baseDate` (skips the weekly off, Sunday).
function demoWorkingDue(baseDate: string, n: number) {
  const [y, m, d] = baseDate.split('-').map(Number) as [number, number, number];
  let day = 0;
  while (n > 0) {
    day++;
    if (new Date(Date.UTC(y, m - 1, d + day)).getUTCDay() !== 0) n--;
  }
  return day;
}

function demoOrders(baseDate: string): PlanOrder[] {
  const specs: [string, string, number, number][] = [
    ['Sharma Packaging', '4x6 inch', 12000, 1],
    ['Verma Foods', '6x8 inch', 18000, 2],
    ['Gupta Traders', '8x12 inch', 20000, 3],
  ];
  return specs.map(([customer, size, quantity, n], i) => ({
    id: i + 1,
    customer,
    size,
    quantity,
    unit: 'packets',
    dueDate: demoDateOf(baseDate, demoWorkingDue(baseDate, n)),
    priority: 0,
    createdAt: `${baseDate} 09:00:0${i + 1}`,
  }));
}

const WEEK = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']; // Mon..Sun

test('demo load: all 3 orders are on time just after the load, whatever the weekday', () => {
  for (const base of WEEK) {
    const plan = schedule({ baseDate: base, now: 9 * 60, calendar: DEMO_CAL, machines: DEMO_MACHINES, orders: demoOrders(base) });
    for (const o of plan.orders) {
      assert.equal(o.lateDays, 0, `${base} order ${o.orderId} finishes ${stamp(base, o.finish)}`);
    }
    for (const o of demoOrders(base)) {
      const wd = new Date(o.dueDate + 'T00:00:00Z').getUTCDay();
      assert.notEqual(wd, 0, `${base} order ${o.id} due ${o.dueDate} is a Sunday`);
    }
  }
});

test('demo load: orders are still on time for a late load at 17:00', () => {
  for (const base of ['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-07']) {
    const plan = schedule({ baseDate: base, now: 17 * 60, calendar: DEMO_CAL, machines: DEMO_MACHINES, orders: demoOrders(base) });
    for (const o of plan.orders) assert.equal(o.lateDays, 0, `${base} 17:00 order ${o.orderId}`);
  }
});

test('demo load: after the load, an urgent order moves other deliveries', () => {
  const base = '2026-11-06'; // Friday load
  const before = schedule({ baseDate: base, now: 9 * 60, calendar: DEMO_CAL, machines: DEMO_MACHINES, orders: demoOrders(base) });
  const beforeBy = new Map(before.orders.map((o) => [o.orderId, o.finish]));
  const urgent: PlanOrder = { id: 4, customer: 'Urgent Co', size: '4x6 inch', quantity: 8000, unit: 'packets', dueDate: demoDateOf(base, 1), priority: 1, createdAt: `${base} 09:00:04` };
  const after = schedule({ baseDate: base, now: 9 * 60, calendar: DEMO_CAL, machines: DEMO_MACHINES, orders: [...demoOrders(base), urgent] });
  const moved = after.orders.filter((o) => beforeBy.has(o.orderId) && beforeBy.get(o.orderId) !== o.finish);
  assert.ok(moved.length >= 1, `urgent order moves a delivery, moved: ${moved.map((o) => o.orderId).join(',')}`);
  assert.equal(after.orders.find((o) => o.orderId === 4)!.lateDays, 0);
});

test('demo load: after the load, a machine stop tomorrow moves a delivery', () => {
  const base = '2026-11-06'; // Friday load, stop Saturday on Pouch machine 1 (id 2)
  const before = schedule({ baseDate: base, now: 9 * 60, calendar: DEMO_CAL, machines: DEMO_MACHINES, orders: demoOrders(base) });
  const beforeBy = new Map(before.orders.map((o) => [o.orderId, o.finish]));
  const after = schedule({
    baseDate: base, now: 9 * 60, calendar: DEMO_CAL, machines: DEMO_MACHINES, orders: demoOrders(base),
    down: [{ machineId: 2, from: 1 * 1440 + 540, to: 1 * 1440 + 1140 }],
  });
  const moved = after.orders.filter((o) => beforeBy.get(o.orderId) !== o.finish);
  assert.ok(moved.length >= 1, `stop moves a delivery, moved: ${moved.map((o) => o.orderId).join(',')}`);
});
