// Replay a run record as a server would: node tools/replay.ts <record.json>
// The file holds { rules, stage, stageVersion, seed, encoded } (window.__game.record()),
// or the same with `inputs` as [tick, target] pairs.

import { readFileSync } from 'node:fs';
import { decodeInputs, replay } from '../src/sim/index.ts';
import { stageById } from '../src/stages/index.ts';

let data = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
while (typeof data === 'string') data = JSON.parse(data);
const rec = data.rec ?? data;
const stage = stageById(rec.stage);
if (!stage) throw new Error(`unknown stage ${rec.stage}`);
const inputs = rec.encoded ? decodeInputs(rec.encoded) : rec.inputs;
console.log(JSON.stringify({ changes: inputs.length, encodedChars: rec.encoded?.length, ...replay(stage, { ...rec, inputs }) }));
