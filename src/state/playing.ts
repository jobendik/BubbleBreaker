import { CEILING_Y, H, State, W } from '../constants';
import { LEVELS } from '../data/levels';
import { Ball } from '../entities/ball';
import { FloatingText, Shockwave } from '../entities/particle';
import { drawBackground, roundRect } from '../rendering/canvas';
import { rand } from '../utils';
import { AudioSys } from '../systems/audio';
import { emit } from '../systems/analytics';
import { resolveCollisions } from '../systems/collisions';
import { renderHUD, renderTouchControls } from '../systems/hud';
import { consumePauseTap, consumePressed, isTouchDevice, keysPressed, pointer, tickTouchInputs } from '../systems/input';
import { Platform as Sdk } from '../systems/platform';
import { Storage } from '../systems/storage';
import { clamp } from '../utils';
import { FX } from '../ui/overlay/effects';
import type { Game } from '../game';

let onboardingHintEmitted = false;

export function updatePlaying(game: Game, dt: number) {
  // Touch input: translate active touches into synthetic key state.
  tickTouchInputs(isTouchDevice);

  // Pause — keyboard or canvas pause button.
  if (consumePressed('KeyP') || consumePressed('Escape') || consumePauseTap()) {
    game.state = State.PAUSED; AudioSys.menu(); return;
  }
  // Local co-op is a desktop-only feature (touch UI is single-player).
  if (!isTouchDevice && !game.player2 && (consumePressed('KeyI') || consumePressed('KeyK') || consumePressed('KeyU'))) {
    game.joinPlayer2();
  }
  // Restart
  if (consumePressed('KeyR')) {
    if (game.mode === 'panic') return game.startPanic();
    if (game.mode === 'score_attack') return game.startScoreAttack();
    return game.loadLevel(game.levelIndex);
  }

  // Effective dt (slow time / hit pause)
  if (game.hitPause > 0) {
    game.hitPause -= dt;
    dt *= 0.05;
  }
  if (game.slowTime > 0) {
    game.slowTime -= dt;
    dt *= 0.45;
  }
  if (game.freezeTime > 0)     game.freezeTime     = Math.max(0, game.freezeTime - dt);
  if (game.magnetTime > 0)     game.magnetTime     = Math.max(0, game.magnetTime - dt);
  if (game.comboBoostTime > 0) game.comboBoostTime = Math.max(0, game.comboBoostTime - dt);
  const motionDt = game.freezeTime > 0 ? 0 : dt;

  // Update timer (campaign and score attack)
  if (game.mode !== 'panic') {
    game.timer -= dt;
    const warningSecond = Math.ceil(game.timer);
    if (warningSecond > 0 && warningSecond <= 10 && warningSecond !== game.lastTimerWarning) {
      game.lastTimerWarning = warningSecond;
      AudioSys.warning();
    }
    if (game.timer <= 0) {
      game.timer = 0;
      if (game.player) game.killPlayer(game.player, 'timeout');
      return;
    }
  }

  // Combo decay
  game.comboDecay -= dt;
  if (game.comboDecay <= 0 && game.combo > 0) {
    game.combo = Math.max(0, game.combo - 1);
    game.comboDecay = 0.5;
  }

  // Lifetime play-time accumulator. The save is debounced via cloud writes
  // already (Storage.save), so we don't persist on every tick — the buffer
  // flushes on level clear / death where Storage.save() is called anyway.
  Storage.data.lifetimePlayMs = (Storage.data.lifetimePlayMs || 0) + dt * 1000;
  if (game.firstRunHintAge >= 0 && game.introTimer <= 0) {
    game.firstRunHintAge += dt;
    if (!onboardingHintEmitted) {
      onboardingHintEmitted = true;
      emit('onboarding.hint_shown', { level: game.levelIndex });
    }
  }

  // Multi-pop chain window: closes when no new pops have arrived for 180ms.
  // We emit one consolidated DOUBLE/TRIPLE/MEGA POP label at the chain
  // centroid — never one per ball — so explosions and laser sweeps read as
  // ONE big moment, not a screen full of confetti.
  if (game.chainTimer > 0) {
    game.chainTimer -= dt;
    if (game.chainTimer <= 0 && game.chainCount >= 2) {
      const n = game.chainCount;
      let label = '', bonus = 0, color = '#ffd60a', size = 32;
      if (n === 2) { label = 'DOUBLE POP'; bonus = 100; color = '#9be7ff'; size = 28; }
      else if (n === 3) { label = 'TRIPLE POP'; bonus = 250; color = '#ffd60a'; size = 32; }
      else if (n === 4) { label = 'QUAD POP'; bonus = 500; color = '#ff7f50'; size = 36; }
      else if (n <= 7)  { label = 'MEGA POP'; bonus = 1000; color = '#ff36c4'; size = 44; }
      else              { label = 'ULTRA POP'; bonus = 2000; color = '#ff36c4'; size = 52; }
      const dailyMult = game.modifier === 'double_score' ? 2 : 1;
      const gained = bonus * dailyMult;
      game.addScore(gained);
      // Big label at the chain centroid, plus a small "+score ×N" subtitle.
      game.floatingTexts.push(new FloatingText(game.chainCx, game.chainCy - 18, label, color, size));
      game.floatingTexts.push(new FloatingText(game.chainCx, game.chainCy + 10, '+' + gained + '  ×' + n, '#fff', 16));
      // Light shockwave to draw the eye, but no screen flash/shake (those are
      // reserved for combo milestones — keeping the hierarchy clear).
      game.shockwaves.push(new Shockwave(game.chainCx, game.chainCy, 80 + n * 18, color, 0.4));
      // Multi-pop medal — tier scales with chain size so the player gets
      // a persistent visual marker for the bigger chains. Double/triple
      // pops don't get medals (too frequent); QUAD+ does.
      if (n >= 4) {
        const tier = n <= 4 ? 'silver' : n <= 7 ? 'gold' : 'mythic';
        FX.medal(label, n + ' balls at once', tier, '+' + gained);
      }
      // Lifetime stats for the Detonator title and post-game brag.
      if (n > (Storage.data.bestMultiPop || 0)) {
        Storage.data.bestMultiPop = n;
      }
      Storage.save();
    }
    if (game.chainTimer <= 0) {
      game.chainCount = 0;
      game.chainCx = 0;
      game.chainCy = 0;
      game.chainTimer = 0;
    }
  }

  // Intro timer — any movement, shoot, or pointer press dismisses early.
  if (game.introTimer > 0) {
    const before = game.introTimer;
    game.introTimer -= dt;
    const moved = keysPressed['ArrowLeft'] || keysPressed['ArrowRight']
               || keysPressed['KeyA'] || keysPressed['KeyD']
               || keysPressed['KeyJ'] || keysPressed['KeyL'];
    const shot  = keysPressed['Space'] || keysPressed['ArrowUp'] || keysPressed['KeyW']
               || keysPressed['KeyI'];
    if (moved || shot || pointer.pressed) game.introTimer = 0;
    // Edge: intro just ended (either by timeout or early-dismiss). Fire a
    // brief "GO!" beat so the player knows their input matters NOW. Panic
    // mode prints its own WAVE banner, so skip there to avoid stacking.
    if (before > 0 && game.introTimer <= 0 && game.mode !== 'panic') {
      game.floatingTexts.push(new FloatingText(W/2, H/2 - 10, 'GO!', '#ffd60a', 88));
      game.shockwaves.push(new Shockwave(W/2, H/2 - 10, 220, '#ffd60a', 0.45));
      AudioSys.go();
    }
  }

  // shake/flash decay now lives in game.update() so it ticks across every
  // state — without that, hitting PLAYER_DEAD with shake=18 leaves the camera
  // jittering until respawn.

  // --- Entity updates ---
  for (const p of [game.player, game.player2]) {
    if (!p) continue;
    if (p.dead && p.respawnTimer > 0) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0 && game.lives > 0) game.respawnPlayer(p);
    } else {
      p.update(dt, game);
    }
  }

  for (const p of game.platforms) p.update(dt);
  for (const c of game.crabs) c.update(dt);
  for (const cr of game.creatures) cr.update(motionDt);
  for (const b of game.balls) b.update(motionDt, game);
  for (const p of game.projectiles) p.update(dt, game);
  for (const pk of game.pickups) pk.update(dt, game);
  for (const h of game.hazards) h.update(dt);
  for (const pt of game.particles) pt.update(dt);
  for (const sw of game.shockwaves) sw.update(dt);
  for (const sc of game.smokeClouds) sc.update(dt);
  for (const ft of game.floatingTexts) ft.update(dt);
  if (game.boss) game.boss.update(motionDt, game);

  // --- Collisions ---
  resolveCollisions(game);

  // --- Cleanup ---
  for (const p of game.projectiles) {
    if (p.dead && !p.didHit && p.type !== 'flame') {
      game.combo = 0;
      game.comboDecay = 0;
    }
  }
  game.balls         = game.balls.filter(b => !b.dead);
  game.projectiles   = game.projectiles.filter(p => !p.dead);
  game.pickups       = game.pickups.filter(p => !p.dead);
  game.destructibles = game.destructibles.filter(d => !d.dead);
  game.hazards       = game.hazards.filter(h => !h.dead);
  game.creatures     = game.creatures.filter(c => !c.dead);
  game.particles     = game.particles.filter(p => !p.dead);
  game.shockwaves    = game.shockwaves.filter(s => !s.dead);
  game.smokeClouds   = game.smokeClouds.filter(p => !p.dead);
  game.floatingTexts = game.floatingTexts.filter(f => !f.dead);
  if (game.particles.length   > 300) game.particles.length   = 300;
  if (game.shockwaves.length  > 40)  game.shockwaves.length  = 40;
  if (game.smokeClouds.length > 80)  game.smokeClouds.length = 80;

  // --- Win conditions ---
  if (game.bossLevel) {
    if (game.boss && game.boss.dead && game.balls.length === 0) {
      game.state = State.BOSS_DEFEATED;
      game.bossDefeatedTimer = 2;
      Sdk.happytime();
      game.unlockedLevel = Math.max(game.unlockedLevel, LEVELS.length);
      Storage.data.unlockedLevel = game.unlockedLevel;
      Storage.save();
    }
  } else if (game.mode === 'panic') {
    // Star Bubble timer — drops one Star Bubble periodically so the player
    // always has a screen-clear / freeze option even on long survivals.
    if (game.panicStarTimer > 0) game.panicStarTimer -= dt;
    const noStarOnScreen = !game.balls.some(b => b.type === 'star');
    if (game.panicStarTimer <= 0 && noStarOnScreen) {
      game.balls.push(new Ball(rand(140, W - 140), CEILING_Y + 40, 2, 'star', rand(-90, 90), 60));
      game.floatingTexts.push(new FloatingText(W/2, H/2 - 40, 'STAR BUBBLE!', '#ffd60a', 22));
      game.panicStarTimer = 30;
    }
    // Rainbow Gauge: when full, force the next wave even mid-fight. Mirrors
    // Pang's Panic Mode where the gauge advances levels independently of clears.
    if (game.panicGauge >= game.panicGaugeMax) {
      game.panicGauge = 0;
      game.addScore(300 * game.panicWave);
      game.floatingTexts.push(new FloatingText(W/2, H/2 - 18, 'GAUGE FULL!', '#ffd60a', 30));
      game.advancePanicWave();
    }
    if (game.balls.length === 0 && game.boss == null) {
      if (game.panicWave > Storage.data.bestPanicWave) {
        Storage.data.bestPanicWave = game.panicWave; Storage.save();
      }
      if (game.score > Storage.data.bestPanicScore) {
        Storage.data.bestPanicScore = game.score; Storage.save();
      }
      game.addScore(500 * game.panicWave);
      game.advancePanicWave();
    }
  } else {
    if (game.balls.length === 0) {
      game.levelClear();
    }
  }
}

