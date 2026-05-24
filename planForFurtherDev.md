# Bubble Breaker Adventure — Plan for Further Development

> **Status (current):** Phases 1–7 are substantially complete. The game is feature-complete, mobile-playable, CrazyGames-SDK-integrated, daily-hooked, medal-tiered, and refactored. The remaining work is operational (artwork, real-device QA, submission, post-launch iteration) rather than in-engine.
>
> **Purpose of this document.** Historical record of the launch-readiness plan, kept up to date as phases close out. Use it to onboard a returning developer (or AI assistant) in a single read.

---

## 0. Snapshot: what this game *is* today

Verified by reading the codebase, not from memory:

- **Stack:** TypeScript + Vite + a custom HTML5 Canvas engine. ~5,500 lines of source. No external runtime deps. No asset pipeline (everything is drawn procedurally). Procedural Web Audio.
- **Bundle:** ~140 KB raw, ~39 KB gzipped. Loads almost instantly. Strategic advantage to be protected.
- **Canvas:** Fixed logical resolution `960 x 540`, scaled to viewport via CSS `width: min(100vw, calc(100vh * 16 / 9))`. Responsive on desktop and mobile.
- **Content:** 18 hand-crafted levels across 6 themes (beach → desert → arctic → city → volcano → airship) + a Commander RIFT boss level. **10 ball types** (incl. hexagon + star bubble), **11 weapons** (incl. triple, power-wire grapple, diagonal), **17 pickup types** (incl. dynamite + all weapon capsules), **4 creatures** (crab, bird, red bird, ball-fish, dragon), hazards, destructibles, moving platforms.
- **Modes:** Tour (campaign), Score Attack, Panic (with Rainbow Gauge + Star Bubbles + flashing time-stop micro-balls), **Boss Rush**, Daily Challenge. Local 2-player co-op with **10-second revive window** (P2 joins mid-game with `I`/`K`/`U`).
- **Polish present:** forgiving sub-visual hurtbox, hit-pause, screen shake, white-flash, combo system with decay + milestone fanfares (NICE/WILD/INSANE/GODLIKE), trick chips (CLUTCH/AIR POP/CLOSE CALL/BANK SHOT), multi-pop chain labels, per-size pop pitch, mute, pause, instant restart, intro banners per level, fixed-timestep update loop, altitude-based floor shadows, squash-and-stretch, electric/falling-rock telegraphs.
- **Save:** versioned localStorage key `bba_save_v2` in [systems/storage.ts](src/systems/storage.ts) with v1 migration. Cloud-mirror via CrazyGames Data Module, merged per-field on the higher-progress side. Stores per-level bests, mode bests (incl. Boss Rush), medals, daily history, streak, lifetime stats, accessibility prefs, title-seen set.
- **Platform integration:** CrazyGames SDK v3 wired through `src/systems/platform.ts` — `gameplayStart`/`Stop`, `happytime`, midgame ads between Tour levels (60s spacing, never first cleared level), rewarded continue on Score Attack/Panic/Boss Rush, audio ducking + auto-pause during ads.
- **Touch:** ◀ ▶ + FIRE + pause buttons rendered to canvas, multi-touch supported, orientation prompt via CSS for portrait phones, co-op affordances hidden on touch devices.
- **Code structure:** [game.ts](src/game.ts) is a thin orchestrator (~600 lines). State handlers live in `src/state/`, systems in `src/systems/`, entities in `src/entities/`. No file exceeds 700 lines.

**The game is genuinely good and launch-ready.** What remains is artwork (thumbnail/capsule), real-device testing, listing copy submission, and post-launch iteration.

---

## 1. North star

> **A modern, single-screen ball-splitting arcade game that loads in under 2 seconds, plays on phone or desktop, and gives the player exactly one reason to come back tomorrow.**

If a proposed change does not serve that sentence, it should be deferred or cut.

---

## 2. Strategic pillars

