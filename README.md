# BOLL: Paddle Juggle

BOLL is a retro CRT arcade game about one expressive mechanic: keep a square
ball alive with a paddle that follows your motion in both axes. Flick upward
for power, move laterally to steer, or ease under the ball to cushion it.

Built with Vite, strict TypeScript, Three.js, Web Audio, and a fixed-step
physics core. Play it at <https://wearemeatbags.github.io/boll/>.

## Ways to play

- **World Tour**: 30 objective stages across five connected worlds, with
  unlockable routes, optional side signals, tower finales, score medals, and a
  CRT overworld map.
- **Endless Waves**: clear growing hit quotas while the pace rises and the
  paddle shrinks. One miss ends the run.
- **Score Attack**: score for 60 seconds. A miss costs five seconds, then the
  ball automatically returns after a short delay.
- **Chaos**: every 12 paddle hits adds a ball, up to four. Extra balls raise
  the pace and the points earned per hit. The run continues until every ball
  is lost.
- **Practice Lab**: the original single-ball rules with live physics tuning and
  Classic, Moon, Flubber, and Brick presets. Score is the number of paddle hits.

## World Tour

The tour contains six stages in each world:

| World | Focus |
| --- | --- |
| Boot Sector | Contact, center control, edge steering, and cushioning |
| Relay Fields | Gates, bank shots, combo building, and power flicks |
| Moonfall | Low-gravity arcs, placement, carries, and long survival |
| Overclock | Faster pace, narrow paddles, dense gates, and multiball |
| Null Crown | High-pressure mastery across every discipline |

Clear a connected stage to open its outgoing route. Each world includes an
optional side signal that is not required to reach the tower. Clearing the
tower unlocks the next world. The main menu recommends the next available
signal, while the world map remains available for replaying cleared stages,
taking optional routes, and improving medals.

Stages can ask for paddle hits, sweet hits, edge hits, power hits of at least
300 world units per second, wall contacts, gates, bank gates, carry time, combo,
survival time, or score. Each stage has a fixed arcade loadout and may modify:

- pace;
- paddle width;
- gravity;
- gate size and placement pressure;
- the multiball cap.

These rules and the Bronze, Silver, and Gold score thresholds appear in the map
detail panel. Clearing always earns at least Bronze. Replays retain the best
score and highest medal.

## Run it

Vite 8 requires Node.js `^20.19.0` or `>=22.12.0`.

```bash
npm install
npm run dev
```

Open the printed URL, usually `http://localhost:5173`.

```bash
npm run build     # type-checks and writes the static build to dist/
npm run preview   # serves the production build locally
```

## Share it

- **Players**: run `npm run build`, then publish `dist/` to any static host,
  including itch.io, Cloudflare Pages, Netlify, or GitHub Pages. Music and all
  other runtime assets are included.
- **Developers**: share the repository without `node_modules/` or `dist/`.
  Run `npm install` and `npm run dev` after unpacking it.

## Playable version history

Every commit that reaches `main` is treated as a release. The Pages workflow
uses the shared Meatbags versioning workflow to:

- create a sequential `v0.0.N` Git tag for every first-parent commit;
- keep the newest build at <https://wearemeatbags.github.io/boll/>;
- preserve immutable builds at
  `https://wearemeatbags.github.io/boll/versions/v0.0.N/`;
- publish commit dates, messages, and short SHAs in `versions/index.json`.

The first versioned deployment backfills every first-parent commit already on
`main`. It fails loudly if any historical commit no longer builds with the
configured runtime, so the archive never claims that a broken import is
playable. The Meatbags hub reads the manifest and adds a **Versions** menu to
the BOLL card, while **Play** always opens the current build. Archived site
files live on the generated `pages-history` branch, separate from source.
The live game and each archive use separate save namespaces, so playing or
resetting an old release cannot change current career progress.

## Controls

Gameplay starts after an automatic three-count serve.

| Input | Action |
| --- | --- |
| Mouse, trackpad, pen, or touch | Move the paddle in both axes |
| Arrow keys or WASD | Move in both axes and temporarily take ownership from the pointer |
| P or Escape | Pause or resume; Escape also closes options and secondary screens |
| R | Restart the current stage or arcade run |
| Space | Retry from a result screen |
| MENU button | Pause and open options |

World map controls:

| Input | Action |
| --- | --- |
| Click or tap a node | Select it and show its objective, rules, best, and medal |
| Arrow keys on a node | Move spatially between unlocked nodes |
| Enter on a node | Start that stage |
| Click or tap a world tab | Change to an unlocked world |
| Left/Right Arrow, Home, or End on a world tab | Move between unlocked worlds |
| Escape | Return to the main menu |

