// Print how the test pilots fare on each stage, for tuning: npm run balance [stage-id] [seeds]
// "SEA 300m 83s h10 g2 glow5281" is a run that reached the sea in 83 s with 10 hits,
// 2 gates and 5,281 light gathered.

import { createWorld, UM } from '../src/sim/index.ts';
import { STAGES, stageById } from '../src/stages/index.ts';
import { channelPilot, play, shrinePilot, stillPilot } from '../test/pilots.ts';

const stages = process.argv[2] ? [stageById(process.argv[2])!] : STAGES;
const seeds = Number(process.argv[3] ?? 10);
for (const stage of stages) {
  console.log(`${stage.id} v${stage.version}, ${stage.length / UM} m`);
  for (const [name, pilot] of [['safe', channelPilot], ['shrines', shrinePilot], ['still', stillPilot]] as const) {
    const rows: string[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const { st } = play(stage, seed, pilot);
      rows.push(`${st.endReason === 'sea' ? 'SEA' : 'out'} ${Math.floor(st.endS / UM)}m ${Math.round(st.endTick / 60)}s h${st.hits} g${st.gates} glow${Math.floor(st.gathered / 1000)}`);
    }
    console.log(`  ${name.padEnd(8)} ${rows.join(' | ')}`);
  }
  const n = { rocks: 0, gates: 0, shrines: 0, gusts: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const w = createWorld(stage, seed);
    for (let k = 0; k <= w.lastChunk; k++) {
      const c = w.chunk(k);
      n.rocks += c.rocks.length;
      n.gates += c.gates.length;
      n.shrines += c.shrines.length;
      n.gusts += c.gust ? 1 : 0;
    }
  }
  console.log(`  per run: ${n.rocks / seeds} rocks, ${n.gates / seeds} gates, ${n.shrines / seeds} shrines, ${n.gusts / seeds} gusts`);
}
