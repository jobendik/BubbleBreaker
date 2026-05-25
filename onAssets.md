# On Assets — strategic direction for Bubble Breaker Adventure

A working document evaluating two questions that came up while pushing the
game toward CrazyGames-grade visual polish:

1. Should the game go 2.5D (3D models on 2D gameplay)?
2. Should we move from 100% procedural canvas drawing to real sprites and
   spritesheets?

Recorded so the conclusions don't have to be re-derived every time the
question comes up in a future conversation.

---

## TL;DR

- **Stay 2D.** 2.5D adds dev cost and bundle size without adding gameplay
  value. The Pang genre is 2D by nature.
- **Go hybrid on assets:** sprites for the player, bosses, creatures, and
  pickups; procedural for balls, particles, and HUD; illustrated PNG layers
  optional for backgrounds. Total bundle target: under 2MB.
- **The real CrazyGames bottleneck isn't art format.** It's first-10-seconds
  feel, screenshot magnetism, and day-2 retention hooks. Asset choice
  serves those goals — it doesn't replace them.

---

## Where the game is today

- Pure procedural canvas 2D, ~140KB bundle, no image assets except UI fonts.
- Just shipped a serious visual pass: parallax environments per biome,
  glossy ball materials with specular/rim/inner-shadow, juicier pop VFX
  (sparks + shards + dust + double-ring shockwave), redesigned player
  silhouette (explorer hat + walk cycle), beach biome redone to a higher
  bar (curved palms, island silhouettes with palm crowns, layered sea
  with bezier waves and sun reflection).
- HTML/CSS UI overlay already in place (`src/styles/`, `src/ui/`) — that
  layer is in good shape and not part of this discussion.
- Six biomes (desert, arctic, city, volcano, airship, boss) still on the
  first-pass procedural treatment, awaiting the same care beach got.

---

## Question 1: 2D vs 2.5D

**Verdict: stay 2D.**

### Why

**The genre is 2D by definition.** Pang / Buster Bros / Bubble Trouble
is a 2D-plane gameplay loop: harpoon shoots straight up, player moves on
one axis, balls obey 2D physics. Depth doesn't unlock any new mechanic.
Adding 3D models would be visual flex without gameplay payoff — and
players notice when production effort is spent on things that don't
affect how the game *feels to play*.

**CrazyGames doesn't reward 3D for its own sake.** Top performers there
include hard-2D hits (Bloxd, Cubes 2048, Stickman series, classic .io
games) alongside 3D ones. What the platform optimizes for is **fast load,
instant time-to-fun, polished feel, mobile compatibility**. The current
140KB bundle is a competitive advantage; converting to 3D probably pushes
it to 5-15MB plus a WebGL renderer dependency, and degrades mobile perf.

**The ceiling on 2D art is higher than people think.** Cuphead, Hollow
Knight, Cult of the Lamb, Vampire Survivors — pure 2D, all premium. The
bottleneck for our game isn't dimensionality, it's art quality. Going
2.5D when 2D isn't maxed out solves the wrong problem.

### The one exception

**Pang Adventures** (Pastagames, 2016) does exactly the 2.5D treatment —
3D character models on 2D gameplay. It works as a polished console-budget
product. For a CrazyGames web launch, the cost/benefit is wrong: months
of work, large bundle, marginal visual impact over what 2D polish can
deliver.

### When 2.5D would actually pay off (hypothetical)

- If we were doing a console / Steam release with a >2GB budget.
- If we wanted distinct view-angle gameplay (e.g., depth dodging) — we
  don't; that would break the genre.
- If we had a 3D-skilled artist already on board and no 2D pipeline.

None of these apply.

---

## Question 2: Procedural vs sprites

**Verdict: hybrid. Sprites for characters and pickups, procedural for
balls and VFX, optional illustrated PNGs for backgrounds.**

This is the actual high-ROI direction.

### Per-layer recommendation

