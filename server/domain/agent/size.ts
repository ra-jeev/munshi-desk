// Pouch sizes are two numbers, width x length ("4x6 inch", "100x150 mm").
// The model may write "4 by 6", "4 into 6" or "4X6\""; code keeps one form so
// the scheduler sees the same size as the same size.

// "100mm" has no word break between the number and the unit, so look for letters around it instead.
const UNIT: [RegExp, Unit][] = [
  [/(?<![a-z])mm(?![a-z])|millimet/i, 'mm'],
  [/(?<![a-z])cm(?![a-z])|centimet/i, 'cm'],
];
type Unit = 'inch' | 'mm' | 'cm';
const MM: Record<Unit, number> = { inch: 25.4, mm: 1, cm: 10 };
/** Sides this close are one size: 1 inch (25.4 mm) and 25 mm are the same pouch. */
const SAME_MM = 0.5;

/** "4 by 6 inch" → "4x6 inch"; null when it is not two numbers above zero. */
export function normalizeSize(size: string | null | undefined): string | null {
  const n = numbers(size);
  if (n.length !== 2 || n.some((v) => v <= 0)) return null;
  return `${n[0]}x${n[1]} ${unitOf(size)}`;
}

/** Only one number: the owner gave the width or the length, not both. */
export function isHalfSize(size: string | null | undefined) {
  return numbers(size).length === 1;
}

/**
 * Does what the owner said point at this order's size? "4x6" matches 4x6 (or 6x4,
 * people swap them); "12 inch wala" matches any size with a 12 inch side.
 * Sides are compared in mm, so 8x12 cm is not 8x12 inch.
 */
export function sizeMatches(said: string | null | undefined, size: string) {
  const s = sidesMm(said);
  const o = sidesMm(size);
  if (s.length === 0) return true;
  if (s.length === 1) return o.some((v) => near(v, s[0]!));
  return s.length === o.length && s.every((v, i) => near(v, o[i]!));
}

/** Same size, read either way round. */
export function sameSize(a: string | null | undefined, b: string | null | undefined) {
  const x = numbers(a);
  return x.length > 0 && sizeMatches(a, b ?? '') && x.length === numbers(b).length;
}

const near = (a: number, b: number) => Math.abs(a - b) <= SAME_MM;

/** Unit said in the size; inch when none is said. */
function unitOf(size: string | null | undefined): Unit {
  return UNIT.find(([re]) => re.test(size ?? ''))?.[1] ?? 'inch';
}

/** Sides in mm, smallest first, so a swapped size compares side by side. */
export function sidesMm(size: string | null | undefined) {
  const f = MM[unitOf(size)];
  return numbers(size)
    .map((v) => v * f)
    .sort((a, b) => a - b);
}

/** The numbers in a size. A "-" is a minus sign only when it does not follow a number ("4-6" is 4 and 6). */
function numbers(size: string | null | undefined) {
  return size?.match(/(?<![\d.])-?\d+(\.\d+)?/g)?.map(Number) ?? [];
}
