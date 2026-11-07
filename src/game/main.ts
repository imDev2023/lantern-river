// The page: runs the rules at a fixed 60 ticks a second, draws them, and shows the cards.
//
// URL parameters: ?seed=N and ?stage=<id> replace the daily run, ?autostart skips the
// title, and ?debug shows frame rate, draw calls and the
// state hash, and logs an error if drawing ever changes the rules' state.

import {
  BOAT_R, LIGHT_MAX, Recorder, TICK_HZ, UM, createRun, createWorld, encodeInputs, glow, hash, makeRecord, metres, score, step,
  type RunState, type World,
} from '../sim/index.ts';
import { dailyRun, dayKey, stageById } from '../stages/index.ts';
import { createControls } from './input.ts';
import { createView } from './scene.ts';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const today = dayKey(new Date());
const daily = dailyRun(today);
const stage = stageById(params.get('stage') ?? '') ?? daily.stage;
const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : daily.seed;
const isDaily = stage === daily.stage && seed === daily.seed;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  hud: $('hud'), light: $('light'), trip: $('trip'), glow: $('glow'), flame: $('light').parentElement!,
  title: $('title'), day: $('day'), paused: $('paused'), over: $('over'),
  verdict: $('verdict'), finalGlow: $('final-glow'), finalDetail: $('final-detail'), best: $('best'),
  share: $<HTMLAnchorElement>('share'), debug: $('debug'),
};