| Layer | Approach | Rationale |
|---|---|---|
| **Player character** | **Sprites + frame anims** | The single highest-leverage swap. A 64×96 hero sprite with a 6-8 frame walk cycle, plus idle/shoot/hit/jump variants, will outclass every procedural drawing technique. Real animation is what makes a game feel "real" instead of "engine-y." Bundle cost: ~30KB for a packed atlas. |
| **Boss** | **Sprites** | Bosses live or die on personality. Idle-breathing animation + telegraph poses + hit-react frames + death sequence = a memorable encounter. Procedural can't compete here. |
| **Crabs, creatures (dragon, birds)** | **Sprites** | Same logic as the boss — these are character moments, not abstract physics objects. |
| **Pickups (weapons, power-ups)** | **Sprite atlas** | ~20 pickup types, each used briefly but visually prominent when they spawn. A small atlas (~40KB) gives professional iconography that procedural can't match. |
| **Balls / bubbles** | **Stay procedural** | This is where procedural *wins*. We get free color variations across 12+ types, perfect scaling for 5 size tiers, dynamic squash-on-bounce, runtime-tinted specular highlights. A sprite atlas for balls would be huge, less flexible, and provide no quality lift over the current glossy material pass. **Do not change.** |
| **Particles, shockwaves, smoke** | **Stay procedural** | Procedural is the genre standard for VFX. Cheap, infinitely tunable, scales with combat intensity. **Do not change.** |
| **Backgrounds** | **Hand-illustrated PNG layers OR stay procedural** | Optional upgrade. A single 960×432 illustrated backdrop per biome at ~80KB compressed = 7 biomes × 80KB = ~600KB total. That's the biggest visual leap available short of redoing the whole game. But the procedural backgrounds *can* carry the game if polished to the level beach is at now. Decide based on art-direction ambition. |
| **HUD / UI** | **Stay HTML/CSS** | Already correct. Don't touch. |

### Bundle math

| Component | Estimated size |
|---|---|
| Current bundle | ~140KB |
| Player sprite atlas (10 anim states × 6 frames avg) | ~30KB |
| Boss + creatures + crabs atlas | ~80KB |
| Pickup atlas (20 items) | ~40KB |
| 7 biome backdrops (optional) | ~600KB |
| **Total worst case** | **~890KB** |

CrazyGames' soft "instant-load" target is under 5MB initial. Most popular
games on the platform are 5-25MB. We have enormous headroom — bundle is
not a constraint on this decision.

### Production cost in 2026

The traditional barrier to sprites was art talent and budget. That's
gone. AI image generation (Midjourney with consistent-character LoRAs,
SDXL fine-tunes, Niji for stylized output) generates production-grade
game sprites in an afternoon. A solo dev can output what previously took
a designer + animator.

Workflow that works:

