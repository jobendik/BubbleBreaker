# Bubble Breaker Adventure

A TypeScript + Vite + HTML5 Canvas arcade game in the Pang / Buster Bros tradition. Pop, split, dodge, survive. Procedural art, procedural audio, no runtime dependencies, CrazyGames-ready.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check + production build (outputs to `dist/`)
- `npm run preview` — serve the production build locally

## Engine decision

Custom Canvas + TypeScript, no framework. The core is a compact single-screen game loop with hand-tuned collision, immediate-mode menus, and Web Audio synthesis. Phaser would add weight and a rewrite cost before the project has the sprite, animation, tiled-map, asset-loading, or scene-management complexity to justify it.

Reconsider later only if development moves toward asset-heavy worlds, reusable scenes, animation pipelines, camera work, or editor-driven level production.

## What's in the build

### Modes
- **Tour** — 18 hand-crafted levels across 6 worlds (beach → desert → arctic → city → volcano → airship) culminating in the Commander RIFT boss fight.
- **Score Attack** — 3 lives, no continues, cycles Tour levels. Beat your best.
- **Panic Mode** — endless waves with the **Rainbow Gauge** progress bar, periodic **Star Bubbles** (Clock-face freeze or Star-face screen-clear), and flashing time-stop micro-balls.
- **Boss Rush** — every boss in sequence; no retries between fights. Best run + best score persisted.
- **Daily Challenge** — one shared seeded level per UTC day with a rolled modifier (`double_score`, `no_pickups`, `tiny_hurtbox`, `big_bubbles`, `sudden_death`). Streak counter, copy-to-clipboard result, and one-click X (Twitter) share intent.

### Content
- **10 ball types** — normal, electric, explosive, smoke, lava, sludge, armored, bonus, hexagon (Super Pang polygonal physics), star bubble (Panic-mode special).
- **11 weapons** — harpoon, double, triple (Pang! 3), power wire / grapple (anchors to ceiling), diagonal (Sheila-style 45°), machine gun, laser, flamethrower, shotgun, shuriken, bomb.
- **17 pickup types** — shield, extra life, time, slow-time, freeze, smoke-clear, magnet, combo booster, score gem, dynamite (shrinks every ball to size 0), plus all weapon capsules.
- **Bestiary** — crab, dragon (friendly helper; kicking it triggers a localized helpful explosion), bird, red bird (guaranteed power-up drop), ball-fish — birds/ball-fish jam the player's weapons on contact for 3s.
- **Hazards** — lava, slime, electric beams + barriers, flame vents, falling rocks with floor telegraph rings.
- **Co-op** — optional local 2-player (`I/K/U` to join from desktop, `J/L` to move). Pang-Adventures-style **10-second revive window**: walk over a downed teammate to bring them back.

### Feel & polish
- Forgiving sub-visual hurtbox, hit-pause, screen shake, white-flash, fixed-timestep update loop.
- Squash-and-stretch on floor bounce; altitude-modulated floor shadows; electric pre-discharge halo; falling-rock landing telegraph.
- Combo system with decay; milestone fanfares at 5/10/15/20 (`NICE!` → `WILD!` → `INSANE!` → `GODLIKE!`).
- Trick chips — `CLUTCH!`, `CLOSE CALL`, `AIR POP`, `BANK SHOT` — for skill expression.
- Multi-pop chains consolidated into `DOUBLE POP` / `TRIPLE POP` / `MEGA POP` / `ULTRA POP` labels.
- Per-size pop sound pitch, type-specific audio flourishes, mute toggle (`M`), reduced-motion accessibility toggle in the pause menu.

### Persistence & retention
- Versioned save (`bba_save_v2`) with v1 migration. Cloud-mirror via the CrazyGames Data Module, merged on the higher-progress side per field.
- Per-level bronze/silver/gold medals (`targetScore × {1.0, 1.25, 1.5}`) rendered on the level-select grid.
- Daily streak counter on the main menu, welcome-back banner across days, idle-rotation hints on the title screen.
- Titles system (Bubble Sage, Daily Devotee, Boss Slayer, Detonator, Marksman, world masters, etc.) computed on demand from save state.

### Platform integration
- **CrazyGames SDK v3** wired through `src/systems/platform.ts`: `gameplayStart`/`Stop` on state transitions, `happytime` on personal-best, midgame ads only between Tour levels (skips first cleared level of session, 60s minimum spacing), rewarded "watch ad to continue" on Score Attack / Panic / Boss Rush game-over. Ad-lifecycle hook ducks audio + pauses gameplay while ads are on screen.
- Touch UI: bottom-left ◀ ▶ buttons, bottom-right FIRE, top-right pause. Multi-touch (hold direction + fire simultaneously). Portrait orientation prompt via CSS media query.
- Graceful degradation: every SDK call is a safe no-op when the script is absent (local dev, adblock, offline).

### Bundle
- ~140 KB raw, ~39 KB gzipped. Loads near-instantly.

## Architecture

```
src/
├── main.ts                 # boot, SDK init, error handlers, first-visit auto-start
├── game.ts                 # Game orchestrator: entity arrays, lifecycle, main loop
├── constants.ts            # W/H/GRAVITY, ball/weapon/pickup/mode types, themes
├── data/levels.ts          # 18 + 1 hand-crafted level definitions (data-driven)
├── entities/               # Ball, Boss, Crab, Creature, Destructible, Hazard,
│                           # Particle, Pickup, Platform, Player, Projectile
├── rendering/canvas.ts     # background, ambience layer, shared draw helpers
├── state/                  # per-state update()/render() — one file per State enum
│                           # mainMenu, modeSelect, levelSelect, playing, pause,
│                           # levelClear, gameOver, daily, infoScreens
└── systems/                # analytics, audio, collisions, combat, daily, hud,
                            # input, platform (CG SDK), storage, titles
```

## Local dev

```bash
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview
```

The CrazyGames SDK is loaded from `index.html` via the official CDN. Local dev runs without it (every SDK call no-ops); the in-game console will simply show `sdk.init.done { hasSDK: false }`.

## Status

Genuinely launch-ready for the CrazyGames Basic Launch pipeline. Remaining work is operational rather than in-engine: thumbnail/capsule art, real-device QA at iframe sizes 907×510 → 1366×768, listing copy submission, and review-feedback iteration. See [LAUNCH.md](LAUNCH.md) for the full release-candidate checklist.
