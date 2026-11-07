// The river, generated from a stage and a seed.
//
// The simulation works in the river's own straightened frame: `s` is the distance
// downstream from the start and `x` the offset from the centre line, positive to the
// right looking downstream. Bends are drawn by the renderer and never change the rules.
//
// The river is cut into chunks of CHUNK length, and every chunk is built from the seed
// and its own index alone, so the renderer can stream any chunk without building the
// ones before it, and a stage can be as long as it likes.

import { UM, clamp, fraction, idiv, lerp, smooth } from './int.ts';
import { chance, hash32, hashText, range, rng } from './rng.ts';
import type { Ramp, Stage } from './stage.ts';

/** Length of one chunk of river. */
export const CHUNK = 20 * UM;
/** The boat's collision radius. */
export const BOAT_R = 350_000;
/** Radius of a gate's post. */
export const POST_R = 120_000;
/** The open channel's line clears a gate's posts by at least this much. */
export const GATE_MARGIN = 100_000;
/** Chunks at the start with nothing in them, so a run begins calmly. */
export const CALM_START = 1;

export interface Rock {
  readonly id: number;
  readonly s: number;
  readonly x: number;
  readonly r: number;
}

/** A pair of lantern posts; the clear gap between them is `gap` wide, centred on `x`. */
export interface Gate {
  readonly id: number;
  readonly s: number;
  readonly x: number;
  readonly gap: number;
}

/** A shrine on the bank at `side` (-1 left, 1 right); `x` is the bank's edge there. */
export interface Shrine {
  readonly id: number;
  readonly s: number;
  readonly x: number;
  readonly side: -1 | 1;
}

/** A gust between s0 and s1, pushing towards `dir`. */
export interface Gust {
  readonly s0: number;
  readonly s1: number;
  readonly dir: -1 | 1;
}

export interface Chunk {
  readonly k: number;
  readonly s0: number;
  readonly rocks: readonly Rock[];
  readonly gates: readonly Gate[];
  readonly shrines: readonly Shrine[];
  readonly gust: Gust | null;
}

export interface World {
  readonly stage: Stage;
  readonly seed: number;
  /** Chunks from index 0 up to this one hold the river before the sea. */
  readonly lastChunk: number;
  chunk(k: number): Chunk;
  /** Half the river's width at s. */
  halfWidth(s: number): number;
  /** Centre of the channel that is always open through every rock row. */
  channel(s: number): number;
  /** The gust at s, if any. */
  gustAt(s: number): Gust | null;
}

// Salts that keep each kind of per-chunk value independent of the others.
const SALT_WIDTH = 0x57;
const SALT_CHANNEL = 0xc4;
const SALT_CHUNK = 0x3b;

/** A stage ramp's value at difficulty d (a fraction). */
export function ramp(r: Ramp, d: number): number {
  return lerp(r[0], r[1], d);
}

