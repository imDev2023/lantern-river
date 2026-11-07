// Test pilots: simple players that steer like a person would, for driving whole runs.

import {
  Recorder, createRun, createWorld, idiv, makeRecord, step, type RunState, type Stage, type World,
} from '../src/sim/index.ts';

export type Pilot = (world: World, st: RunState) => number;

/** Steers for the open channel a quarter of a second ahead. */
export const channelPilot: Pilot = (world, st) => world.channel(st.s + st.vs * 15);

/** Follows the channel, but swings over to every shrine it is coming up on. */
export const shrinePilot: Pilot = (world, st) => {
  const k = idiv(st.s, 20_000_000);
  for (const kk of [k, k + 1]) {
    for (const sh of world.chunk(kk).shrines) {
      const ahead = sh.s - st.s;
      if (ahead > -2_000_000 && ahead < 9_000_000) return sh.x - sh.side * 1_200_000;
    }
  }
  return channelPilot(world, st);
};

/** Never steers. */
export const stillPilot: Pilot = () => 0;

/** Play a whole run with a pilot, recording its steering as the page does. */
export function play(stage: Stage, seed: number, pilot: Pilot) {
  const world = createWorld(stage, seed);
  const st = createRun(world);
  const rec = new Recorder();
  while (st.phase !== 'done') {
    const target = st.phase === 'run' ? rec.steer(st.tick + 1, pilot(world, st)) : st.target;
    step(world, st, target);
  }
  const record = makeRecord(st.rules, st.stage, st.stageVersion, st.seed, rec.inputs);
  return { world, st, record };
}