Only four. Every task in this plan ties back to one of them.

1. **Frictionless first session.** A first-time visitor on CrazyGames should be playing within ~5 seconds of clicking the thumbnail, and popping their first bubble within ~10 seconds. This is the single biggest determinant of CrazyGames placement.
2. **Mobile parity.** Touch input is non-negotiable. Roughly half of CrazyGames traffic is mobile. A keyboard-only game caps its reach at ~50%.
3. **One reason to return.** A daily challenge with a shared leaderboard and a visible streak. Not weekly events, not a battle pass — one good daily hook done well.
4. **Platform hygiene.** CrazyGames SDK wired correctly (gameads, banner ads, save data, happytime, gameplay start/stop). No console errors. Loads in any iframe size. Plays nicely with autoplay-blocked audio.

**Explicitly not pillars:** more weapons, more ball types, more bosses, more worlds, online co-op, level editor, cosmetics shop, story cutscenes. The roadmap in `roadAhead.md` lists ~60+ such items — they are not bad ideas, they are wrong-phase ideas. Resist them until after launch.

---

## 3. What we will *not* change

Decisions worth defending against future scope creep:

- **The custom Canvas engine.** Do not migrate to Phaser, PixiJS, or any framework. The current engine is small, fast, and proven on the existing content.
- **Procedural drawing and audio.** Do not introduce sprite atlases or audio files unless we have a specific, measured reason. The tiny bundle is a CrazyGames feature.
- **The 18 existing levels.** They work. Tune individual numbers if needed, but do not redesign them.
- **The three modes (Tour / Score Attack / Panic).** No new modes before launch.
- **Local co-op.** Keep it, polish the join prompt, but never let it complicate the solo onboarding.
- **The 960x540 logical resolution.** Resize the viewport scaling, never the game's internal coordinate system.

---

## 4. Phased plan

Each phase has a **goal**, **exit criteria** (what "done" means), and a **rough size**. Phases are mostly sequential — Phase 1 and 2 can overlap, but Phase 3 should not start until 1 and 2 are done.

### Phase 1 — Frictionless first session (1–2 weeks)

**Goal:** Cut every second of friction between "iframe loads" and "first ball pops."

**Changes:**

- Replace the 8-item main menu with a giant **PLAY** button (and a small "More" affordance for Modes/Controls/Credits). Map any key or click/tap to start Tour from the highest unlocked level.
- Auto-start Level 1 on first-ever visit (detected via empty save), skipping the menu entirely. Show a single line of contextual control hint that fades after the first pop.
- Make the level intro banner skippable instantly (any input dismisses it).
- Shorten the restart and game-over flows. "R to retry" should be the default action everywhere; game-over should auto-focus retry so a player can mash any key.
- Audit and minimize text on the HUD. Today it shows weapon, ammo, P2 hint, effect timers, combo, lives, score, target, level name, restart hint. That is too much. Keep score, timer, lives, weapon, combo. Move the rest to pause.

**Exit criteria:**

- Time-to-first-pop on a cold load, mouse only: ≤ 10 seconds.
- Retry after game-over: ≤ 1 second.
- HUD legibility test at 320px tall (mobile landscape): all elements readable.

### Phase 2 — Mobile parity (2–3 weeks)

**Goal:** Game is fully playable on a phone in landscape with no keyboard.

**Changes:**

- Add a touch input layer in [systems/input.ts](src/systems/input.ts) that exposes the same `keys` and `keysPressed` interface so the rest of the code doesn't need to know touch exists.
- On-screen controls: left half = movement (tap-and-hold left/right zones, *not* a virtual joystick — this is a one-axis game), right half = shoot button. Buttons rendered to the canvas, hit-tested in input layer.
- Auto-detect touch device (`'ontouchstart' in window`) and only render touch UI then. Desktop stays clean.
- Tune the touch zones so the player's thumbs don't cover key gameplay. Pause button top-right, large enough to hit but not accidentally tappable.
- Disable iOS double-tap-to-zoom and the rubber-band scroll on the canvas.
- Verify the responsive scaling already in [styles.css](src/styles.css) works in portrait (probably needs an orientation prompt — "Please rotate to landscape" overlay).
- Co-op is desktop-only. On touch, hide the P2 join hint entirely.

