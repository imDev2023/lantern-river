// Every stage the game knows, by id. Add a stage by adding its file and listing it here;
// never change a stage that has had a daily run, bump its version instead.

import { hash32, hashText, type Stage } from '../sim/index.ts';
import { canalTown } from './canal-town.ts';

export const STAGES: readonly Stage[] = [canalTown];

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

/** The UTC date as YYYYMMDD. */
export function dayKey(date: Date): number {
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/**
 * The daily run: the same stage and seed for everyone on a UTC day. The seed is derived
 * from the day and the stage so two stages never share a river. When daily seeds move
 * on chain, this is the function that changes: it will take the day's committed slot hash.
 */
export function dailyRun(day: number): { stage: Stage; seed: number } {
  const stage = STAGES[0]!;
  return { stage, seed: hash32(day, hashText(stage.id)) };
}
