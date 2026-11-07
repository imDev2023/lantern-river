# Lantern River

A daily river game in Three.js, built for x-gaming#6 (github.com/imDev2023/x-gaming): an original game with Sumiro-level art, a daily run and a score a server can replay.
The operator chose this concept, this repo and a fal budget of up to 30 USD on 2026-11-07.
Read [SPEC.md](SPEC.md) for the design and [docs/architecture.md](docs/architecture.md) for the layers and the Solana path before changing anything.

## Rules

- `src/sim/` is the score a server will replay: integers only, no clock, no `Math.random`, no imports from outside the folder.
  Run `npm run check` (types, tests, build) after any change; the boundary test enforces the rest.
- Load the page with `?debug`, which logs an error if drawing writes into the rules' state.
- Never change a stage that has had a daily run; bump its `version`.
  Any change to what a run computes bumps `RULES` in `src/sim/run.ts`.
- The owner plans to add stages and Solana integration later (2026-11-07): keep stages as data, keep chain code out of `src/sim/`, and load wallet code on demand.
  Nothing touches a chain until the game is built.
- The owner chose no sign-in for now: anyone can play, and the day's best stays in their browser.
- Licence (owner, 2026-11-07, same as Dockstack): code MIT No Attribution, our assets CC0.
- Use Vercel for hosting, as Dockstack does; the owner asked not to use Cloudflare for Dockstack.
- The repo is public: no keys, no raw paid outputs (they live in the gitignored `raw/`, the only copy, never delete it), and no copied text or screenshots of other people's work.
- Generation calls (fal and the like) are paid and need the owner's approval each time.
  Run them through `node tools/fal.ts`, then read the exact charge from fal's usage API with `FAL_BILLING_KEY` (x-gaming's WORKFLOW.md, Costs) and log that in the spend ledger and CREDITS.md.
- Follow x-gaming's WORKFLOW.md for the asset pipeline: concept art, image-to-3D, the Blender asset loop and its done checks, then the ship check.
- Playtest with `tools/autoplay.js` (it drags like a finger) through `agent-browser`, and check a run with `node tools/replay.ts`.

## Issues

Issues are tracked on github.com/imDev2023/x-gaming: #6 is this game.

## Multica dashboard

This project is mirrored on the owner's Multica dashboard (workspace Pandora) under the x-gaming project `5e65d424-8653-4e40-8aca-449c8e90891c`.
GitHub Issues on `imDev2023/x-gaming` stay the source of truth; Multica only mirrors them, and each Multica ticket title starts with its issue number.
At the end of every session, after the issues are updated, run the `multica-sync` skill for that project: mirror ticket statuses, add any new tickets, and refresh the project's "Current step" section.
Every status and assignment write passes `--no-start` (`issue create` rejects the flag), and no ticket is ever assigned to an agent, so the sync never starts an agent run.
If the `multica` CLI is not signed in, say so in the session summary and stop anyway; the sync never blocks the work.
