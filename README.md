# BOLL — Paddle Juggle

A retro CRT arcade juggling game: one paddle, one square ball, keep it alive.
Built with Vite, TypeScript (strict), and three.js. Black screen, white shapes,
square-wave beeps, looping soundtrack, and a proper curved-glass CRT filter.

Play it at <https://wearemeatbags.github.io/boll/>.

Two ways to play, switchable in the menu:

- **OG** (default): a faithful port of the original single-file prototype.
  The paddle follows your pointer in **both** directions. Flick up for power,
  ease down to cushion. Score = paddle hits.
- **ARCADE**: same core mechanic plus a combo system, a marked sweet spot,
  two floating target gates, points with multipliers, and a difficulty curve
  that slowly turns the screws.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`).

Production build and local preview:

```bash
npm run build     # outputs dist/ (relative paths; runs on any static host)
npm run preview
```

## Share it

- **Players**: `npm run build`, then drop the `dist/` folder on any static host
  (Netlify Drop, itch.io as an HTML game, Cloudflare Pages, `npx serve dist`).
  Everything is self-contained, including the music.
- **Developers**: share the repo or a zip of the project without `node_modules/`
  and `dist/`. They run `npm install` + `npm run dev`.

## Controls

| Input | Action |
| --- | --- |
| Mouse / trackpad / touch | Paddle follows the pointer (both axes) |
| ← / → or A / D | Move paddle horizontally (takes over from the pointer) |
| Space | Serve / restart |
| P or Esc | Pause / resume (Esc also closes the menu) |
| R | Restart the run |
| Click / tap | Serve, restart, or resume |

Keyboard and mouse can each be toggled off in the menu.

## Mechanics

**The bounce is the game.** The ball's exit velocity blends its incoming
velocity, your paddle's velocity at contact (flick!), and where on the paddle
it lands. Landing off-center steers the ball harder toward that side.

**Carry / cushion**: meet a slow ball with a gentle paddle and it will settle
and ride the paddle instead of bouncing; ease under a falling ball to catch it.

**ARCADE mode adds:**

- **Sweet spot**: the center 30% of the paddle (marked by ticks). Sweet hits
  score 25 base (vs 10), count double toward the combo, and give a controlled,
  mostly-your-motion bounce. Edge hits launch sharper, riskier angles.
- **Combo**: every paddle hit extends it (+2 sweet / +1 normal). Multiplier is
  `min(10, 1 + floor(combo / 5))`. Missing the ball resets it.
- **Target gates**: two floating hollow rectangles. Put the ball through one
  for 50 x multiplier. A scored gate flashes, cools down for 0.8 s, and moves.
- **Difficulty**: a smooth curve driven by survival time and paddle hits.
  The pace floor rises up to +40%, the paddle shrinks up to −32%, and the
  gates shrink and drift toward the walls. It never spikes; it creeps.

Best scores are stored per mode in `localStorage`.

## The menu

MENU (top-right) pauses the game while open and resumes when closed (if the
menu is what paused it). It contains:

- **Mode**: OG / ARCADE
- **Live physics sliders**: gravity, bounce, ball size, paddle power
  (momentum transfer), air drag, paddle width, paddle speed (keyboard), and —
  in ARCADE — max ball speed and minimum bounce velocity
- **Presets**: CLASSIC, MOON, FLUBBER, BRICK
- **Toggles**: KEYS, MOUSE, FX (particles/shake/squash/popups), CRT (the whole
  filter, including rounded corners and vignette), SFX, MUSIC
- RESET DEFAULTS / RESTART / DONE

## Tuning guide

All defaults live in [src/config.ts](src/config.ts). The world is 160x100
units, +y up; the legacy prototype's pixel values map at 0.2 units per pixel.

| Param | Default | Feel |
| --- | --- | --- |
| GRAVITY | 360 | Higher = heavier, faster rhythm |
| BOUNCE | 0.92 | Restitution; >1 gains energy (FLUBBER) |
| BALL SIZE | 4.4 | Bigger = easier contact, blockier look |
| PADDLE PWR | 1.0 | How much paddle motion transfers to the ball |
| AIR DRAG | 0 | Slows everything; MOON-ish floatiness |
| PADDLE W | 22 | Wider = easier, weaker steering leverage |
| PADDLE SPD | 150 | Keyboard speed only; pointer pursuit is fixed |
| MAX BALL SPD | 400 | ARCADE ceiling on total speed |
| MIN BOUNCE VY | 150 | ARCADE pace floor; difficulty scales it up |

Deeper knobs in code: pursuit stiffness (`PURSUIT_RATE`), carry thresholds
(`CARRY_REL`, `CARRY_PADDLE_VY`), sweet-spot width (`SWEET_ZONE`), difficulty
weights (`DIFF_*`), gate geometry (`GATE_*`), CRT shader strengths (top of
[src/render/CrtShader.ts](src/render/CrtShader.ts)), and the SFX cue table in
[src/audio/Sound.ts](src/audio/Sound.ts).

## Project structure

```
src/
  main.ts              bootstrap + frame loop
  config.ts            every constant, preset, slider, and mode flag
  types.ts             plain-data shared types
  Physics.ts           pure fixed-step physics core (no three.js, no DOM)
  Game.ts              orchestrator: state machine, loop, event routing
  InputController.ts   pointer/keyboard arbitration
  UI.ts                HUD, overlays, menu (DOM)
  Storage.ts           localStorage save data
  ComboSystem.ts       combo + multiplier
  DifficultySystem.ts  smooth difficulty curve
  render/Renderer.ts   letterboxed stage, render target, CRT pass
  render/CrtShader.ts  the CRT fragment shader (tuning constants up top)
  views/               Ball, Paddle, TargetGate (three.js meshes)
  fx/Effects.ts        particles, camera shake, squash, score popups
  audio/               shared AudioContext, gapless music loop, SFX cues
public/audio/boll.m4a  looping soundtrack (AAC, gapless)
legacy/                the original single-file prototype, unmodified
```

## Legacy

[legacy/paddle_juggle_game.html](legacy/paddle_juggle_game.html) is the
original prototype this game was ported from, kept byte-for-byte. Open it
directly in a browser to compare the feel; OG mode should feel identical.
