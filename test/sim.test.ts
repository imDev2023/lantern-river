import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOAT_R, CHUNK, GATE_MARGIN, LIGHT_MAX, RULES, TICK_HZ, UM,
  createRun, createWorld, decodeInputs, encodeInputs, hash, makeRecord, replay, rng, score, step,
  type RunState, type Stage,
} from '../src/sim/index.ts';
import { canalTown } from '../src/stages/canal-town.ts';
import { STAGES, dailyRun, dayKey } from '../src/stages/index.ts';
import { channelPilot, play, shrinePilot, stillPilot } from './pilots.ts';

const SEEDS = [1, 7, 42, 20261107, 4_000_000_000];

test('the same seed and steering give the same run', () => {
  const a = play(canalTown, 7, shrinePilot);
  const b = play(canalTown, 7, shrinePilot);
  assert.equal(hash(a.st), hash(b.st));
  assert.equal(score(a.st), score(b.st));
  assert.equal(a.st.phase, 'done');
});

test('a server replay of a live run gives the same score and state', () => {
  for (const seed of SEEDS) {
    for (const pilot of [channelPilot, shrinePilot, stillPilot]) {
      const live = play(canalTown, seed, pilot);
      const r = replay(canalTown, live.record);
      assert.ok(r.ok, r.ok ? '' : r.reason);
      assert.equal(r.score, score(live.st));
      assert.equal(r.hash, hash(live.st));
      assert.equal(r.ticks, live.st.tick);
    }
  }
});

test('a run record survives encoding to text', () => {
  const live = play(canalTown, 42, shrinePilot);
  const text = encodeInputs(live.record.inputs);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeInputs(text), live.record.inputs);
  // About 3 bytes of text per steering change keeps a whole run small enough for a URL.
  assert.ok(text.length < live.record.inputs.length * 5, `${text.length} chars for ${live.record.inputs.length} changes`);
  assert.throws(() => decodeInputs('AQ$'), /base64url/);
  assert.throws(() => decodeInputs(btoa('\x02').replace(/=+$/, '')), /version/);
  // A tick gap of 200 needs two bytes; cut after the first.
  assert.throws(() => decodeInputs(btoa('\x01\xc8').replace(/=+$/, '')), /mid-number/);
});

test('every number in the state stays an integer', () => {
  const world = createWorld(canalTown, 11);
  const st = createRun(world);
  const ints = (v: unknown): boolean =>
    typeof v === 'number' ? Number.isInteger(v) : v && typeof v === 'object' ? Object.values(v).every(ints) : true;
  while (st.phase !== 'done') {
    step(world, st, channelPilot(world, st) - (channelPilot(world, st) % 10_000));
    assert.ok(ints(st), `non-integer state at tick ${st.tick}`);
  }
});

test('a chunk is the same whether built alone or after the others', () => {
  for (const seed of SEEDS) {
    const inOrder = createWorld(canalTown, seed);
    const all = Array.from({ length: inOrder.lastChunk + 3 }, (_, k) => inOrder.chunk(k));
    for (const k of [0, 3, 9, inOrder.lastChunk - 1, inOrder.lastChunk + 2]) {
      assert.deepEqual(createWorld(canalTown, seed).chunk(k), all[k]);
    }
  }
});

test('the open channel gets through every rock row', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const world = createWorld(canalTown, seed);
    for (let k = 0; k <= world.lastChunk; k++) {
      for (const r of world.chunk(k).rocks) {
        const clear = Math.abs(r.x - world.channel(r.s)) - r.r;
        assert.ok(clear >= BOAT_R + 300_000, `seed ${seed} rock ${r.id} leaves ${clear} um`);
      }
      for (const g of world.chunk(k).gates) {
        const c = world.channel(g.s);
        assert.ok(Math.abs(c - g.x) <= g.gap / 2 - BOAT_R - GATE_MARGIN, `seed ${seed} gate ${g.id} blocks the channel`);
        assert.ok(Math.abs(g.x) + g.gap / 2 < world.halfWidth(g.s) - BOAT_R, `seed ${seed} gate ${g.id} is off the river`);
      }
    }
  }
});

test('a pilot keeping to the channel never hits anything', () => {
  for (let seed = 1; seed <= 40; seed++) {
    assert.equal(play(canalTown, seed, channelPilot).st.hits, 0, `seed ${seed}`);
  }
});

test('playing only safe lets the flame go out: the shrines are what carry it to the sea', () => {
  for (const seed of SEEDS) {
    const { st } = play(canalTown, seed, channelPilot);
    assert.equal(st.endReason, 'out', `seed ${seed}`);
    assert.ok(st.endS < canalTown.length * 0.7, `seed ${seed} got to ${st.endS / UM} m`);
  }
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(play(canalTown, seed, shrinePilot).st.endReason, 'sea', `seed ${seed}`);
  }
});

