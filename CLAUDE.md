# Lantern River

A daily river game in Three.js, built for x-gaming#6 (github.com/imDev2023/x-gaming): an original game with Sumiro-level art, a daily run and a score a server can replay.
The operator chose this concept, this repo and a fal budget of up to 30 USD on 2026-11-07.
Where the work stands and what is next lives in issue #6's Status section and its "Open questions for the operator".
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
  The Vercel project `lantern-river` builds from source (`.vercelignore` keeps `raw/`, `video/` and `study/` out of the upload); `vercel deploy` makes a preview behind Vercel sign-in, and `vercel deploy --prod` updates https://lantern-river.vercel.app, which waits for the owner.
  Trap (2026-11-07): Vercel's CLI sent the project's very first `vercel deploy`, without `--prod`, to production, so the grey-box went public at lantern-river.vercel.app.
- The repo is public: no keys, no raw paid outputs (they live in the gitignored `raw/`, the only copy, never delete it), and no copied text or screenshots of other people's work.
- Generation calls (fal and the like) are paid and need the owner's approval each time.
  Run them through `node tools/fal.ts`, then read the exact charge from fal's usage API with `FAL_BILLING_KEY` (x-gaming's WORKFLOW.md, Costs) and log that in the spend ledger and CREDITS.md.
- The owner rejected the code-built look on 2026-11-07 ("I hate the graphics"), even after the night-lighting pass in db4ddaf.
  Lighting, bloom and mirrored water do not close the gap: Sumiro's look comes from 26 generated, textured models (105 MB of its build), so no shape built from primitives in `scene.ts` should be shipped as final art.
- The owner lifted the size cap on 2026-11-07: up to 200 MB is fine, replacing issue #6's "under 10 MB".
  Keep the start fast by streaming: load the first stretch of river, then the rest during play (Sumiro takes 35 to 67 s to reach its title).
- fal's price list is free to read: `GET https://api.fal.ai/v1/models/pricing?endpoint_id=<id>` with `FAL_KEY` (the billing key lacks that permission).
  On 2026-11-07: Tripo v2.5 image-to-3D and multiview-to-3D 0.01 USD per credit, Hunyuan3D v2.1 0.30 per model, GPT Image 1.5 edit priced per unit.
- Follow x-gaming's WORKFLOW.md for the asset pipeline: concept art, image-to-3D, the Blender asset loop and its done checks, then the ship check.
- Cut every generated or scanned model to its phone budget with `tools/lowpoly_bake.py` (headless Blender; usage in its docstring), then `gltf-transform optimize`.
  It bakes colour as emission, since a diffuse bake turns metal black (checked 2026-11-07, x-gaming's `sources/2026-11-07-kensei-opus-blender-unity.md`).
- Playtest with `tools/autoplay.js` (it drags like a finger) through `agent-browser`, and check a run with `node tools/replay.ts`.

## Issues

Issues are tracked on github.com/imDev2023/x-gaming: #6 is this game.

## Multica dashboard

This project is mirrored on the owner's Multica dashboard (workspace Pandora) under the x-gaming project `5e65d424-8653-4e40-8aca-449c8e90891c`.
GitHub Issues on `imDev2023/x-gaming` stay the source of truth; Multica only mirrors them, and each Multica ticket title starts with its issue number.
At the end of every session, after the issues are updated, run the `multica-sync` skill for that project: mirror ticket statuses, add any new tickets, and refresh the project's "Current step" section.
Every status and assignment write passes `--no-start` (`issue create` rejects the flag), and no ticket is ever assigned to an agent, so the sync never starts an agent run.
If the `multica` CLI is not signed in, say so in the session summary and stop anyway; the sync never blocks the work.