/** Render the gameplay scene: world, entities, touch controls, HUD, intro overlay. */
export function renderWorld(game: Game) {
  const ctx = game.ctx;
  drawBackground(ctx, game.theme, game.t);

  for (const p of game.platforms) p.draw(ctx, game.theme);
  for (const d of game.destructibles) if (!d.dead) d.draw(ctx);
  for (const h of game.hazards) h.draw(ctx);
  for (const c of game.crabs) c.draw(ctx);
  for (const cr of game.creatures) cr.draw(ctx);
  for (const pk of game.pickups) pk.draw(ctx);
  if (game.boss) game.boss.draw(ctx);
  for (const b of game.balls) b.draw(ctx);
  for (const p of game.projectiles) p.draw(ctx);
  if (game.player) game.player.draw(ctx);
  if (game.player2) game.player2.draw(ctx);
  // Downed-player marker — drawn ONLY in co-op, when one player is dead but
  // their revive window is still open. Standing over the prompt revives them.
  if (game.player && game.player2) {
    for (const p of [game.player, game.player2]) {
      if (p && p.dead && p.respawnTimer > 0.05) {
        const blink = 0.5 + Math.abs(Math.sin(performance.now() / 200)) * 0.5;
        ctx.save();
        ctx.globalAlpha = blink;
        ctx.strokeStyle = '#06d6a0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#06d6a0';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('REVIVE  ' + Math.ceil(p.respawnTimer) + 's', p.x, p.y - 36);
        ctx.restore();
      }
    }
  }
  for (const pt of game.particles) pt.draw(ctx);
  for (const sw of game.shockwaves) sw.draw(ctx);
  for (const sc of game.smokeClouds) sc.draw(ctx);
  for (const ft of game.floatingTexts) ft.draw(ctx);

  // Touch controls (translucent, drawn before HUD so the score/timer overlay them).
  if (game.state === State.PLAYING || game.state === State.PLAYER_DEAD) {
    renderTouchControls(game);
  }

  renderHUD(game);

  // First-ever-session control hint — a calm pill above the player showing
  // the basic controls. Shown only until the player has popped their very
  // first ball ever (firstPopCelebrated is a sticky one-way flag in Storage).
  // Fades out smoothly after the first pop so it doesn't linger.
  if (!Storage.data.firstPopCelebrated && game.state === State.PLAYING && game.mode === 'tour' && game.levelIndex === 0 && game.introTimer <= 0) {
    const fadeFrom = 1.0;   // full opacity for the first second
    const hangSecs = 6.0;   // fully visible for this long
    const fadeSecs = 1.5;   // then fade out over this
    const age = Math.max(0, game.firstRunHintAge);
    const tIn = Math.min(1, age / 0.4);
    const tOut = Math.max(0, Math.min(1, (age - hangSecs) / fadeSecs));
    const alpha = fadeFrom * tIn * (1 - tOut);
    if (alpha > 0.01) {
      const w = 360, h = 56;
      const x = W/2 - w/2, y = 96;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(10,24,50,0.78)';
      roundRect(ctx, x, y, w, h, 10, true, false);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,214,10,0.7)';
      roundRect(ctx, x, y, w, h, 10, false, true);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#9be7ff';
      ctx.textAlign = 'center';
      ctx.fillText('HOW TO PLAY', W/2, y + 16);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#ffd60a';
      if (isTouchDevice) {
        ctx.fillText('TAP ◀ ▶ TO MOVE   •   TAP FIRE TO POP', W/2, y + 40);
      } else {
        ctx.fillText('A / D or ← →  MOVE   •   SPACE / ↑  FIRE', W/2, y + 40);
      }
      const firstBall = game.balls.find(b => !b.dead);
      if (firstBall && game.player) {
        const pulse = 0.5 + Math.sin(age * 7) * 0.5;
        ctx.strokeStyle = `rgba(255,214,10,${0.45 + pulse * 0.35})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(game.player.x, game.player.y - 46);
        ctx.lineTo(game.player.x, CEILING_Y + 22);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(firstBall.x, firstBall.y, firstBall.r + 10 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd60a';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('POP THIS', firstBall.x, firstBall.y - firstBall.r - 18);
      }
      ctx.restore();
    }
  }

  // Intro banner — slides down from above on appearance, fades on dismiss.
  if (game.introTimer > 0 && game.introText) {
    const a = clamp(game.introTimer / 4, 0, 1);
    // The intro starts at game.introTimer = 4 and counts down. "elapsed"
    // grows from 0 → 4. Slide-in eases over the first 350ms.
    const elapsed = 4 - game.introTimer;
    const slidePhase = Math.min(1, elapsed / 0.35);
    const easeOut = 1 - Math.pow(1 - slidePhase, 3);
    const offsetY = (1 - easeOut) * -80;  // start 80px above target, slide to 0
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, offsetY);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, W/2 - 300, H/2 - 60, 600, 120, 14, true, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,214,10,0.55)';
    roundRect(ctx, W/2 - 300, H/2 - 60, 600, 120, 14, false, true);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#ffd60a';
    ctx.textAlign = 'center';
    // Banner header: prefer introTitle when set (mode-specific framing),
    // otherwise fall back to the level's name.
    const bannerTitle = game.introTitle || game.levelName;
    ctx.fillText(bannerTitle, W/2, H/2 - 25);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#fff';
    const lines = game.introText.split('\n');
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W/2, H/2 + 5 + i * 22);
    ctx.restore();
  }
}