Pointer and keyboard paddle control can be disabled independently in Options.

## Mechanics

### The bounce

The ball's return blends its incoming velocity, the paddle's velocity at
contact, and the horizontal contact point. An upward flick transfers energy.
Off-center contact creates a sharper horizontal angle.

Gentle contact can enter a **carry** instead of bouncing. Match a slow falling
ball with a calm paddle and it settles on top until stronger relative motion
releases it.

Physics runs at a fixed 120 Hz and rendering interpolates between simulation
steps. The playfield is 160 by 100 world units with positive Y pointing up.

### Arcade scoring

World Tour, Endless Waves, Score Attack, and Chaos use the arcade bounce and
scoring layer:

- The center 30 percent of the paddle is the marked **sweet spot**. Sweet hits
  score 25 base points, versus 10 for normal hits, and produce more controlled
  returns.
- A normal paddle hit adds one combo point; a sweet hit adds two. The multiplier
  is `min(10, 1 + floor(combo / 5))`.
- Two hollow **target gates** appear in Waves and Score modes. A gate scores 50
  base points in Waves or 75 in Score Attack, multiplied by the combo, then
  cools down and relocates.
- A **bank gate** is a gate scored within 1.4 seconds of a wall contact.
- Missing resets the combo. Chaos removes all balls that crossed the miss line
  during that simulation step and ends only if none remain.

Campaign Waves stages use their fixed stage pace and paddle width instead of
the endless wave ramp. Timed campaign score stages run for their full clock and
clear if the target has been reached when time expires.

## Options

Options are grouped into five tabs:

- **Display**: game FX, screen shake, CRT filter, and fullscreen.
- **Controls**: keyboard and pointer enable switches plus a control reference.
- **Audio**: independent music and sound-effect switches and 0 to 100 percent
  volume controls.
- **Tuning**: Practice Lab presets and sliders for gravity, restitution, ball
  size, paddle influence, drag, paddle width, and keyboard paddle speed.
- **Data**: a confirmed Reset Career action.

World Tour and all three arcade channels use fixed default tuning for fair,
repeatable runs and meaningful score comparisons. Saved tuning applies only to
Practice Lab; the arcade-only speed controls remain fixed. Reset Settings
restores controls, display, audio, and Practice tuning. Reset Career clears
scores, medals, and campaign position while preserving player options.

The game also honors `prefers-reduced-motion`: particles and camera shake are
disabled, and animated CRT noise is stabilized.

## Save data

Progress is saved automatically in browser `localStorage`:

- best scores for Practice, Endless Waves, Score Attack, and Chaos;
- every stage's best score and highest medal;
- the last played campaign node used to focus the map;
- control, display, audio, and Practice tuning preferences.

Save data is local to the current browser and origin. It is not currently
synced to an account or cloud service. The live version 4 key imports the old
version 1 key once, then remains separate from it and from every archived
version. The migration preserves Practice records and player preferences, but
resets the old six-stage ladder and tunable arcade scores so the new
fixed-loadout records remain coherent.

## Project structure

```text
src/
  main.ts              bootstrap and requestAnimationFrame loop
  Game.ts              state machine, fixed-step orchestration, rules, and scoring
  Physics.ts           plain-data physics core with no Three.js or DOM dependency
  config.ts            world constants, mode tuning, presets, and scoring values
  types.ts             shared game, stage, settings, and event types
  stages.ts            five worlds, 30 stages, routes, objectives, and medals
  ObjectiveTracker.ts  campaign objective counters and completion
  ComboSystem.ts       combo and multiplier state
  InputController.ts   pointer and keyboard arbitration
  Storage.ts           save validation, migration, persistence, and career reset
  UI.ts                HUD, screen router, results, help, and categorized options
  ui/CampaignMap.ts     accessible CRT world map, routes, nodes, and navigation
  render/Renderer.ts   responsive cabinet layout, Three.js scene, and CRT pass
  render/CrtShader.ts  curved-glass shader, scanlines, vignette, grain, and flicker
  views/               ball, paddle, and target-gate scene objects
  fx/Effects.ts        particles, squash, score popups, celebration, and shake
  audio/               shared audio bus, looping music, and synthesized SFX
public/audio/boll.m4a  bundled looping soundtrack
legacy/                original single-file prototype, preserved unchanged
```

## Legacy and future direction

[legacy/paddle_juggle_game.html](legacy/paddle_juggle_game.html) is the original
single-file prototype. Open it directly to compare its feel with Practice Lab.

BOLL is currently single-player. Multiplayer is a possible future direction,
but there is no local or online multiplayer mode in this version.