1. Define a style guide in Midjourney (3-5 sample images establishing
   palette, line weight, shading style — call it "bright modern cartoon
   arcade, bold colors, clean silhouette, no texture noise").
2. Generate the player character idle pose. Iterate until silhouette and
   color story match the game.
3. Use the idle as a reference (`--cref` or LoRA) to generate the walk
   cycle frames, shoot pose, hit react, etc.
4. Run frames through a background remover, pack into an atlas
   (TexturePacker or free-tier equivalents), export a JSON manifest.
5. Add a small `SpriteAnimator` class in `src/rendering/sprite.ts` that
   loads the atlas on boot, exposes `draw(name, frame, x, y, facing)`,
   and slots into the existing per-entity `draw(ctx)` path.

Total time investment: ~1-2 days for a full character sprite pipeline,
including the engine plumbing.

### Why not 100% sprites

Three reasons we should *not* go fully sprite-based:

1. **Balls scale across 5 size tiers × 12 types = 60 unique appearances.**
   Procedural handles this with one `draw()` call. Spriting it would be
   ~60 entries in the atlas with worse visual quality at non-native sizes.
2. **Procedural balls support dynamic effects** (squash-on-bounce,
   altitude-scaled shadow, type-specific overlays like electric crackle
   or lava cracks) that sprites can't do without baking every combination.
3. **Particles are infinite-count by nature.** A sprite-based particle
   system means an atlas lookup per particle. The current procedural
   approach is faster and visually right.

---

## What to do, in priority order

ROI-ordered, assuming the goal is CrazyGames success:

1. **Finish the procedural polish on the other 6 biomes** to the level
   beach is at now. Same session of work. Establishes a coherent visual
   floor across all worlds.
2. **Replace the player character with a sprite + walk cycle.** Single
   highest-leverage visual change available. Few hours of art + few hours
   of engine plumbing. The screenshot of someone playing will look
   dramatically more "real" after this.
3. **Replace boss, crabs, and creatures with sprites.** Once the
   `SpriteAnimator` exists for the player, additional sprite-based
   entities are cheap to add.
4. **Sprite atlas for pickups.** Quick win after the system is in place.
5. **Decide on illustrated backgrounds.** Optional. Procedural backgrounds
   *can* be enough — beach proves it. But hand-illustrated layers would
   push the game into a different tier of perceived quality, at the cost
   of ~600KB and a few days of generation/curation.

Crucially: **steps 2-5 only earn their cost after step 1.** Sprite-based
entities on top of weak procedural backgrounds will look mismatched.
Polish the backdrop first.

---

## The harder truth — what actually drives CrazyGames success

Asset format is downstream of these three things. If we get these wrong,
no amount of art will save the game:

1. **First 10 seconds.** Does the player understand what to do AND feel
   a satisfying pop within 10 seconds of page load? Audio, screen shake,
   particle juice on the first ball burst matter more than any background.
   *Current state:* probably good; the first-pop celebration is wired up
   with audio + bigger shockwave + flash. Worth re-verifying with fresh
   eyes.
2. **A screenshot that makes someone click the game tile.** The
   CrazyGames thumbnail does 90% of marketing. One stunning hero shot —
   ideally mid-combo, with VFX visible and a clear character — beats any
   description copy. *Current state:* main menu screenshot is fine; the
   in-game screenshot needs the polish pass to finish before it sells.
3. **A reason to return tomorrow.** Daily challenge, leaderboards,
   unlocks, persistent progression. *Current state:* daily challenge,
   medals, lifetime stats, titles already in code per the commit history.
   Probably sufficient — but worth a UX audit on whether returning
   players see their progress prominently on the main menu.

Visual polish (this whole document) serves all three. But asset format
choice does not, by itself, move the needle on retention or
discoverability.

---

## Open questions / risks

- **Sprite art consistency across biomes.** If the player is sprite-based
  but stands in a procedural environment, the visual languages can clash.
  Mitigation: tune the sprite shading/palette to match the procedural
  ambient lighting per biome (we already have `--acc` and `--sky-*` per
  biome — sprite tinting can pick those up via `globalCompositeOperation`).
- **Mobile performance.** Adding sprites is cheap; adding ~600KB of
  illustrated backgrounds means a slower first paint on cellular. Worth
  measuring with a Lighthouse run before/after if we go that route.
- **Iteration speed.** Procedural code can be tweaked in seconds and
  hot-reloads via Vite. Sprite changes require re-generation +
  re-packing. This is fine for shipping art, but limits late-stage
  iteration unless we keep procedural fallbacks for prototyping.
- **AI sprite consistency.** Generating a coherent character across 8+
  animation frames is the main technical challenge. Modern tools handle
  it well, but expect to throw away ~70% of generations.

---

## What this document is NOT

- Not a final spec. The actual sprite atlas format, animation system API,
  and asset pipeline tooling are decisions to make *if and when* we
  commit to step 2 above.
- Not an art direction document. That's a separate piece of work
  (style guide, color palette callouts, character turnarounds, biome
  mood boards) that would be done by whoever produces the sprites.
- Not a binding plan. The recommendation here is "in this order, with
  these tradeoffs" — the actual call is the project owner's.