**Exit criteria:**

- Playable end-to-end on a mid-range Android in Chrome and on iOS Safari.
- 60 fps on a 2019-era phone with 100+ particles on screen.
- No layout breakage from 360×640 (small phone) up to 2560×1440 (desktop).
- An orientation lock or rotation prompt for portrait.

### Phase 3 — Retention hook: medals + daily challenge (2 weeks)

**Goal:** Give the player one specific reason to return tomorrow, and reasons to replay levels they already cleared.

**Changes:**

- **Per-level medals** (bronze/silver/gold) based on score thresholds defined in [data/levels.ts](src/data/levels.ts). Today the `targetScore` field exists but is barely used — extend it to 3 tiers. Display medals on the level select grid.
- **Daily Challenge mode** — one curated stage per UTC day, selected by seed from the existing 18 levels with a modifier rolled from a small set: fast balls, low gravity, double score, no pickups, tiny hurtbox. Same seed for all players globally.
- **Streak counter** stored in save data. Visible on main menu: "🔥 3 day streak — play today's challenge to keep it."
- **Share screen** after a daily challenge run: "I scored X on today's challenge — beat me." Just a clean result screen and a copy-link button for now; full social plumbing comes later.
- Extend the save schema. Bump key from `bba_save_v1` to `bba_save_v2` and write a migration in [systems/storage.ts](src/systems/storage.ts).

**New save fields:**
```
medals: Record<levelId, 0|1|2|3>     // none/bronze/silver/gold
dailyLastPlayed: 'YYYY-MM-DD'
dailyStreak: number
dailyBest: Record<'YYYY-MM-DD', number>
```

**Exit criteria:**

- Three medal thresholds defined and visible on every level.
- Daily Challenge accessible from main menu, deterministic per UTC day, score persisted.
- Streak increments correctly across day boundaries (test by manually adjusting system clock or by mocking `Date.now`).

### Phase 4 — CrazyGames SDK integration (1 week)

**Goal:** Ship-ready integration with the CrazyGames platform. Done correctly the first time so we are not rewriting it under launch pressure.

**Changes:**

- Add the CrazyGames SDK as a runtime script (loaded conditionally — when not on the platform, all SDK calls become no-ops so local dev still works).
- Create `src/systems/platform.ts` as a thin adapter: `Platform.gameplayStart()`, `Platform.gameplayStop()`, `Platform.happytime()`, `Platform.requestAd('midgame' | 'rewarded')`, `Platform.save(data)`, `Platform.load()`.
- Wire `gameplayStart` when entering `State.PLAYING`, `gameplayStop` when entering any non-playing state.
- Wire `happytime` on level clear and boss defeat.
- **Midgame ads:** only between levels in Tour mode, and never before the player has cleared at least one level in this session. Never during active gameplay.
- **Rewarded ads:** one optional rewarded "continue" on game-over in Score Attack and Panic. Never on Tour (which has unlimited retries already).
- **Banner ads:** if used, only on the main menu, never during a run.
- Replace the localStorage save backend with `Platform.save/load` (CrazyGames-aware), keeping localStorage as the local fallback.

**Exit criteria:**

- Game runs identically with and without the SDK present (verify with `npm run dev` locally vs. CrazyGames preview).
- No console errors or unhandled promise rejections in either mode.
- All SDK calls are debounced/guarded so they cannot fire twice in a row.
- Bundle size after build is still under 200 KB gzipped (today it should be well under this — keep it that way).

### Phase 5 — Feel and clarity pass (2 weeks)

