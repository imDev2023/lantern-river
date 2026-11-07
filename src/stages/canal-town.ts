// Stage 1: festival night through an old canal town, from the upper locks to the sea.

import type { Stage } from '../sim/index.ts';

const M = 1_000_000;
/** Metres per second as micrometres per tick. */
const mps = (v: number): number => Math.round((v * M) / 60);

export const canalTown: Stage = {
  id: 'canal-town',
  version: 1,
  name: 'Canal Town',
  length: 300 * M,
  speed: [mps(3.2), mps(4.4)],
  halfWidth: [3.6 * M, 5.6 * M],
  light: { start: 700_000, drain: 450 },
  rocks: {
    rowsPer100: [100, 260],
    radius: [350_000, 800_000],
    channel: [2_600_000, 1_900_000],
    second: [10, 55],
  },
  shrines: { chance: [80, 60], aura: 4_500_000, gain: 5_000 },
  gates: { chance: [30, 20], gap: [1_600_000, 1_200_000], bonus: 60_000 },
  wind: { chance: [0, 45], length: [6 * M, 12 * M], push: 400, drain: 300 },
};
