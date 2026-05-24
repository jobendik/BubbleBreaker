# Bubble Breaker Adventure — Launch Pack

> Everything you need to take the game from "feature-complete" to "submitted on CrazyGames." Listing copy, cover-art brief, release-candidate checklist, smoke-test script, and post-launch metrics watchlist.

---

## 1. Game listing copy

### 1.1 Short tagline (under 60 chars)

> **Pop, dodge, and chain combos in this modern arcade ball-breaker.**

### 1.2 One-sentence pitch (used on CrazyGames game page)

> **Bubble Breaker Adventure is a fast, modern take on the classic Pang formula — split bouncing balls before they touch you, chain pops for huge combos, and conquer 18 hand-crafted levels, Boss Rush, Panic Mode, and a daily challenge.**

### 1.3 Three feature bullets

- **18 hand-crafted levels across 6 worlds**, plus a boss fight and five distinct modes: Tour, Score Attack, Panic, Boss Rush, and Today's Challenge.
- **Daily Challenge** with a globally synced modifier — one shared level + twist per UTC day, with a 🔥 streak counter, copy-to-clipboard result, and one-tap share on X.
- **Pure browser arcade**: loads in seconds, plays on desktop or touch, no account needed. Local co-op on desktop with Pang-Adventures-style revive.

### 1.4 Genre / category

- **Primary genre:** Arcade
- **Secondary tags:** Action, Skill, Casual, Single Player, 2 Player (Local)
- **Controls tags:** Keyboard, Touch, Mouse

### 1.5 Long description (CrazyGames page body)

> Pop, split, dodge — survive.
>
> Bubble Breaker Adventure is a modern browser take on the classic Pang / Buster Bros arcade formula. Bouncing balls split into smaller, faster ones when you hit them. Your only job: clear the screen before one touches you.
>
> Across 18 hand-crafted levels and 6 worlds you'll face armored balls, hexagonal Super Pang bouncers, lava drops, electric discharges, smoke clouds, falling rocks, weapon-jamming birds, friendly dragons, and a boss who really does not want to lose. Pick up powerful weapons — triple harpoon, ceiling-anchoring grapple, diagonal bolts, laser, flamethrower, shotgun, shuriken, bomb, and the screen-shrinking Dynamite — and chain pops for huge combo multipliers.
>
> When you've mastered Tour mode, push your skill in Score Attack, test your reflexes in endless Panic mode (with the Rainbow Gauge and screen-clearing Star Bubbles), or take on Boss Rush. Or play today's Daily Challenge — one shared level with a global modifier, refreshed every UTC midnight, with a streak that rewards coming back.
>
> Plays on desktop, phone, and tablet. Optional local co-op on desktop with a 10-second revive window. Accessibility: reduced-motion mode in the pause menu.

### 1.6 Controls block (for the listing's "How to play" section)

```
Desktop
  A / ←        Move left
  D / →        Move right
  Space / W / ↑   Shoot
  P / Esc      Pause
  R            Instant restart
  M            Toggle sound
  I / K / U    Player 2 joins (local co-op)
  J / L        Player 2 move (left / right)

Mobile / touch
  Left side    Movement buttons
  Right side   FIRE button
  Top-right    Pause
```

---

## 2. Cover art brief

You'll need three covers in three ratios. The brief below treats them as **one campaign in three crops**, not three unrelated images — CrazyGames recommends visual consistency across all three.

### 2.1 Universal visual language

- **Hero element:** the player character (small lab-coat / arcade-hero silhouette) standing at the bottom of frame, harpoon raised upward.
- **Threat element:** a large glossy red/pink ball (size tier 4) descending from upper-frame, mid-split — small particles peeling off, suggesting "about to pop."
- **Action element:** a glowing harpoon line connecting player → ball, with a bright shockwave ring at impact.
- **Palette:** the game's beach/sunset palette — warm cyan/peach sky, deep navy player silhouette, hot pink/yellow ball, white pop sparkles. Strong contrast.
- **No UI, no score, no menu chrome.** Cover art shows the verb, not the screen.
- **Logo:** "BUBBLE BREAKER" in the game's bold yellow stroke style, "ADVENTURE" subtitle in white. Position varies per ratio (see below).

### 2.2 Three crops

