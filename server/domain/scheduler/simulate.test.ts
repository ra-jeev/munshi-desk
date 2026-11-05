import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pouchGrams, type Machine, type PlanInput, type PlanOrder } from './schedule.ts';
import { AS_IS, bestOption, hasConflict, NEW_ORDER_ID, overtimeDates, readyEstimate, simulate } from './simulate.ts';

const BASE = '2026-10-28'; // Wednesday
// The cutter slits film by weight: this is 1,500 pouches of 8x12 inch an hour, so the old times hold.
const CUT_KG_H = (1500 * pouchGrams('8x12 inch')) / 1000;
const MACHINES: Machine[] = [
  { id: 1, name: 'Cutter 1', stage: 'cutting', speedPerHour: 1500, kgPerHour: CUT_KG_H, changeoverMin: 30 },
  { id: 3, name: 'Packet Machine', stage: 'packing', speedPerHour: 1000, kgPerHour: 5, changeoverMin: 0 },
];
const order = (id: number, customer: string, quantity: number, dueDate: string): PlanOrder => ({
  id, customer, size: '8x12 inch', quantity, dueDate, priority: 0, createdAt: `2026-10-01 00:00:0${id}`,
});
const base: PlanInput = {
  baseDate: BASE,
  now: 9 * 60,
  calendar: { shiftStart: '09:00', shiftEnd: '19:00', weeklyOff: [0] },
  machines: MACHINES,
  // Verma: 6,000 due Friday. Fills Wednesday's packing (6 h).
  orders: [order(1, 'Verma Foods', 6000, '2026-10-30')],
};
// Gupta: 6,000 needed tomorrow (Thursday).
const urgent = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 6000, '2026-10-29') };

test('simulate: as planned, the new order waits behind Verma but is still on time', () => {
  const o = simulate(base, urgent, AS_IS);
  assert.equal(o.lateDays, 0);
  assert.equal(o.hurt.length, 0);
  assert.equal(hasConflict(o), false);
});

test('simulate: rushing a tight order makes the other order late, and names it', () => {
  const tight = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 9000, BASE) };
  const asIs = simulate(base, tight, AS_IS);
  assert.ok(asIs.lateDays > 0);
  const rushed = simulate({ ...base, orders: [order(1, 'Verma Foods', 6000, BASE)] }, tight, { place: 'first', overtime: {} });
  assert.deepEqual(
    rushed.hurt.map((h) => h.customer),
    ['Verma Foods'],
  );
});

test('bestOption: overtime is chosen when it saves the order without hurting anyone', () => {
  // 9,000 due today: cutting 6 h, packing 9 h → needs evening work.
  const tight = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 9000, '2026-10-29') };
  const best = bestOption({ ...base, orders: [] }, tight);
  assert.equal(best.lateDays, 0);
  assert.equal(best.hurt.length, 0);
});

test('simulate: a patch changes an existing order (new due date)', () => {
  const o = simulate(base, { kind: 'patch', orderId: 1, patch: { dueDate: BASE } }, AS_IS);
  assert.equal(o.targetId, 1);
  assert.ok(o.lateDays >= 0);
});

test('bestOption: when the order cannot be on time, it waits rather than making others late', () => {
  // 20,000 due today cannot be done today; going by due date would push Verma.
  const big = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 20000, BASE) };
  const asIs = simulate({ ...base, orders: [order(1, 'Verma Foods', 6000, '2026-10-29')] }, big, AS_IS);
  assert.ok(asIs.hurt.length > 0);
  const best = bestOption({ ...base, orders: [order(1, 'Verma Foods', 6000, '2026-10-29')] }, big);
  assert.equal(best.hurt.length, 0);
  assert.ok(best.lateDays > 0);
});

test('simulate: several new items are planned together; ready when the last one is', () => {
  const one = simulate(base, urgent, AS_IS);
  const two = simulate(base, { ...urgent, extra: [order(NEW_ORDER_ID - 1, 'Gupta Traders', 3000, '2026-10-29')] }, AS_IS);
  assert.ok(two.ready > one.ready, `${two.ready} should be after ${one.ready}`);
  assert.ok(two.hurt.every((h) => h.orderId > 0), 'a new item never counts as hurt');
});

test('bestOption: with noOvertime it never picks overtime, even when overtime would save the order', () => {
  // 7,000 due today: cutting ends 13:40, packing needs 7 h → 20:40.
  const tight = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 7000, BASE) };
  assert.ok(bestOption({ ...base, orders: [] }, tight).overtimeMin > 0, 'overtime is the normal pick here');
  const best = bestOption({ ...base, orders: [] }, tight, { noOvertime: true });
  assert.equal(best.overtimeMin, 0);
  assert.deepEqual(best.option.overtime, {});
  assert.ok(best.lateDays > 0);
});

test('readyEstimate: the normal place with no overtime', () => {
  const tight = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 9000, '2026-10-29') };
  const est = readyEstimate({ ...base, orders: [] }, tight);
  const asIs = simulate({ ...base, orders: [] }, tight, AS_IS);
  assert.deepEqual(est, { ready: asIs.ready, lateDays: asIs.lateDays, hurt: asIs.hurt });
  assert.match(est.ready, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('overtimeDates: holidays are skipped', () => {
  const dates = overtimeDates({ ...base, calendar: { ...base.calendar, holidays: ['2026-10-29'] } }, '2026-10-30');
  assert.deepEqual(dates, ['2026-10-28', '2026-10-30']);
});

test('simulate: the ready time skips the closed time between shifts; overtime comes after the last shift', () => {
  const split = { ...base.calendar, shifts: [{ start: '09:00', end: '10:00' }, { start: '11:00', end: '19:00' }] };
  // 3,000: cutting 2 h (09–10, 11–12), packing 3 h (12–15). Straight through it would be 14:00.
  const one = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 3000, BASE) };
  assert.equal(readyEstimate({ ...base, orders: [], calendar: split }, one).ready, '2026-10-28 15:00');
  // 7,000 due today: cutting ends 14:40, packing needs 7 h → 160 min after 19:00.
  const tight = { kind: 'add' as const, order: order(NEW_ORDER_ID, 'Gupta Traders', 7000, BASE) };
  const best = bestOption({ ...base, orders: [], calendar: split }, tight);
  assert.equal(best.lateDays, 0);
  assert.deepEqual(best.option.overtime, { [BASE]: 240 });
  assert.equal(best.ready, '2026-10-28 21:40');
});