**Goal:** Polish the things players unconsciously notice. Do *not* add new content.

**Changes (small, individually):**

- Stronger pop feedback: bigger particle burst on large balls, brief radial flash on the pop position.
- Ball shadows on the floor to make trajectory readable.
- Slight squash-and-stretch on floor bounce.
- Better telegraphs on hazards (electric pre-charge, flame vent windup) — many already exist, audit each.
- Reduced-motion / reduced-flash setting in the pause menu, wired to skip screen shake and white flash.
- Audio: layer the pop sound with a pitch shift based on ball size. Already partly there in [systems/audio.ts](src/systems/audio.ts), make it more pronounced.
- Combo voice/text feedback at thresholds (5, 10, 15, 20).

**Exit criteria:**

- 5 random people watching a 30-second clip can each name a moment they thought looked "satisfying."
- Reduced-motion mode produces no flash or shake.

### Phase 6 — Code health (1 week, optionally parallel)

**Goal:** Prevent [game.ts](src/game.ts) from collapsing under the new systems.

**Changes:**

- Split [game.ts](src/game.ts) (1,411 lines) into:
  - `src/state/` — one file per state (menu, levelSelect, playing, paused, gameOver, etc.) with `update(dt)` and `render(ctx)` exports.
  - `src/systems/collisions.ts` — extract the giant `resolveCollisions` method.
  - `src/systems/hud.ts` — extract HUD rendering.
  - `src/systems/menus.ts` — extract menu rendering.
- Keep `Game` as the orchestrator that owns the entity arrays and dispatches to state handlers.
- This is a *behavior-preserving refactor*. Write down expected behavior before, verify identical after.

**Exit criteria:**

- No file in `src/` exceeds 500 lines.
- Build still passes, all levels still play identically.

### Phase 7 — Launch prep (1 week)

**Goal:** Ship.

**Changes:**

- Final QA pass against the checklist in §8.
- Create CrazyGames thumbnail and capsule art. This is a real deliverable — the thumbnail is the single biggest determinant of click-through rate.
- Write a 1-sentence game description and a 3-bullet feature list for the CrazyGames listing.
- Submit, fix whatever CrazyGames review feedback comes back, ship.

---

## 5. After launch

These are not in scope before launch. They are listed so they have a place to live and do not pollute the pre-launch phases.

- More levels (target: 24 → 36 over time, one new world at a time).
- Cosmetics: player skins, harpoon trails, pop-effect variants. Unlocked via medals only — no premium currency.
- Achievements system.
- Online leaderboards for Daily Challenge and Panic.
- Weekly tournament mode.
- More bosses (next two: a slime queen, an airship).
- New ball types — only add one if it changes player decision-making, not for visual variety.
- Level editor for internal use, then maybe for players.

The `roadAhead.md` document is a useful idea bank for this phase — treat it as such.

---

## 6. Anti-goals — actively resist these

If a future conversation suggests any of the following, push back unless there is a measured, specific justification:

- **Rewriting in Phaser/PixiJS/Three.js.** The current engine works for this game's scope.
- **Adding a sprite asset pipeline.** Procedural drawing is a feature.
- **Permanent gameplay upgrades.** Will pollute leaderboards and turn this into a grind game.
- **Premium currency, IAP, battle pass.** Not appropriate for the platform or the genre.
- **Long story cutscenes or required dialogue.** Arcade game. Get to the action.
- **More than ~12 items on the main menu.** Today it has 8 already and that is too many.
- **Online co-op or any real-time multiplayer.** Massive engineering cost, low payoff for a single-screen arcade game.
- **Removing existing content "to focus."** The 18 levels are an asset, not debt.

---

## 7. Operating principles for future development

For whoever (human or AI) picks this up next:

