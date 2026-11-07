// A run as a record a server can check: which rules, which stage, which seed, and the
// player's steering as the ticks at which the target changed.

import { quantizeTarget, TARGET_STEP } from './run.ts';

/** From `tick` on, the boat steers for `target`. */
export type Steer = readonly [tick: number, target: number];

export interface RunRecord {
  readonly rules: string;
  readonly stage: string;
  readonly stageVersion: number;
  readonly seed: number;
  readonly inputs: readonly Steer[];
}

/** Collects a live run's steering, one call per tick before that tick is stepped. */
export class Recorder {
  readonly inputs: Steer[] = [];
  private last = 0;

  /** Record steering for tick `tick` and return the target to step with. */
  steer(tick: number, target: number): number {
    const t = quantizeTarget(target);
    if (t !== this.last) {
      this.inputs.push([tick, t]);
      this.last = t;
    }
    return t;
  }
}

export function makeRecord(rules: string, stage: string, stageVersion: number, seed: number, inputs: readonly Steer[]): RunRecord {
  return { rules, stage, stageVersion, seed, inputs };
}

// The steering travels as unsigned LEB128 varints of each tick's gap and the zigzagged
// change in target steps, then base64url: about 3 bytes per change.

const VERSION = 1;

function pushVarint(out: number[], v: number): void {
  let n = v;
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

const zigzag = (v: number): number => (v >= 0 ? 2 * v : -2 * v - 1);
const unzigzag = (v: number): number => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);

export function encodeInputs(inputs: readonly Steer[]): string {
  const out: number[] = [VERSION];
  let tick = 0;
  let steps = 0;
  for (const [t, target] of inputs) {
    const s = target / TARGET_STEP;
    pushVarint(out, t - tick);
    pushVarint(out, zigzag(s - steps));
    tick = t;
    steps = s;
  }
  let bin = '';
  for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Decode steering; throws on anything malformed rather than guessing. */
export function decodeInputs(text: string): Steer[] {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('inputs are not base64url');
  const bin = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = Array.from(bin, (c) => c.charCodeAt(0));
  if (bytes[0] !== VERSION) throw new Error(`unknown inputs version ${bytes[0]}`);
  let i = 1;
  const varint = (): number => {
    let v = 0;
    let scale = 1;
    for (;;) {
      const b = bytes[i++];
      if (b === undefined) throw new Error('inputs end mid-number');
      v += (b & 0x7f) * scale;
      if (b < 0x80) return v;
      scale *= 0x80;
      if (scale > 2 ** 35) throw new Error('inputs number too long');
    }
  };
  const inputs: Steer[] = [];
  let tick = 0;
  let steps = 0;
  while (i < bytes.length) {
    tick += varint();
    steps += unzigzag(varint());
    inputs.push([tick, steps * TARGET_STEP]);
  }
  return inputs;
}
