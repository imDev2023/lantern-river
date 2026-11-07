// Integer arithmetic the simulation is allowed to use.
//
// Every value is an integer below 2^53, where IEEE 754 doubles are exact in every
// JavaScript engine, so the same inputs give the same run in a browser, in Node on a
// server and in any other engine. These helpers throw if a value ever leaves that range,
// which turns a silent divergence into a failing test.

/** Micrometres per metre: the unit of every distance. */
export const UM = 1_000_000;
/** Simulation ticks per second. */
export const TICK_HZ = 60;
/** Full scale of a fraction: a fraction f means f / FRAC. */
export const FRAC = 65_536;

const LIMIT = 2 ** 53;

function exact(v: number): boolean {
  return Number.isInteger(v) && Math.abs(v) < LIMIT;
}

/** Floor division of integers, checked to stay where doubles are exact. */
export function idiv(a: number, b: number): number {
  if (!(exact(a) && exact(b) && b > 0)) throw new RangeError(`idiv out of exact range: ${a} / ${b}`);
  return Math.floor(a / b);
}

/** A product of integers, checked to stay where doubles are exact. */
export function mul(a: number, b: number): number {
  const p = a * b;
  if (!(exact(a) && exact(b) && exact(p))) throw new RangeError(`mul out of exact range: ${a} * ${b}`);
  return p;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function abs(v: number): number {
  return v < 0 ? -v : v;
}

/** The integer square root: the largest r with r * r <= n. */
export function isqrt(n: number): number {
  if (!(exact(n) && n >= 0)) throw new RangeError(`isqrt of ${n}`);
  // Math.sqrt only gives a first guess; the two loops make the result exact anywhere.
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r -= 1;
  while ((r + 1) * (r + 1) <= n) r += 1;
  return r;
}

/** Smoothstep on a fraction: 0 and FRAC map to themselves with zero slope at both ends. */
export function smooth(f: number): number {
  return idiv(mul(idiv(mul(f, f), FRAC), 3 * FRAC - 2 * f), FRAC);
}

/** From a to b by the fraction f. */
export function lerp(a: number, b: number, f: number): number {
  return a + idiv(mul(b - a, f), FRAC);
}

/** How far v lies from lo to hi, as a fraction clamped to [0, FRAC]. */
export function fraction(v: number, lo: number, hi: number): number {
  if (hi <= lo) return FRAC;
  return clamp(idiv(mul(v - lo, FRAC), hi - lo), 0, FRAC);
}