test('a run to the sea lasts between 30 and 90 seconds', () => {
  for (const seed of SEEDS) {
    const { st } = play(canalTown, seed, shrinePilot);
    const seconds = st.endTick / TICK_HZ;
    assert.ok(seconds >= 30 && seconds <= 90, `seed ${seed} took ${seconds} s`);
  }
});

test('rocks matter: chasing shrines without looking runs into them', () => {
  for (const seed of SEEDS) {
    const { st } = play(canalTown, seed, shrinePilot);
    assert.ok(st.hits >= 3, `seed ${seed}: only ${st.hits} hits`);
  }
});

test('shrines matter: swinging past them gathers more light than playing safe', () => {
  let safe = 0;
  let greedy = 0;
  for (const seed of SEEDS) {
    safe += play(canalTown, seed, channelPilot).st.gathered;
    greedy += play(canalTown, seed, shrinePilot).st.gathered;
  }
  assert.ok(greedy > safe * 1.3, `greedy ${greedy} vs safe ${safe}`);
});

test('the flame going out ends the run, and the score counts the distance at that moment', () => {
  const dark: Stage = { ...canalTown, id: 'dark', light: { start: 200_000, drain: 4_000 } };
  const world = createWorld(dark, 3);
  const st: RunState = createRun(world);
  while (st.phase === 'run') step(world, st, 0);
  assert.equal(st.endReason, 'out');
  assert.equal(st.light, 0);
  const at = st.endS;
  while (st.phase !== 'done') step(world, st, 0);
  assert.ok(st.s > at, 'the boat drifts on after the end');
  assert.equal(score(st) % 1000, Math.floor(at / UM));
});

test('light never exceeds the flame\'s full light', () => {
  const rich: Stage = { ...canalTown, id: 'rich', shrines: { ...canalTown.shrines, gain: 200_000 } };
  const { st } = play(rich, 5, shrinePilot);
  assert.ok(st.gathered > LIGHT_MAX);
  assert.ok(st.light <= LIGHT_MAX);
});

test('replay rejects a record that could not have happened', () => {
  const live = play(canalTown, 2, shrinePilot);
  const rec = live.record;
  const bad = (patch: Partial<typeof rec>) => replay(canalTown, { ...rec, ...patch });
  assert.equal(bad({ rules: 'lantern-river/0' }).ok, false);
  assert.equal(bad({ stageVersion: 2 }).ok, false);
  assert.equal(bad({ seed: -1 }).ok, false);
  assert.equal(bad({ inputs: [[10, 20_000], [10, 30_000]] }).ok, false);
  assert.equal(bad({ inputs: [[10, 20_001]] }).ok, false);
  const after = bad({ inputs: [...rec.inputs, [live.st.endTick + 5, 0]] });
  assert.equal(after.ok, false);
  assert.match(after.ok ? '' : after.reason, /after the run ended/);
  assert.equal(replay(canalTown, makeRecord(RULES, 'canal-town', 1, 2, [])).ok, true);
});

test('each day gets its own river', () => {
  const a = dailyRun(dayKey(new Date(Date.UTC(2026, 10, 7))));
  const b = dailyRun(dayKey(new Date(Date.UTC(2026, 10, 8))));
  assert.equal(dayKey(new Date(Date.UTC(2026, 10, 7, 23, 59))), 20261107);
  assert.notEqual(a.seed, b.seed);
  const rocksOf = (seed: number) => JSON.stringify(createWorld(a.stage, seed).chunk(5).rocks);
  assert.notEqual(rocksOf(a.seed), rocksOf(b.seed));
});

test('every listed stage is valid and plays to the end', () => {
  const ids = new Set<string>();
  for (const stage of STAGES) {
    assert.ok(!ids.has(stage.id), `duplicate stage ${stage.id}`);
    ids.add(stage.id);
    assert.ok(stage.length % 1 === 0 && stage.length > 3 * CHUNK);
    assert.ok(stage.halfWidth[0] - stage.rocks.channel[0] / 2 - BOAT_R > 0, `${stage.id}: channel wider than the river`);
    const { st } = play(stage, 1, channelPilot);
    assert.equal(st.phase, 'done');
  }
});

test('the generator matches the reference mulberry32', () => {
  function reference(seed: number) {
    let a = seed;
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (const seed of [1, 42, 20261107]) {
    const ours = rng(seed);
    const ref = reference(seed);
    for (let i = 0; i < 100; i++) assert.equal(ours() / 4294967296, ref());
  }
});
