// One run down the river: the rules, in integers only.
//
// A run is fully described by its stage, its seed and the player's steering, so a
// server can replay it exactly (see replay.ts). The renderer only reads this state:
// bends, bobbing, reflections and particles are drawn from it and never feed back.

import { FRAC, UM, abs, clamp, fraction, idiv, isqrt, lerp, mul } from './int.ts';
import { BOAT_R, CHUNK, POST_R, type World } from './world.ts';

/** The rules' version. Any change to what a run computes bumps it. */
export const RULES = 'lantern-river/1';

/** The flame's full light. */
export const LIGHT_MAX = 1_000_000;
/** Steering input is a target offset rounded to this step (1 cm). */
export const TARGET_STEP = 10_000;
/** No target may lie further than this from the centre line. */
export const TARGET_LIMIT = 50 * UM;

/** Top sideways speed, in micrometres per tick (3 m/s). */
export const VX_MAX = 50_000;
/** How fast sideways speed can change per tick. */
export const VX_ACCEL = 4_000;
/** The boat aims to close its distance to the target in this many ticks. */
export const STEER_TICKS = 10;
/** Light lost when the boat hits a rock or a post. */
export const HIT_LOSS = 150_000;
/** Ticks after a hit with the boat slowed and no second loss. */
export const STUN_TICKS = 40;
/** Downstream speed while stunned, in percent. */
export const STUN_SPEED = 55;
/** Sideways speed the boat bounces off a rock with. */
export const BOUNCE = 22_000;
/** Light lost per tick while the boat scrapes a bank. */
export const SCRAPE_DRAIN = 1_500;
/** Ticks the result is shown drifting before the run is done. */
export const END_TICKS = 150;

export type Phase = 'run' | 'end' | 'done';
export type EndReason = 'out' | 'sea';

export type RunEvent =
  | { type: 'hit'; id: number; side: -1 | 1 }
  | { type: 'scrape'; side: -1 | 1 }
  | { type: 'gate'; id: number }
  | { type: 'shrine'; id: number }
  | { type: 'gust'; dir: -1 | 1 }
  | { type: 'end'; reason: EndReason }
  | { type: 'done'; score: number };

export interface RunState {
  readonly rules: string;
  readonly stage: string;
  readonly stageVersion: number;
  readonly seed: number;
  tick: number;
  phase: Phase;
  endReason: EndReason | null;
  endTick: number;
  /** Distance downstream when the run ended, which is what the score counts. */
  endS: number;
  /** Distance downstream and offset from the centre line. */
  s: number;
  x: number;
  /** Sideways and downstream speed, per tick. */
  vx: number;
  vs: number;
  /** The offset the player is steering for. */
  target: number;
  light: number;
  /** All light gained from shrines and gates: the score's main part. */
  gathered: number;
  hits: number;
  gates: number;
  stun: number;
  /** Side of the bank being scraped (0 when clear), so a scrape is reported once. */
  scraping: -1 | 0 | 1;
  /** The shrine whose light the boat is in, or -1, so each visit is reported once. */
  shrine: number;
  /** Whether the boat is inside a gust, so each gust is reported once. */
  gusting: boolean;
  events: RunEvent[];
}

export function createRun(world: World): RunState {
  const { stage } = world;
  return {
    rules: RULES,
    stage: stage.id,
    stageVersion: stage.version,
    seed: world.seed,
    tick: 0,
    phase: 'run',
    endReason: null,
    endTick: 0,
    endS: 0,
    s: 0,
    x: 0,
    vx: 0,
    vs: stage.speed[0],
    target: 0,
    light: stage.light.start,
    gathered: 0,
    hits: 0,
    gates: 0,
    stun: 0,
    scraping: 0,
    shrine: -1,
    gusting: false,
    events: [],
  };
}

/** Round a steering offset to a valid input. */
export function quantizeTarget(x: number): number {
  const q = clamp(Math.round(x / TARGET_STEP) * TARGET_STEP, -TARGET_LIMIT, TARGET_LIMIT);
  return q === 0 ? 0 : q; // never -0
}

function end(st: RunState, reason: EndReason): void {
  st.phase = 'end';
  st.endReason = reason;
  st.endTick = st.tick;
  st.endS = st.s;
  st.events.push({ type: 'end', reason });
}

/**
 * Advance one tick with the boat steering for `target`, an offset from the centre line
 * that quantizeTarget accepts unchanged. Returns this tick's events.
 */
