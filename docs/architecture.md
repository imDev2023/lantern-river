# Architecture

How Lantern River is put together, and how it grows into more stages and a Solana game without a rewrite.

## Layers

```text
src/sim/      the rules: integers only, imports nothing outside itself
src/stages/   stage data and the daily-run choice; imports only types and hashing from src/sim
src/game/     the page: Three.js scene, controls, cards; reads the rules' state, never writes it
tools/        balance table, replay check, autoplay, fal runner
test/         the rules' tests and test pilots
```

- **The rules** (`src/sim/`) are the only code that decides a score.
  They run unchanged in the browser and in Node, so a server can replay a run with exactly the code the player ran.
  `test/boundary.test.ts` fails if a file there imports anything from outside the folder, or uses a clock, `Math.random` or floating-point maths.
- **Stages** are data (`src/sim/stage.ts`): a new stage is a new file in `src/stages/` plus its art, with no change to the rules.
  The rules' version (`RULES` in `src/sim/run.ts`) changes only when what a run computes changes, such as a new kind of obstacle.
- **The page** turns touch, mouse, keyboard and gamepad into one steering target per tick, records it (`Recorder`), steps the rules at a fixed 60 ticks a second and draws the state between ticks.
  Under `?debug` it hashes the state before and after drawing and logs an error if drawing changed it.

## The river streams in chunks

The rules work in the river's straightened frame: `s` downstream and `x` across.
The river is cut into 20 m chunks, and each chunk's rocks, gates, shrines and gusts come from the seed and the chunk's own index alone.
So the renderer builds only the chunks near the boat and drops the ones behind it, a stage can be any length, and a chunk's art can be loaded just before it is needed.
Bends exist only in the renderer (`src/game/path.ts`), so the art can bend the river however it likes without touching the rules.

## A run is a record a server can check

A run is `{ rules, stage, stageVersion, seed, inputs }`, where `inputs` lists the ticks at which the steering target changed, at 1 cm steps.
`encodeInputs` packs it into base64url at under 3 characters per change: a full 84 s run with 829 changes is 2,290 characters.
`replay(stage, record)` returns the score and a state hash, and refuses a record for other rules, another stage version, or inputs that could not have happened.
A run played in Chrome replayed in Node to the same tick, score and state hash (`tools/replay.ts`, 2026-11-07).

## Growing into Solana

Nothing in this repo touches a chain yet.
These are the planned steps, each a separate piece that leaves the rules alone.

1. **A daily seed nobody controls.**
   Today the daily seed is a hash of the UTC date and the stage (`dailyRun` in `src/stages/index.ts`).
   On chain it becomes a hash of the first Solana slot hash after midnight UTC, published once a day; only `dailyRun` changes.
2. **A replay service.**
   A server endpoint (a Vercel function, like Dockstack's hosting) takes a record, replays it with the same rules build, and only then accepts the score.
   Following x-gaming's WORKFLOW.md: it refuses a run claiming more ticks than the time since the seed was published allows, takes the player from a verified wallet signature over the record (Solana `signMessage`, ed25519), never from the request body, and counts each record once.
3. **An on-chain leaderboard and prizes.**
   An Anchor program keeps each day's top scores per stage and accepts a score only with the replay service's ed25519 signature over the day, stage, wallet, score and record hash (checked through the Ed25519 program).
   Daily prizes or burns of the game's token settle from that account at day close.
4. **Cosmetics.**
   Skins are wallet-held assets (for example Metaplex Core) that the page reads and draws.
   The rules never see them and a record never carries them, so a skin can be sold or burned without changing any score.
5. **Wallet code loads on demand.**
   Wallet libraries are a separate chunk loaded only when a player taps Connect, so the first load stays small for everyone else.

## Rules for changing things

- A stage that has had a daily run is frozen; change its layout by bumping its `version`.
- Any change to what a run computes bumps `RULES`; a server keeps every rules version it still has records for.
- `npm run check` (types, tests, build) passes before every commit, and `npm run balance` shows what a change does to the pilots' runs.
