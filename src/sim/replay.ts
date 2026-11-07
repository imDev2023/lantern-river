// What a server runs to check a claimed score: replay the record with these rules.

import { idiv } from './int.ts';
import type { RunRecord } from './record.ts';
import { END_TICKS, RULES, STUN_SPEED, createRun, glow, hash, metres, quantizeTarget, score, step } from './run.ts';
import type { Stage } from './stage.ts';
import { createWorld } from './world.ts';

export type ReplayResult =
  | {
      readonly ok: true;
      readonly score: number;
      readonly glow: number;
      readonly metres: number;
      readonly reachedSea: boolean;
      readonly hits: number;
      readonly gates: number;
      readonly ticks: number;
      readonly hash: string;
    }
  | { readonly ok: false; readonly reason: string };

/** The most ticks a run of this stage can take: the whole river at its slowest, plus the end. */
export function maxTicks(stage: Stage): number {
  return idiv(stage.length, idiv(stage.speed[0] * STUN_SPEED, 100)) + END_TICKS + 2;
}

export function replay(stage: Stage, record: RunRecord): ReplayResult {
  if (record.rules !== RULES) return { ok: false, reason: `rules ${record.rules} are not ${RULES}` };
  if (record.stage !== stage.id || record.stageVersion !== stage.version) {
    return { ok: false, reason: `record is for ${record.stage} v${record.stageVersion}, not ${stage.id} v${stage.version}` };
  }
  if (!(Number.isInteger(record.seed) && record.seed >= 0 && record.seed < 2 ** 32)) {
    return { ok: false, reason: 'seed is not a 32-bit unsigned integer' };
  }
  let prev = 0;
  for (const [tick, target] of record.inputs) {
    if (!Number.isInteger(tick) || tick <= prev) return { ok: false, reason: `input tick ${tick} is not after ${prev}` };
    if (quantizeTarget(target) !== target) return { ok: false, reason: `target ${target} at tick ${tick} is not a valid step` };
    prev = tick;
  }

  const world = createWorld(stage, record.seed);
  const st = createRun(world);
  const limit = maxTicks(stage);
  let target = 0;
  let i = 0;
  while (st.phase !== 'done' && st.tick < limit) {
    const next = record.inputs[i];
    if (next && next[0] === st.tick + 1) {
      if (st.phase !== 'run') return { ok: false, reason: `input at tick ${next[0]} after the run ended` };
      target = next[1];
      i += 1;
    }
    step(world, st, target);
  }
  if (st.phase !== 'done') return { ok: false, reason: 'run did not finish' };
  if (i < record.inputs.length) return { ok: false, reason: 'inputs after the run ended' };
  return {
    ok: true,
    score: score(st),
    glow: glow(st),
    metres: metres(st),
    reachedSea: st.endReason === 'sea',
    hits: st.hits,
    gates: st.gates,
    ticks: st.tick,
    hash: hash(st),
  };
}
