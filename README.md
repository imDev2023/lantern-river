# Lantern River

Steer a lantern boat down a festival-night river and carry its flame to the sea.
A new river every day, the same for everyone.

The game is a grey-box build: the rules, controls, cards and daily run are done, and the art comes next.
It is built for [x-gaming#6](https://github.com/imDev2023/x-gaming/issues/6).

## How to play

1. Drag left and right anywhere on the screen to steer; arrow keys, A and D, and a gamepad's stick or d-pad work too.
2. Pass close to a shrine on the bank and its light feeds your flame; thread a lantern gate's two posts for a burst more.
3. Rocks, the banks and gusts of wind dim the flame, and it dims a little all the time.
4. The run ends when the flame goes out or the boat reaches the sea.
   Most light gathered wins, then the distance.

A run to the sea takes about 80 s.
The buttons in the top-right corner pause and restart a run; `P` or `Esc` pauses and `R` restarts.
A run also pauses when you switch tabs, and a restart gives the same river again.

## Run it locally

```bash
npm install
npm run dev          # then open the address it prints
npm run check        # types, the rules' tests and a production build
npm run balance      # how the test pilots fare on each stage
```

URL parameters: `?seed=N` and `?stage=<id>` (default: the day's river, from the UTC date), `?autostart` and `?debug` (frame rate, draw calls, triangles, the state hash, and an error in the console if drawing ever writes into the rules' state).

To check a run as a server would, save `window.__game.record()` from the page as JSON and run `node tools/replay.ts <file>`.
[tools/autoplay.js](tools/autoplay.js) plays a run by dragging like a finger, for playtests.

## How it is built

- **Rules:** [src/sim](src/sim), the whole game in integers so a server can replay a run exactly; see [SPEC.md](SPEC.md) and [docs/architecture.md](docs/architecture.md).
- **Stages:** [src/stages](src/stages), one data file per stage; Canal Town is the first.
- **Page:** [src/game](src/game), Three.js r186 through Vite and TypeScript.
- **Concept:** the [concept video](video/concept.mp4) and its [frames](study/sheet.jpg), generated on fal; every generated asset's source and terms are in [CREDITS.md](CREDITS.md).

The production build loads about 150 KB (gzipped) before the first input.

## Licence

Use it however you want: copy it, change it, sell it or build your own game from it, with no credit required.

- **Code:** MIT No Attribution, in [LICENSE](LICENSE).
- **Our images, video and other assets:** dedicated to the public domain under CC0 1.0, in [LICENSE-ASSETS](LICENSE-ASSETS).
- Generated assets may also carry their generator's output terms; see [CREDITS.md](CREDITS.md).