export function step(world: World, st: RunState, target: number): RunEvent[] {
  st.events = [];
  if (st.phase === 'done') return st.events;
  st.tick += 1;
  const { stage } = world;

  if (st.phase === 'end') {
    // The boat drifts on while the result shows; nothing else changes.
    st.s += st.vs;
    if (st.tick - st.endTick >= END_TICKS) {
      st.phase = 'done';
      st.events.push({ type: 'done', score: score(st) });
    }
    return st.events;
  }

  st.target = target;
  const prevS = st.s;

  // Steer: aim to close the distance to the target, within the boat's speed and grip.
  const hw0 = world.halfWidth(st.s);
  const aim = clamp(target, -hw0 + BOAT_R, hw0 - BOAT_R);
  const want = clamp(idiv(aim - st.x, STEER_TICKS), -VX_MAX, VX_MAX);
  st.vx += clamp(want - st.vx, -VX_ACCEL, VX_ACCEL);

  // Wind pushes the boat sideways and dims the flame.
  const gust = world.gustAt(st.s);
  if (gust) {
    st.vx = clamp(st.vx + gust.dir * stage.wind.push, -2 * VX_MAX, 2 * VX_MAX);
    st.light -= stage.wind.drain;
    if (!st.gusting) st.events.push({ type: 'gust', dir: gust.dir });
  }
  st.gusting = gust !== null;
  st.x += st.vx;

  // Downstream: the current quickens towards the sea, and a hit slows the boat for a moment.
  const base = lerp(stage.speed[0], stage.speed[1], fraction(st.s, 0, stage.length));
  st.vs = st.stun > 0 ? idiv(mul(base, STUN_SPEED), 100) : base;
  if (st.stun > 0) st.stun -= 1;
  st.s += st.vs;

  // Rocks and gate posts: push the boat out sideways, and lose light once per stun.
  const k = idiv(st.s, CHUNK);
  for (let kk = k - 1; kk <= k + 1; kk++) {
    if (kk < 0) continue;
    const c = world.chunk(kk);
    for (const r of c.rocks) collide(st, r.id, r.s, r.x, r.r);
    for (const g of c.gates) {
      const off = idiv(g.gap, 2) + POST_R;
      collide(st, g.id, g.s, g.x - off, POST_R);
      collide(st, g.id, g.s, g.x + off, POST_R);
      // Passing between the posts lends the flame light.
      if (prevS < g.s && st.s >= g.s && abs(st.x - g.x) < idiv(g.gap, 2)) {
        st.gates += 1;
        st.light += stage.gates.bonus;
        st.gathered += stage.gates.bonus;
        st.events.push({ type: 'gate', id: g.id });
      }
    }
  }

  // Banks: the boat stays on the river, and scraping a bank dims the flame.
  const hw = world.halfWidth(st.s);
  let side: -1 | 0 | 1 = 0;
  if (st.x > hw - BOAT_R) side = 1;
  else if (st.x < -hw + BOAT_R) side = -1;
  if (side !== 0) {
    st.x = side * (hw - BOAT_R);
    st.vx = -side * idiv(abs(st.vx), 2);
    st.light -= SCRAPE_DRAIN;
    if (st.scraping !== side) st.events.push({ type: 'scrape', side });
  }
  st.scraping = side;

  // Shrines lend light while the boat is in their aura, the more the closer it passes.
  let inShrine = -1;
  const aura = stage.shrines.aura;
  const aura2 = mul(aura, aura);
  for (let kk = k - 1; kk <= k + 1; kk++) {
    if (kk < 0) continue;
    for (const sh of world.chunk(kk).shrines) {
      const ds = st.s - sh.s;
      const dx = st.x - sh.x;
      if (abs(ds) >= aura || abs(dx) >= aura) continue;
      const d2 = mul(ds, ds) + mul(dx, dx);
      if (d2 >= aura2) continue;
      // Closeness runs from 0 at the aura's edge to FRAC at the shrine.
      const closeness = Math.min(FRAC, idiv(aura2 - d2, idiv(aura2, FRAC)));
      const near = idiv(mul(closeness, stage.shrines.gain), FRAC);
      st.light += near;
      st.gathered += near;
      inShrine = sh.id;
    }
  }
  if (inShrine !== -1 && inShrine !== st.shrine) st.events.push({ type: 'shrine', id: inShrine });
  st.shrine = inShrine;

  st.light = clamp(st.light - stage.light.drain, 0, LIGHT_MAX);
  if (st.light === 0) end(st, 'out');
  else if (st.s >= stage.length) end(st, 'sea');
  return st.events;
}

/** Push the boat out of a round obstacle it overlaps. */
function collide(st: RunState, id: number, s: number, x: number, r: number): void {
  const rr = r + BOAT_R;
  const ds = st.s - s;
  const dx = st.x - x;
  if (abs(ds) >= rr || abs(dx) >= rr) return;
  const rr2 = mul(rr, rr);
  const ds2 = mul(ds, ds);
  if (ds2 + mul(dx, dx) >= rr2) return;
  const side: -1 | 1 = dx >= 0 ? 1 : -1;
  st.x = x + side * (isqrt(rr2 - ds2) + 1);
  st.vx = side * BOUNCE;
  if (st.stun === 0) {
    st.hits += 1;
    st.light -= HIT_LOSS;
    st.stun = STUN_TICKS;
    st.events.push({ type: 'hit', id, side });
  }
}

/** Light gathered, in the whole units the game shows. */
export function glow(st: RunState): number {
  return idiv(st.gathered, 1000);
}

/** Whole metres travelled: up to now during a run, up to its end afterwards. */
export function metres(st: RunState): number {
  return idiv(st.phase === 'run' ? st.s : st.endS, UM);
}

/** Light gathered first, then the distance in metres as the tie-break. */
export function score(st: RunState): number {
  return glow(st) * 1000 + Math.min(999, metres(st));
}

/** A short fingerprint of the full state, for determinism checks. */
export function hash(st: RunState): string {
  const text = JSON.stringify([
    st.rules, st.stage, st.stageVersion, st.seed, st.tick, st.phase, st.endReason, st.endTick, st.endS,
    st.s, st.x, st.vx, st.vs, st.target, st.light, st.gathered, st.hits, st.gates, st.stun,
    st.scraping, st.shrine, st.gusting,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
