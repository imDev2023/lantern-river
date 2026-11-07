// Seeded randomness from 32-bit integer operations only.

/** mulberry32: a seeded generator returning integers in [0, 2^32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Mix integers into one 32-bit hash (FNV-1a over the words, then a murmur3 finalizer). */
export function hash32(...words: number[]): number {
  let h = 0x811c9dc5;
  for (const w of words) {
    let v = w >>> 0;
    for (let i = 0; i < 4; i++) {
      h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
      v >>>= 8;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A 32-bit hash of a string's UTF-16 code units. */
export function hashText(text: string): number {
  const units: number[] = [];
  for (let i = 0; i < text.length; i++) units.push(text.charCodeAt(i));
  return hash32(text.length, ...units);
}

/**
 * An integer in [lo, hi] from a generator. The modulo bias is below (hi - lo) / 2^32,
 * under 0.1% for the widest range a stage uses, and the same in every engine.
 */
export function range(next: () => number, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + (next() % (hi - lo + 1));
}

/** True with a chance of `percent` out of 100. */
export function chance(next: () => number, percent: number): boolean {
  return next() % 100 < percent;
}