| Ratio | Pixels | Layout |
|---|---|---|
| **Landscape** | 1280 × 720 | Wide composition: player bottom-left, ball upper-right mid-split, harpoon line diagonal across frame, logo bottom-right. Plenty of breathing room. |
| **Square** | 1080 × 1080 | Tighter framing: player bottom-center, ball top-center, vertical harpoon line, logo top with subtitle below. |
| **Portrait** | 720 × 1280 | Stacked composition: player bottom, ball middle-top, harpoon line vertical, logo upper-third on a slight banner. |

### 2.3 What NOT to do (per CrazyGames cover guidance)

- **No fake gameplay.** The art should look like an idealized frame of the actual game.
- **No borders** around the image.
- **No text on the cover other than the logo** — no "PLAY FREE!" / "NEW!" / etc.
- **Readable at 150–250 px** (CrazyGames' thumbnail display size). Test by shrinking your draft to 200 px wide; if the verb isn't clear, it's too cluttered.
- **No misleading style** — if the cover looks like a 3D AAA shooter, players who click expecting that and find a 2D arcade game will leave and downrate.

### 2.4 Preview video brief (15–20 seconds)

Per the playbook, the video must show real gameplay fast — no cinematic intro. Suggested cut:

| Time | Beat |
|---|---|
| 0–2s | Cold-open on Level 1 mid-play: a ball splits, the player dodges, a particle burst flashes. |
| 2–5s | Combo chain on screen — multiple pops in quick succession, COMBO ×5 text appears, milestone "NICE!" pops up. |
| 5–9s | Weapon variety: a quick cut showing flamethrower, then laser, then triple-harpoon wall of wires, then bomb explosion. |
| 9–13s | Escalation: armored balls, hexagonal Super Pang bouncers, electric pre-discharge halo, falling rock landing telegraph, a Dynamite pickup shrinking the whole screen. |
| 13–17s | Boss fight beat — Commander RIFT hit, health bar dropping, satisfying particle climax. |
| 17–20s | Title card over a freeze-frame of a satisfying pop. "BUBBLE BREAKER ADVENTURE" logo. |

Aspect ratio: **16:9, 1280×720 or 1920×1080.** No audio cuts/music swells longer than ~1 second — keep gameplay sound dominant.

---

## 3. Release-candidate checklist

Walk through this end-to-end on the latest build (`npm run build && npm run preview`) before uploading. **Every line must be green.**

### 3.1 Loading & boot

- [ ] Cold load completes in < 5 seconds on a fast connection (target: under 3 seconds; CrazyGames benchmark is 10 seconds).
- [ ] Bundle is under 50 KB gzipped (currently ~39 KB — well under).
- [ ] No console errors during boot.
- [ ] DevTools Network tab shows no failed requests (404 on the SDK is OK if testing offline; the adapter falls back).
- [ ] DevTools Application → Local Storage shows `bba_save_v2` after first interaction.
- [ ] If a v1 save (`bba_save_v1`) was present, migration runs once and v2 is populated with the same scores.

### 3.2 First-time visitor flow

- [ ] In Incognito (or with `localStorage.clear()`), the game **auto-starts Level 1** — no menu shown.
- [ ] Control hint visible during the intro banner.
- [ ] First successful pop happens within ~10 seconds of page load.
- [ ] Intro banner dismisses on first movement / shoot / tap.
- [ ] Level 1 clears successfully without obscure failures.

### 3.3 Returning visitor flow

- [ ] On reload after first play, main menu appears with **CONTINUE** button (not PLAY) showing the next level name.
- [ ] If `lastSessionDate` was yesterday, the **welcome-back banner** shows under the title.
- [ ] Tapping the welcome-back banner dismisses it.
- [ ] Daily streak chip 🔥 N appears on the daily button when streak > 0.

### 3.4 Main menu — all entry points

- [ ] **PLAY/CONTINUE** — starts Tour from highest unlocked level (verify via keyboard Enter, mouse click, and touch).
- [ ] **Daily Challenge** button — opens daily intro screen.
- [ ] **Levels** — opens level select grid; medals visible on cleared tiles.
- [ ] **Modes** — opens mode select with Tour / Score Attack / Panic / Boss Rush / Back.
- [ ] **Stats** — shows lifetime pops/tricks/play-time/medals/titles.
- [ ] **Controls** — shows controls + bestiary + weapons + pickups glossary.
- [ ] **Credits** — shows credits.
- [ ] Sound icon (top-right) toggles mute; state persists across reload.
- [ ] Arrow keys navigate menu; Enter confirms current selection.

### 3.5 Gameplay — Tour

- [ ] Each of the 18 levels loads without error.
- [ ] Player movement responsive, no input lag.
- [ ] Pop feedback feels good (particle burst scales with ball size; shockwave ring visible).
- [ ] Ball shadow on floor scales with altitude.
- [ ] Squash-and-stretch visible on floor bounce.
- [ ] Electric ball pre-discharge halo strobes within ~1.2s of discharge.
- [ ] Falling rock pulsing landing-target visible on the floor.
- [ ] Combo milestones (5/10/15/20) trigger floating text + audio chime.
- [ ] Death triggers the correct death-reason text on the next game-over (ball / hazard / crab / boss / timeout).
- [ ] Level clear summary shows base/time/accuracy/combo/no-miss/total.
- [ ] Medal tier (bronze/silver/gold) updates correctly based on score vs target × {1.0, 1.25, 1.5}.
- [ ] Boss level (level 18) completes with VICTORY screen.

### 3.6 Score Attack

- [ ] Starts at Level 1, cycles forward after each clear.
- [ ] Game over shows **"NEW BEST!"** if score beats `bestScoreAttack`, otherwise shows the best.
- [ ] Death reason text displayed.
- [ ] Rewarded continue button appears IF SDK is present (won't show in local dev).

### 3.7 Panic Mode

- [ ] Wave counter increments correctly.
- [ ] Ball type variety appears starting wave 3.
- [ ] Pickup appears every 3rd wave; falling rock every 5th.
- [ ] Rainbow Gauge fills with pops; on full, force-advances the wave with bonus.
- [ ] Star Bubble drops periodically (~30s if none on screen). Cycles between Clock face (universal freeze) and Star face (screen clear + score sweep).
- [ ] Flashing time-stop micro-balls (size 0) grant a brief freeze when popped.
- [ ] Game over shows wave reached and "NEW BEST!" if applicable.
- [ ] Rewarded continue restores 1 life and respawns in place (don't reset score/wave).

### 3.7b Boss Rush

- [ ] Starts at the first boss-flagged level; queues remaining bosses to a 3-fight minimum.
- [ ] Each boss intro banner reads "BOSS N".
- [ ] Lives carry across bosses; deaths decrement total lives, not per-boss.
- [ ] Game over shows "Bosses defeated: N" with NEW BEST! if applicable, plus best-ever score.
- [ ] Rewarded continue preserves the queue/count so the run resumes from the current boss.
- [ ] Final boss defeated → VICTORY screen; `bestBossRush` and `bestBossRushCount` persist.

### 3.8 Daily Challenge

- [ ] Daily intro shows date, streak, level name, modifier name + description.
- [ ] PLAY starts the run with the modifier applied:
  - [ ] `double_score`: pop scores doubled (verify on a single pop)
  - [ ] `no_pickups`: pickups array is empty, destructibles drop nothing
  - [ ] `tiny_hurtbox`: balls graze you without killing
  - [ ] `big_bubbles`: balls start one size larger than baseline
  - [ ] `sudden_death`: lives = 1
- [ ] Result screen on win or fail shows score, today's best, streak.
- [ ] COPY button shows "COPIED ✓" briefly; paste verifies clipboard content.
- [ ] SHARE ON X button opens an X intent URL in a new tab with the result text.
- [ ] Streak increments only on first attempt of the day, not on retries.
- [ ] Test by changing system date: skipping a day resets streak; consecutive days bump it.

### 3.9 Pause overlay

- [ ] P / Esc opens pause; same key resumes.
- [ ] On touch, the canvas pause button opens it.
- [ ] Pause shows level name, target score, control hint.
- [ ] P2 join hint appears only when `unlockedLevel >= 3` AND not on touch.
- [ ] Reduced Motion toggle persists across reload.
- [ ] RESTART / RESUME / MENU buttons work via click and keyboard.

### 3.10 Reduced Motion

- [ ] When enabled, screen does not shake on hits/explosions.
- [ ] White flash is capped to a barely-visible tint (alpha ≤ 0.06).
- [ ] All other feedback (particles, sound, combo text) still works.

### 3.11 Touch / mobile

- [ ] In Chrome DevTools device mode (e.g. iPhone 14 Pro landscape):
  - [ ] Touch UI buttons render translucent at bottom-left (◀ ▶) and bottom-right (FIRE).
  - [ ] Pause button visible top-right.
  - [ ] Can hold direction + FIRE simultaneously (multi-touch).
  - [ ] HUD shifts to avoid pause button collision.
- [ ] In portrait orientation, the rotate-to-landscape overlay appears.
- [ ] On a real Android device (recommended): no jank, no input misses on first touch.
- [ ] On a real iOS Safari device (recommended): no double-tap zoom, no rubber-band scroll.

### 3.12 CrazyGames iframe sizes

Open the built game in each of these iframe sizes (use a simple test HTML page with an `<iframe width="W" height="H">`):

- [ ] 907 × 510
- [ ] 1216 × 684
- [ ] 1077 × 606
- [ ] 821 × 462
- [ ] 1366 × 768 (fullscreen)

For each:
- [ ] HUD elements (score, timer, lives) visible.
- [ ] PLAY button visible without scrolling.
- [ ] No clipped modals or pause overlay.
- [ ] Touch controls (if forced on) sit within visible canvas area.

### 3.13 SDK behavior

Mock the SDK in DevTools console (see [planForFurtherDev.md §8 Phase 4 testing notes](planForFurtherDev.md)) to verify:

- [ ] `[SDK] gameplayStart` fires when entering PLAYING.
- [ ] `[SDK] gameplayStop` fires on every transition out of PLAYING.
- [ ] `[SDK] happytime` fires on level clear and boss defeat.
- [ ] `[SDK] requestAd midgame` fires between Tour levels (skips the very first cleared level of a session).
- [ ] `[SDK] requestAd rewarded` fires when player clicks "WATCH AD TO CONTINUE" on Game Over.
- [ ] If the mocked rewarded ad's callback fires `adFinished`, the player resumes with 1 life and score preserved.

### 3.14 Stability — the 20-rematch test

- [ ] Play 20 Score Attack runs in a row (mash retry after each death).
  - No console errors.
  - No memory growth visible in DevTools Performance Monitor.
  - No audio context warnings.
  - No frame drops at the 20th run.
- [ ] Pause/resume 20 times rapidly — no leaks.
- [ ] Open and close the daily challenge intro 10 times — no leaks.

### 3.15 Analytics events

Open DevTools console. The following should be logged (look for `[evt]` prefix):

- [ ] `boot.start` (very first event)
- [ ] `save.hydrate` with `ms`, `hasProgress`, `schemaVersion: 2`
- [ ] `sdk.init.start` followed by `sdk.init.done` with `hasSDK`
- [ ] `boot.ready` with `firstVisit: true/false`
- [ ] `gameplay.start` on entering a level, with `mode`, `level`, `modifier`
- [ ] `first_pop` exactly once per page session
- [ ] `level.clear` when a level is cleared
- [ ] `run.fail` when lives reach 0, with `reason`
- [ ] `gameplay.stop` on each PLAYING → non-PLAYING transition

### 3.16 Error handling

- [ ] In DevTools, run `throw new Error('test')` — confirm `[evt] error.uncaught` is logged.
- [ ] Run `Promise.reject('test')` — confirm `[evt] error.unhandled_rejection` is logged.

### 3.17 Edge cases (don't skip these)

- [ ] Pause, then in DevTools clear localStorage, then resume — game should not crash; on next interaction, save re-initializes with defaults.
- [ ] Disable localStorage entirely (DevTools settings) — game still runs (saves are silent no-ops).
- [ ] Block the SDK script in DevTools Network tab — game still runs in no-SDK mode, no errors.
- [ ] Background the tab during a level clear ad — on return, game resumes cleanly (10-second timeout protects against hung ads).
- [ ] Set system date to "tomorrow" between two sessions — daily streak increments correctly; welcome-back banner appears.
- [ ] Set system date forward by 3 days — streak resets to 0 next time you play the daily.

---

## 4. Pre-submission decision points

A few things to settle before you click Submit:

### 4.1 Identity choice

The game's identity is currently undefined (the visual is competent but generic). Before final cover art, pick one direction from this short list:

- **Beach / sunset arcade hero** (current default — warm, friendly, broad appeal)
- **Neon containment lab** (high-contrast, "premium" feel, slightly more grown-up)
- **Toybox arcade** (extra-bright, exaggerated, family-friendly)

**Recommendation:** stay with the beach/sunset palette already in the game. It's already coherent across themes (each world has its own palette but the menu is beach). The cover art brief above assumes this.

### 4.2 Game name

"Bubble Breaker Adventure" is descriptive but a bit long for a thumbnail. Risk: low (it's clear). Don't rename late — it loses search continuity.

### 4.3 CrazyGames submission category

Recommended: **Arcade → Action → Skill**. Avoid the "Puzzle" tag — players expecting a puzzle game will rate it down.

### 4.4 Age rating

The game has no blood, no scary content, no chat. **All ages** is the right answer.

---

## 5. Post-launch metrics watchlist

These are the metrics that actually move based on what we've built. CrazyGames will show you most of them in the developer dashboard.

| Metric | Target | What to check first if it's bad |
|---|---|---|
| **Load time (P50)** | < 3s | Bundle size; check Network waterfall for slow assets |
| **CTR on thumbnail** | > 5% | Cover art clarity (verb test) |
| **Conversion (click → first input)** | > 80% | Auto-start, intro banner length, first-pop time |
| **Avg session time** | > 5 minutes (CrazyGames "good" threshold is 10) | Daily / level pacing; first-loss explanation |
| **D1 retention** | > 10% | Welcome-back banner working? Streak counter rendering? |
| **D7 retention** | > 5% | Daily challenge variety; streak tenure curve |
| **Rating** | > 4.0 / 5 | Read every 1-star, look for "confusing" / "stuck" / "ad" |
| **Crash rate (`error.uncaught` events)** | < 0.5% | Console errors during smoke test; specific scenes |

### 5.1 Funnel analysis pattern

Once analytics events flow to a real sink (Phase 8 work), the most important funnel is:

```
boot.start
  → save.hydrate (verify ms < 50)
  → sdk.init.done (verify success rate > 99%)
  → boot.ready
  → gameplay.start          ← conversion gate
  → first_pop               ← engagement gate
  → level.clear (1+)        ← completion gate
  → gameplay.start (run #2) ← retention-in-session gate
```

Big drop between `gameplay.start` and `first_pop` = first-minute design problem. Big drop between `level.clear` and the next `gameplay.start` = the post-level flow is killing momentum.

---

## 6. After Submit — what happens next

1. CrazyGames review: typically 1–3 business days for the Basic Launch path.
2. Reviewer may request changes — most commonly:
   - **Ads:** "ads are firing during gameplay" (we're safe; midgame only at level breaks, 60s spacing).
   - **Build size:** "build is too large" (we're ~39 KB gzipped — not a concern).
   - **Crashes:** "console errors on load" (run 3.14 again before submission).
   - **Pause / leave:** "no way to exit a run" (we have pause + menu button).
3. Once approved, the game appears in CrazyGames' moderation queue, then live within a few days.
4. **First 7 days are critical** — CrazyGames' algorithm decides featured placement based on engagement during this window. Be ready to push small fixes daily if the metrics in §5 are off.

---

## 7. After launch — first iterations to consider

Don't pre-build these. Wait for data. But have them in your head:

- **If conversion is low** → shorten the intro banner timer; make Level 1 even easier.
- **If session time is low** → audit which level players quit on (add `level.start` event); fix that specific level.
- **If D1 is low** → make the welcome-back banner more visually prominent; add a small new-content marker for the daily.
- **If D7 is low** → add a second daily challenge variant; introduce a weekly leaderboard for daily scores.
- **If rating mentions ads** → reduce midgame frequency; never show rewarded prompt twice per run.
- **If players ask for "more levels"** → that's the signal to start Phase 8 content expansion. Until then, polish wins over content.

---

## 8. The single most important reminder

> **The game is already good.** Phase 7 was about making it submittable, not making it different. Resist the urge to add features in the days before launch. Every change is a chance to introduce a bug. Run the checklist in §3, fix what's red, ship.