export function createWorld(stage: Stage, seed: number): World {
  const base = hash32(seed >>> 0, hashText(stage.id), stage.version);
  const lastChunk = idiv(stage.length - 1, CHUNK);
  const [wMin, wMax] = stage.halfWidth;
  const chunks = new Map<number, Chunk>();

  // Half width at the boundary before chunk k. Past the stage the river opens into the sea.
  const widthAt = (k: number): number => {
    if (k > lastChunk + 1) return 3 * wMax;
    if (k > lastChunk) return 2 * wMax;
    return range(rng(hash32(base, SALT_WIDTH, k)), wMin, wMax);
  };

  // The channel's centre at the boundary before chunk k. It stays within reach of the
  // narrowest river, so it never meets a bank, and it is centred at the start and the sea.
  const reach = wMin - idiv(stage.rocks.channel[0], 2) - BOAT_R;
  const channelAt = (k: number): number => {
    if (k <= CALM_START || k > lastChunk) return 0;
    return range(rng(hash32(base, SALT_CHANNEL, k)), -reach, reach);
  };

  const between = (s: number, at: (k: number) => number): number => {
    const k = idiv(Math.max(0, s), CHUNK);
    const f = smooth(fraction(Math.max(0, s), k * CHUNK, (k + 1) * CHUNK));
    return lerp(at(k), at(k + 1), f);
  };
  const halfWidth = (s: number): number => between(s, widthAt);
  const channel = (s: number): number => between(s, channelAt);

  // Difficulty of chunk k, from 0 at the first obstacle chunk to FRAC at the last.
  const difficulty = (k: number): number => fraction(k, CALM_START, lastChunk - 1);

  function build(k: number): Chunk {
    const s0 = k * CHUNK;
    const empty: Chunk = { k, s0, rocks: [], gates: [], shrines: [], gust: null };
    // The first chunk is calm, and so is the last stretch before the sea.
    if (k < CALM_START || k >= lastChunk) return empty;
    const next = rng(hash32(base, SALT_CHUNK, k));
    const d = difficulty(k);
    const rocks: Rock[] = [];
    const gates: Gate[] = [];
    const shrines: Shrine[] = [];
    let id = k * 1000;

    // Rock rows, spread evenly through the chunk with some jitter.
    const per100 = ramp(stage.rocks.rowsPer100, d);
    const rows = idiv(per100, 100) + (chance(next, per100 % 100) ? 1 : 0);
    const gap = ramp(stage.rocks.channel, d);
    const [rMin, rMax] = stage.rocks.radius;
    for (let i = 0; i < rows; i++) {
      const slot = idiv(CHUNK, rows);
      const s = s0 + i * slot + idiv(slot, 2) + range(next, -idiv(slot, 5), idiv(slot, 5));
      const hw = halfWidth(s);
      const c = channel(s);
      if (chance(next, ramp(stage.gates.chance, d))) {
        // A lantern gate straddling the channel, off its centre by less than the boat's
        // clearance, so the channel always runs between the posts but threading it takes aim.
        const g = ramp(stage.gates.gap, d);
        const half = idiv(g, 2) + POST_R;
        const off = idiv(g, 2) - BOAT_R - GATE_MARGIN;
        const x = clamp(c + range(next, -off, off), -hw + half + BOAT_R, hw - half - BOAT_R);
        gates.push({ id: id++, s, x, gap: g });
        continue;
      }
      // Rocks on each side of the open channel, touching the bank at most.
      const sides: Array<readonly [number, number]> = [
        [-hw, c - idiv(gap, 2)],
        [c + idiv(gap, 2), hw],
      ];
      for (const [lo, hi] of sides) {
        const count = 1 + (chance(next, ramp(stage.rocks.second, d)) ? 1 : 0);
        for (let j = 0; j < count; j++) {
          const room = hi - lo;
          if (room < 2 * rMin) break;
          const r = range(next, rMin, Math.min(rMax, idiv(room, 2)));
          const x = range(next, lo + r, hi - r);
          rocks.push({ id: id++, s: s + range(next, -idiv(UM, 2), idiv(UM, 2)), x, r });
        }
      }
    }

    if (chance(next, ramp(stage.shrines.chance, d))) {
      const s = s0 + range(next, idiv(CHUNK, 5), CHUNK - idiv(CHUNK, 5));
      const side: -1 | 1 = next() % 2 === 0 ? -1 : 1;
      shrines.push({ id: id++, s, side, x: side * halfWidth(s) });
    }

    let gust: Gust | null = null;
    if (chance(next, ramp(stage.wind.chance, d))) {
      const len = range(next, stage.wind.length[0], stage.wind.length[1]);
      const g0 = s0 + range(next, 0, Math.max(0, CHUNK - len));
      gust = { s0: g0, s1: g0 + len, dir: next() % 2 === 0 ? -1 : 1 };
    }
    return { k, s0, rocks, gates, shrines, gust };
  }

  function chunk(k: number): Chunk {
    let c = chunks.get(k);
    if (!c) {
      c = build(k);
      chunks.set(k, c);
    }
    return c;
  }

  function gustAt(s: number): Gust | null {
    const k = idiv(Math.max(0, s), CHUNK);
    for (const kk of [k, k - 1]) {
      if (kk < 0) continue;
      const g = chunk(kk).gust;
      if (g && s >= g.s0 && s < g.s1) return g;
    }
    return null;
  }

  return { stage, seed: seed >>> 0, lastChunk, chunk, halfWidth, channel, gustAt };
}