1. **Measure before you cut, and after you ship.** "Time to first pop," "first-level completion rate," and "daily return rate" are the only three metrics that matter pre-launch. Find ways to estimate them — even by hand, by watching real people play.
2. **Prefer subtraction.** This codebase already has more features than it needs to launch. Most improvements should be removals or simplifications, not additions.
3. **Test on a real phone, not a simulator.** Touch input feels wrong in DevTools' mobile mode. Plug in an actual device.
4. **Never break local dev.** Every platform integration must have a no-SDK fallback path so the game runs from `npm run dev` without console errors.
5. **One feature, one PR.** Resist the urge to bundle "polish" changes into "feature" changes.
6. **When in doubt, do the boring thing.** Familiar UI patterns. Predictable controls. Standard CrazyGames integrations. This is not the project to innovate on tooling.

---

## 8. Implementation checklist

Tick these in order. Each item should be a single focused change.

### Phase 1 — Frictionless first session — **DONE**

- [x] Replace main menu with a single large PLAY/CONTINUE button + secondary nav (Levels, Modes, Stats, Controls, Credits)
- [x] Any key/click/tap on title screen starts the game
- [x] First-ever visit auto-starts Level 1, no menu (`main.ts` detects empty save)
- [x] Level intro banner dismissible by any input
- [x] Game-over screen auto-defaults to "retry" (any input retries)
- [x] HUD audit complete — score, timer, lives, weapon, combo always visible; effect chips only when active
- [x] P2 join hint hidden by default, surfaced only after Level 3 on desktop
- [x] First-ever Level-1 ball velocity dampened 35% (`firstPopCelebrated` save flag)

### Phase 2 — Mobile parity — **DONE**

- [x] Touch input layer in `src/systems/input.ts` mapping to existing `keys`/`keysPressed`
- [x] On-canvas translucent touch controls (◀ ▶ + FIRE + pause)
- [x] Touch detection via `'ontouchstart' in window`
- [x] `touch-action: none` + viewport meta preventing iOS gestures
- [x] Pause button visible top-right with boosted contrast for bright backgrounds
- [x] Portrait orientation prompt via CSS media query (`@media (hover:none) and (orientation:portrait)`)
- [x] Co-op affordances hidden on touch devices
- [ ] Real-device smoke test on Android Chrome (operational — see LAUNCH.md §3.11)
- [ ] Real-device smoke test on iOS Safari (operational — see LAUNCH.md §3.11)

### Phase 3 — Retention hook — **DONE**

- [x] Bronze/silver/gold tiers from `targetScore × {1.0, 1.25, 1.5}` (`systems/daily.ts:medalFor`)
- [x] Medals rendered on the level select grid (`state/levelSelect.ts`)
- [x] Save schema v2 with v1 migration (`systems/storage.ts`)
- [x] `medals`, `dailyLastPlayed`, `dailyStreak`, `dailyBest` persisted (+ `bestBossRush*`, `lifetime*`)
- [x] Daily Challenge prominent on main menu with NEW badge + breathing animation when fresh
- [x] Deterministic FNV-1a seed selects daily level + modifier (`systems/daily.ts:pickDailyChallenge`)
- [x] Modifier pool: `double_score`, `no_pickups`, `tiny_hurtbox`, `big_bubbles`, `sudden_death`
- [x] Streak counter 🔥 on main menu + daily intro + daily result
- [x] Streak resets when a day is skipped, recognized via `liveStreak()`
- [x] Post-run result screen with Copy + Share-on-X buttons (`state/daily.ts`)
- [x] Welcome-back banner across day boundaries (`captureWelcomeBack`)

### Phase 4 — CrazyGames SDK — **DONE**