// Under ?debug, show uncaught errors on the page itself: a phone has no console to read.
if (debug) {
  const show = (msg: string) => {
    ui.debug.hidden = false;
    ui.debug.textContent = `${ui.debug.textContent ?? ''}\nERROR ${msg}`.trim();
  };
  window.addEventListener('error', (e) => show(`${e.message} at ${e.filename?.split('/').pop()}:${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection', (e) => show(String(e.reason)));
}

const dayText = `${String(today).slice(0, 4)}-${String(today).slice(4, 6)}-${String(today).slice(6)}`;
ui.day.textContent = isDaily ? `${stage.name} · daily river for ${dayText}` : `${stage.name} · river ${seed}`;

let world: World = createWorld(stage, seed);
let st: RunState = createRun(world);
let rec = new Recorder();
let prev = { s: st.s, x: st.x };
let mode: 'title' | 'play' | 'paused' | 'over' = 'title';
let acc = 0;
let shownGlow = -1;

const view = createView($<HTMLCanvasElement>('view'), world);
const controls = createControls($('surface'));
view.resize();
window.addEventListener('resize', () => view.resize());

function newRun(): void {
  world = createWorld(stage, seed);
  st = createRun(world);
  rec = new Recorder();
  prev = { s: st.s, x: st.x };
  acc = 0;
  shownGlow = -1;
  controls.reset();
  view.reset(world);
}

function setMode(next: typeof mode): void {
  mode = next;
  ui.title.hidden = next !== 'title';
  ui.paused.hidden = next !== 'paused';
  ui.over.hidden = next !== 'over';
  ui.hud.hidden = next === 'title';
}

function start(): void {
  if (mode === 'title') setMode('play');
}

function restart(): void {
  newRun();
  setMode('play');
}

function togglePause(): void {
  if (mode === 'play') setMode('paused');
  else if (mode === 'paused') setMode('play');
}

controls.onAction(start);
controls.onCommand((cmd) => {
  if (cmd === 'pause') togglePause();
  else if (cmd === 'restart' && mode !== 'title') restart();
});
$('pause').addEventListener('click', togglePause);
$('restart').addEventListener('click', restart);
$('restart2').addEventListener('click', restart);
$('resume').addEventListener('click', togglePause);
$('again').addEventListener('click', restart);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') setMode('paused');
});

// The day's best stays in this browser only; storage can be missing or blocked.
const bestKey = `lantern-river:best:${stage.id}:${isDaily ? today : `seed-${seed}`}`;
function readBest(): number {
  try {
    return Number(localStorage.getItem(bestKey) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v: number): void {
  try {
    localStorage.setItem(bestKey, String(v));
  } catch {
    /* private mode: the best just is not kept */
  }
}

function finish(): void {
  const s = score(st);
  const g = glow(st);
  const m = metres(st);
  const sea = st.endReason === 'sea';
  const best = readBest();
  if (s > best) saveBest(s);
  ui.verdict.textContent = sea ? 'You reached the sea' : 'Your flame went out';
  ui.finalGlow.textContent = g.toLocaleString('en');
  ui.finalDetail.textContent = sea ? `${m} m, all the way down ${stage.name}` : `${m} of ${stage.length / UM} m down ${stage.name}`;
  ui.best.textContent = s > best && best > 0 ? 'A new best for today' : best > 0 ? `Today's best: ${Math.floor(best / 1000).toLocaleString('en')} light` : '';
  const line = sea
    ? `I carried my lantern down ${stage.name} to the sea with ${g.toLocaleString('en')} light.`
    : `My lantern went out ${m} m down ${stage.name}, with ${g.toLocaleString('en')} light gathered.`;
  const text = `Lantern River, ${isDaily ? dayText : `river ${seed}`}: ${line}`;
  const url = `${location.origin}${location.pathname}${isDaily ? '' : `?seed=${seed}`}`;
  ui.share.href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  setMode('over');
}

function tick(): void {
  prev = { s: st.s, x: st.x };
  const limit = (world.halfWidth(st.s) - BOAT_R) / UM;
  const want = st.phase === 'run' ? controls.target(limit) * UM : st.target;
  const target = st.phase === 'run' ? rec.steer(st.tick + 1, want) : st.target;
  const events = step(world, st, target);
  view.react(events);
  for (const e of events) {
    if (e.type === 'gate' || e.type === 'shrine') {
      ui.glow.classList.remove('pop');
      void ui.glow.offsetWidth;
      ui.glow.classList.add('pop');
    }
  }
  if (st.phase === 'done') finish();
}

function hud(): void {
  ui.light.style.transform = `scaleX(${st.light / LIGHT_MAX})`;
  ui.flame.classList.toggle('low', st.light < LIGHT_MAX * 0.2);
  ui.trip.style.transform = `scaleX(${Math.min(1, st.s / stage.length)})`;
  const g = glow(st);
  if (g !== shownGlow) {
    ui.glow.textContent = g.toLocaleString('en');
    shownGlow = g;
  }
}

// For tools and tests: read-only access to the live run (tools/autoplay, render-video).
Object.defineProperty(window, '__game', {
  value: {
    get state() { return st; },
    get world() { return world; },
    get mode() { return mode; },
    record: () => ({ ...makeRecord(st.rules, st.stage, st.stageVersion, st.seed, rec.inputs), encoded: encodeInputs(rec.inputs) }),
  },
});

let last = performance.now();
let frames = 0;
let fpsAt = last;
let fps = 0;
/** Milliseconds from navigation to the first drawn frame: the load time a player sees. */
let firstFrame = 0;
const STEP = 1 / TICK_HZ;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.poll();
  if (mode === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6 && mode === 'play') {
      tick();
      acc -= STEP;
      n += 1;
    }
    if (n === 6) acc = 0;
  }
  const before = debug ? hash(st) : '';
  view.draw(st, prev, mode === 'play' ? acc / STEP : 1, dt);
  if (!firstFrame) {
    firstFrame = Math.round(performance.now());
    document.documentElement.dataset.firstFrame = String(firstFrame);
  }
  if (debug && hash(st) !== before) console.error(`drawing changed the rules' state at tick ${st.tick}`);
  hud();
  if (debug) {
    frames += 1;
    if (now - fpsAt >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
      const { calls, triangles } = view.stats();
      ui.debug.hidden = false;
      if (!ui.debug.textContent?.includes('ERROR')) ui.debug.textContent = `${fps} fps · ${calls} calls · ${triangles} tris · first frame ${firstFrame} ms\n${stage.id} seed ${seed} · tick ${st.tick} · ${hash(st)}`;
    }
  }
  requestAnimationFrame(frame);
}

if (params.has('autostart')) setMode('play');
requestAnimationFrame(frame);
