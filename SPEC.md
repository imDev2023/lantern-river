# Lantern River: spec

The game for [x-gaming#6](https://github.com/imDev2023/x-gaming/issues/6): an original game with Sumiro-level art, a daily run and a score a server can replay.
The operator chose this concept on 2026-11-07 from the three on the issue.
The sections marked "from the video" are written from the concept video's frames once it exists, following x-gaming's WORKFLOW.md (measured colours, measured lens).

## The pitch

On festival night a small wooden lantern boat drifts down a river through a canal town, past shrines, bridges and fireworks.
Drag left and right to steer around rocks and through lantern gates.
A shrine you pass close to lends your flame light; wind, spray and rocks dim it.
The run ends when the flame goes out or the boat reaches the sea.

## Concept video prompt

> Stylised 3D mobile game with a hand-painted gouache look and soft brush textures, festival night on a narrow river through an old canal town: a small folded paper-lantern boat carrying one glowing candle flame drifts down dark glassy water, weaving between mossy rocks and gliding between two glowing lantern posts; as it passes close to a little riverside shrine hung with paper lanterns its flame flares brighter and warm light spills across the water. Stone bridges, timber houses with lit windows and fireworks blooming in a deep indigo sky, all reflected in the river. Steady chase camera behind and above the boat, looking downstream. No text, no people.

MiniMax H3 Max on fal (`minimax/h3-max/text-to-video`), 10 s, 1080p, portrait 9:16 (the game is phone first), seed 101, prompt expansion off.
One take, as in Dockstack's calibration, unless it misses the camera or the boat.

## From the video

One take, generated on 2026-11-07 for 1.12 USD: 10.14 s, 1080 x 1920 at 24 fps, no cuts.
It is kept re-encoded at 540 px in [video/concept.mp4](video/concept.mp4); the frames are `study/f_NNN.jpg`, one every 0.5 s, so `f_005` is at 2.0 s, and [study/sheet.jpg](study/sheet.jpg) is the contact sheet.

### Camera

- A chase camera low behind the boat, about 1.5 to 2 m above the water and 3 to 4 m back, looking down the canal with the horizon in the top third (`f_005`, `f_012`).
- The boat sits centred, its bow about 60% down the frame and its stern about 80% down, and fills about a fifth of the frame's width.
- A wide lens: the canal's walls lean outwards at the frame's edges, and the canal runs to a vanishing point under the next bridge.
- The camera never cuts and barely sways; the canal turns gently and the camera follows the boat through it.

### Hero

The video made the boat a small wooden rowboat with a single candle flame on a post at its bow, not the folded paper boat the prompt asked for (`f_005`).
It reads well at phone size: a warm orange hull, a bright flame and a soft pool of light on the water around it.
The operator chose the wooden boat on 2026-11-07: it reads well at phone size, and a simple hull is built well in Blender, where folded paper would need a generator and cleanup.

### The key moments

- **A lantern gate:** two stone-capped wooden lantern posts stand in the water on either side of the boat's line, and the boat glides between them (`f_004` to `f_005`, 1.5 to 2.0 s).
- **A shrine:** a small wooden shrine on a stone landing at the canal's right bank, with two round paper lanterns and a candle inside, passes close at the boat's right (`f_011` to `f_015`, 5.0 to 7.0 s).
- **Bridges:** the boat passes under a stone arch bridge, the screen briefly framed by the arch (`f_015` to `f_016`).
- Fireworks bloom over the far end of the canal through most of the clip.

### World

- A narrow canal, about four boat widths across, between stone walls that rise straight from the water to three-storey plaster and half-timbered houses with lit windows.
- Strings of round paper lanterns cross the canal at roof height; street lamps stand on the walls.
- Mossy boulders sit along the walls in the water; lily pads float in clusters near the banks, some with pink flowers.
- Stone stairs lead down to the water; a second and third bridge recede into blue haze.

### Look

Measured as 8 x 8 px averages at the named points of the 540 px frames.

| Part | Hex | Frame (x, y) |
| --- | --- | --- |
| Sky, high | `#132e4b` | f_005 (250, 30) |
| Sky, low behind the houses | `#43688f` | f_005 (260, 250) |
| Water, near | `#0c1912` | f_012 (60, 820) |
| Water with reflections | `#352d22` | f_005 (250, 520) |
| Boat wood, lit | `#e59352` | f_005 (250, 690) |
| Boat hull, shaded | `#261a07` | f_012 (270, 720) |
| Flame core | `#f7eec0` | f_005 (270, 578) |
| Gate lantern glow | `#fbf9e8` | f_005 (30, 580) |
| Festoon lantern | `#fbcd74` | f_005 (148, 218) |
| Shrine wood | `#bb5325` | f_012 (365, 460) |
| Shrine lantern | `#fbe48f` | f_012 (336, 410) |
| Bridge stone | `#3e2a1e` | f_012 (210, 140) |
| Canal wall stone, far | `#241b16` | f_005 (410, 400) |
| Lily pad | `#56541e` | f_012 (425, 625) |
| Moss on a boulder | `#403627` | f_012 (515, 690) |

- Light: two worlds of light: cool moonlit blue from the sky on stone and plaster, and warm amber pools from every flame and lantern, each mirrored as a long streak on the water.
- The darkest values are the near water and the shaded hull, almost black green; the brightest are flames and lanterns, which bloom.
- Materials: soft stylised 3D with smooth shading, gentle texture on stone and wood, no outlines.
- Atmosphere: blue haze swallows the far bridges; fireworks and festoons keep the sky busy.

## Game design

- **Controls:** drag anywhere to steer: the boat follows the finger's sideways movement, so one thumb plays it.
  Mouse drag does the same; arrow keys or A and D steer; a gamepad's left stick or d-pad steers.
  P or Esc pauses, R restarts, M mutes.
- **Loop:** the current carries the boat downstream and quickens towards the sea; the player only steers sideways.
- **The flame:** it starts at 70% and dims every tick.
  A shrine lends light while the boat is within 4.5 m of it, the more the closer it passes.
  A lantern gate's two posts give a burst of light to a boat that threads them.
  A rock or a post costs 15% of full light and slows the boat for two thirds of a second; scraping a bank and riding a gust dim it too.
- **Risk and reward:** every rock row leaves an open channel, so a careful player never hits anything, but the channel alone does not carry the flame to the sea.
  Shrines sit on the banks, away from the channel, so each one is a choice between light and safety.
  The balance tool's pilots show it: keeping to the channel goes out after 90 to 230 m of Canal Town's 300, and swinging past every shrine reaches the sea in about 82 s.
- **Goal and end:** reach the sea with the flame alight, gathering as much light as you can.
  The run ends when the flame goes out or the boat reaches the sea; the end card shows light gathered and distance.
- **Score:** light gathered (in whole units), times 1,000, plus metres travelled.
- **Daily run:** one stage and seed per UTC day, the same for everyone, with a Share on X result and the day's best kept in the browser.

## Stages

A stage is data: length, speed, river width, rock density and size, the open channel's width, shrine, gate and gust chances, and the flame's start and drain, each ramping from the stage's start to the sea (`src/sim/stage.ts`).
The rules (`src/sim/`) are the same for every stage, so a new stage is a new file in `src/stages/` plus its art.
A stage that has had a daily run is frozen, since changing it would change its river and break the replay of every recorded run; a new layout gets a new version.

Stage 1 is **Canal Town**: 300 m from the upper locks to the sea, about 80 s.
Later stages could add a bamboo forest, a harbour mouth with waves, or a storm; each brings its own look and new values, and new kinds of obstacle bump the rules' version.

## Built for replay

The score must be checkable by a server before anything of value rides on it, so the rules follow Dockstack's:

- Distances are micrometres and time is ticks of 1/60 s; every operation is integer arithmetic below 2^53, checked by the helpers in `src/sim/int.ts`.
- No `Math.sin`, no floating-point state, no clock and no `Math.random` reach the rules; a test fails if one appears.
- The river is generated in 20 m chunks, each from the seed and its own index alone, so the renderer streams any chunk without building the others.
- A run is its rules version, stage, seed and steering, recorded as the ticks at which the target changed, at 1 cm resolution; about 3 bytes of text per change.
- `replay(stage, record)` returns the score and a state hash, and refuses a record for other rules, another stage version, or steering that could not have happened.
- The renderer only reads the state: bends in the river, bobbing, reflections and particles are drawn and never fed back.

See [docs/architecture.md](docs/architecture.md) for how this grows into a server check and a Solana program.