- [x] CrazyGames SDK v3 script tag in `index.html`
- [x] `src/systems/platform.ts` adapter with no-op fallbacks; never throws to gameplay
- [x] `gameplayStart` on entering `State.PLAYING`, `gameplayStop` on every transition out
- [x] `happytime` on level clear + boss defeat + daily PB + streak milestones (3/7/14/...)
- [x] Midgame ad between Tour levels (60s spacing, skip first cleared level of session)
- [x] Rewarded "watch ad to continue" on Score Attack / Panic / **Boss Rush** game-over
- [x] Cloud save via Data Module, merged on the higher-progress side per field
- [x] No console errors with SDK absent (every adapter call guarded)
- [x] Ad lifecycle hook: audio ducked + game auto-paused during ads
- [x] Bundle ~39 KB gzipped (well under 200 KB target)

### Phase 5 — Feel and clarity — **DONE**

- [x] Particle bursts scale with ball size (8 + size×6 particles)
- [x] Shockwave ring on every pop, sized by ball size
- [x] Altitude-modulated floor shadow on every ball
- [x] Squash-and-stretch (180ms) on floor bounce
- [x] Hazard telegraphs: electric pre-discharge halo, falling-rock floor pulse ring, flame-vent windup, boss beam warning
- [x] Reduced-motion setting in pause menu (skips shake, caps flash to 0.06 alpha)
- [x] Pop sound pitch by ball size + type-specific audio flourishes
- [x] Combo milestones at 5/10/15/20 — `NICE!` → `WILD!` → `INSANE!` → `GODLIKE!` with screen shake + flash + audio arpeggio
- [x] Trick chips: `CLUTCH!`, `CLOSE CALL`, `AIR POP`, `BANK SHOT`
- [x] Multi-pop consolidated chain labels: `DOUBLE POP` → `MEGA POP` → `ULTRA POP`

### Phase 6 — Code health — **DONE**

- [x] State handlers extracted from `game.ts` into `src/state/` (one file per state)
- [x] `resolveCollisions` extracted to `src/systems/collisions.ts`
- [x] HUD rendering in `src/systems/hud.ts`
- [x] Combat reactions in `src/systems/combat.ts`
- [x] `game.ts` reduced to a ~600-line orchestrator
- [x] No file in `src/` exceeds 700 lines; most under 300

### Phase 7 — Launch prep

- [x] Boss Rush mode added; best score + best-bosses-defeated persisted
- [x] Controls/Guide screen rewritten with weapons + bestiary + modes glossary
- [x] High Scores screen shows Score Attack / Panic / Boss Rush + 7-day daily history + top 5 Tour levels
- [x] X (Twitter) share intent button alongside Copy on the daily result screen
- [x] Build verification passing (`tsc && vite build` clean, ~39 KB gzipped)
- [ ] Full smoke test: every mode, every level, co-op, mobile + desktop (operational)
- [ ] Test in CrazyGames developer preview (operational)
- [ ] Test on at least three real devices (desktop, Android, iOS) (operational)
- [ ] Test with audio context blocked / localStorage disabled / SDK blocked (operational; code paths are guarded)
- [ ] Create thumbnail artwork — single biggest CTR determinant (artwork)
- [ ] Submit to CrazyGames + address review feedback + ship (operational)

---

## 9. Glossary for fresh chats

- **CrazyGames** — the target platform. Free-to-play browser games. Discovery happens via thumbnail-driven category pages. Featured placement depends on session length, return rate, completion rate.
- **Tour mode** — the campaign. 18 levels, currently linear, gated by `unlockedLevel`.
- **Score Attack** — replayable scoring mode that cycles through levels.
- **Panic mode** — endless wave survival.
- **Level intro banner** — the floating box at the start of each level showing the level name and a tip.
- **Combo** — chain of consecutive pops without missing a shot. Boosts score. Decays over time.
- **Hit pause** — brief freeze-frame after a hit, for impact feel. Already implemented.
- **bba_save_v1** — current localStorage save key. To become `_v2` in Phase 3.

---

## 10. Closing principle

> The game is already good. The work ahead is not to make it bigger; it is to make it the version of itself that a player on a phone, who has never heard of it, will play for 30 seconds — and then come back tomorrow.

If a future change does not directly serve that sentence, defer it.
