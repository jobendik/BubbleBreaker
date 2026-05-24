import { BALL_COLORS, BALL_SCORE, H, State, W, type DeathReason } from '../constants';
import { LEVELS } from '../data/levels';
import type { Ball } from '../entities/ball';
import { FloatingText, Particle, Shockwave } from '../entities/particle';
import { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import { rand } from '../utils';
import { emit } from './analytics';
import { AudioSys } from './audio';
import { medalFor, recordDailyAttempt } from './daily';
import { Platform as Sdk } from './platform';
import { Storage } from './storage';
import { markTitlesSeen, newlyEarnedTitles } from './titles';
import type { Game } from '../game';

/**
 * Pop a ball with full feedback: score, combo, particles, shockwave, sound,
 * combo-milestone fanfare, then run the ball's hit() to spawn child balls.
 * Invoked from the per-frame collision pass and from explosive chain reactions.
 */
export function popBall(game: Game, ball: Ball, source: any) {
  if (ball.dead) return;
  const baseScore = BALL_SCORE[ball.size];
  const boost = game.comboBoostTime > 0 ? 0.5 : 0;
  const comboMult = 1 + boost + Math.min(game.combo, 20) * 0.05;
  const dailyMult = game.modifier === 'double_score' ? 2 : 1;
  const gained = Math.round(baseScore * comboMult * dailyMult);
  game.addScore(gained);
  game.floatingTexts.push(new FloatingText(ball.x, ball.y - 10, '+' + gained, game.combo >= 5 ? '#ffd60a' : '#fff'));

  // ---------- Multi-pop chain bookkeeping ----------
  // Every popBall call extends a short-lived window. When the window closes
  // (in playing.ts) and >=2 pops landed, we emit ONE label at the centroid
  // instead of N separate ones — that's the whole anti-clutter mechanism.
  game.chainCount++;
  game.chainTimer = 0.18;
  // Running centroid so MEGA POPs render near the actual blast center.
  game.chainCx = (game.chainCx * (game.chainCount - 1) + ball.x) / game.chainCount;
  game.chainCy = (game.chainCy * (game.chainCount - 1) + ball.y) / game.chainCount;

  // ---------- Trick chip detection (priority-ordered, max one per pop) ----------
  // Each trick is a small bonus + small chip rendered at the ball's position.
  // Suppress while the multi-pop chain is already running so we never stack
  // a trick chip on top of an incoming chain label at the same location.
  let trickLabel = '', trickBonus = 0, trickColor = '#9be7ff';
  const isLastBall = game.balls.filter(b => !b.dead && b !== ball).length === 0;
  const aliveTime = ball.age;
  const timeSinceWall = ball.age - ball.lastWallTime;
  const playerDist = game.player
    ? Math.hypot(ball.x - game.player.x, ball.y - (game.player.y - 22))
    : Infinity;
  // CLUTCH: last ball on a timed level, taken with under 3 seconds left.
  if (isLastBall && game.mode !== 'panic' && game.timer > 0 && game.timer < 3) {
    trickLabel = 'CLUTCH!'; trickBonus = 150; trickColor = '#ff36c4';
  } else if (playerDist < 90 && !ball.dead) {
    // CLOSE CALL: ball within ~90px of player's head when popped. Real skill
    // because the player chose not to retreat from a falling ball.
    trickLabel = 'CLOSE CALL'; trickBonus = 75; trickColor = '#ff7f50';
  } else if (ball.floorBounces === 0 && aliveTime > 0.4) {
    // AIR POP: ball alive long enough to have hit the floor by physics, but
    // the player got it first. Excludes freshly-spawned child balls.
    trickLabel = 'AIR POP'; trickBonus = 60; trickColor = '#9be7ff';
  } else if (timeSinceWall >= 0 && timeSinceWall < 0.35) {
    // BANK SHOT: popped within 0.35s of the ball ricocheting off a wall.
    trickLabel = 'BANK SHOT'; trickBonus = 50; trickColor = '#06d6a0';
  }
  if (trickLabel) {
    const trickGained = Math.round(trickBonus * dailyMult);
    game.addScore(trickGained);
    game.runTricks++;
    Storage.data.lifetimeTricks = (Storage.data.lifetimeTricks || 0) + 1;
    // Small chip near the ball, offset upward so it doesn't overlap the +score.
    game.floatingTexts.push(new FloatingText(ball.x, ball.y - 36, trickLabel, trickColor, 14));
  }

  // Lifetime pops counter — drives the Marksman title; debounced via the
  // existing Storage.save() at combo-decay save points below.
  Storage.data.lifetimePops = (Storage.data.lifetimePops || 0) + 1;
  const prevCombo = game.combo;
  game.combo++;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  // Track lifetime combo to drive the Combo Crusher title.
  if (game.combo > (Storage.data.lifetimeMaxCombo || 0)) {
    Storage.data.lifetimeMaxCombo = game.combo;
    // Defer save to combo-decay tick? No — combo events are infrequent enough
    // that a localStorage write per new max is fine, and we want the value
    // persisted even if the player closes the tab mid-run.
    Storage.save();
  }
  game.comboDecay = 4;
  game.shotsHit++;
  if (source && 'didHit' in source) source.didHit = true;
  AudioSys.pop(ball.size, ball.type);
  // First-pop is the most important conversion signal: "the player got to
  // gameplay AND took a successful action." Emit at most once per session.
  if (!game.sessionFirstPopEmitted) {
    game.sessionFirstPopEmitted = true;
    emit('first_pop', { mode: game.mode, level: game.levelIndex });
    // Visual celebration: only fires the very first time this player ever pops
    // a ball, persisted across sessions so returning players aren't pestered.
    if (!Storage.data.firstPopCelebrated) {
      Storage.data.firstPopCelebrated = true;
      Storage.save();
      game.floatingTexts.push(new FloatingText(W/2, H/2 - 30, 'FIRST POP!', '#ffd60a', 56));
      game.floatingTexts.push(new FloatingText(W/2, H/2 + 14, 'nice — keep popping', '#fff', 18));
      // Bigger, brighter shockwave centered on the ball + a softer one in the
      // middle of the screen so the moment reads from anywhere on the canvas.
      game.shockwaves.push(new Shockwave(ball.x, ball.y, 160, '#ffd60a', 0.55));
      game.shockwaves.push(new Shockwave(W/2, H/2 - 10, 220, '#fff', 0.7));
      game.flash = Math.max(game.flash, 0.35);
      AudioSys.firstPop();
    }
  }

  // Pop feedback scales with ball size.
  const color = BALL_COLORS[ball.type] ? BALL_COLORS[ball.type][0] : '#fff';
  const sz = ball.size;
  const burstCount = 8 + sz * 6;
  const burstMaxSpeed = 160 + sz * 30;
  const burstSize = 4 + sz * 2;
  const burstLifeMin = 0.3 + sz * 0.05;
  const burstLifeMax = 0.55 + sz * 0.08;
  for (let i = 0; i < burstCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(60, burstMaxSpeed);
    game.particles.push(new Particle(
      ball.x, ball.y,
      Math.cos(a) * s, Math.sin(a) * s,
      rand(burstLifeMin, burstLifeMax), color, burstSize, 100,
    ));
  }
  game.shockwaves.push(new Shockwave(ball.x, ball.y, 42 + sz * 22, color, 0.26 + sz * 0.04));

  // Combo milestone: every 5 combo, big floating text + chime + radial flash.
  // This is the moment the launch-pack listing copy is promising
  // ("chain pops for big combos") — it must read as a screen-wide payoff,
  // not a small tooltip.
  if (prevCombo < game.combo) {
    const milestone = game.combo === 5 ? 1 : game.combo === 10 ? 2 : game.combo === 15 ? 3 : game.combo === 20 ? 4 : 0;
    if (milestone > 0) {
      const label = ['', 'NICE!', 'WILD!', 'INSANE!', 'GODLIKE!'][milestone];
      const tint  = ['', '#ffd60a', '#ff7f50', '#ff36c4', '#9be7ff'][milestone];
      // Size and screen punch scale with the milestone tier so the player feels
      // the music swelling as they chain more.
      const titleSize = 44 + milestone * 8;          // 52, 60, 68, 76
      const subtitleSize = 18 + milestone * 2;       // 20, 22, 24, 26
      game.floatingTexts.push(new FloatingText(W/2, H/2 - 36, label, tint, titleSize));
      game.floatingTexts.push(new FloatingText(W/2, H/2 + 18, game.combo + ' COMBO', '#fff', subtitleSize));
      // Centered shockwave so the eye is drawn to the middle of the screen
      // for the milestone moment, and a screen flash for the bigger tiers.
      game.shockwaves.push(new Shockwave(W/2, H/2 - 10, 180 + milestone * 40, tint, 0.45 + milestone * 0.05));
      game.flash = Math.max(game.flash, 0.12 + milestone * 0.05);
      game.shake = Math.max(game.shake, 4 + milestone * 2);
      AudioSys.comboHit(milestone);
    }
  }

  const children = ball.hit(game, source);
  if (children) {
    if (children.length > 0) {
      AudioSys.split();
      game.balls.push(...children);
    }
    ball.dead = true;
  }
  game.hitPause = 0.04;

  // Title-unlock detection. Most pops won't unlock anything — newlyEarnedTitles
  // returns [] in steady state — so this is cheap. When something DOES unlock,
  // show ONE toast (highest-priority new title) and mark all of them as seen so
  // we never spam the screen with multiple chips for the same pop.
  const newTitles = newlyEarnedTitles();
  if (newTitles.length > 0) {
    const t = newTitles[0]; // priority-ordered already
    game.floatingTexts.push(new FloatingText(W/2, H/2 - 40, 'TITLE UNLOCKED', '#9be7ff', 16));
    game.floatingTexts.push(new FloatingText(W/2, H/2 - 8,  t.label.toUpperCase(), '#ffd60a', 32));
    // Lengthen this toast so it reads at any sensible glance.
    const last = game.floatingTexts[game.floatingTexts.length - 1];
    last.life = 2.0; last.maxLife = 2.0;
    const second = game.floatingTexts[game.floatingTexts.length - 2];
    second.life = 2.0; second.maxLife = 2.0;
    AudioSys.firstPop(); // reuse the bigger-than-combo fanfare — it sounds right
    markTitlesSeen(newTitles.map(n => n.id));
  }
}

export function explodeProjectile(game: Game, projectile: Projectile, x: number, y: number) {
  if (projectile.dead) return;
  projectile.dead = true;
  projectile.didHit = true;
  AudioSys.explode();
  game.flash = Math.max(game.flash, 0.18);
  game.shake = Math.max(game.shake, 10);
  const radius = projectile.explosionRadius || 90;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(90, 260);
    game.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.35, 0.75), i % 2 ? '#ff5400' : '#ffd60a', 8, 180));
  }
  for (const b of game.balls) {
    if (b.dead) continue;
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy < (radius + b.r) * (radius + b.r)) popBall(game, b, projectile);
  }
  for (const d of game.destructibles) {
    if (d.dead) continue;
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    const dx = cx - x, dy = cy - y;
    if (dx * dx + dy * dy < radius * radius) {
      d.dead = true;
      game.addScore(100);
      if (d.contains) game.pickups.push(new Pickup(cx, cy, d.contains));
    }
  }
  if (game.boss && !game.boss.dead) {
    const dx = game.boss.x - x, dy = game.boss.y - y;
    if (dx * dx + dy * dy < (radius + game.boss.r) * (radius + game.boss.r)) game.boss.hit(game, 4);
  }
  game.hitPause = 0.06;
}

export function killPlayer(game: Game, player: Player, reason: DeathReason = 'unknown') {
  if (player.invuln > 0 || player.dead) return;
  if (player.shield) {
    player.shield = false;
    player.invuln = 1.0;
    AudioSys.shieldBreak();
    game.flash = 0.15;
    game.shake = 6;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(120, 250);
      game.particles.push(new Particle(player.x, player.y - 24, Math.cos(a)*s, Math.sin(a)*s, 0.4, '#3a86ff', 5));
    }
    return;
  }
  player.dead = true;
  game.lastDeathReason = reason;
  AudioSys.hurt();
  game.shake = 18; game.flash = 0.3;
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(80, 220);
    game.particles.push(new Particle(player.x, player.y - 24, Math.cos(a)*s, Math.sin(a)*s, 0.7, '#ff4d6d', 6, 200));
  }
  game.combo = 0;
  game.lives--;
  if (game.lives <= 0) {
    emit('run.fail', { mode: game.mode, level: game.levelIndex, score: game.score, reason });
    // Daily challenge: any failed run is still a logged attempt; go to the result screen.
    if (game.mode === 'daily') {
      recordDailyAttempt(game.score);
      game.dailyResultScore = game.score;
      game.dailyResultShareCopied = 0;
      game.state = State.DAILY_RESULT;
      return;
    }
    game.state = State.GAME_OVER;
    game.saveRunBest();
  } else if (game.player2) {
    player.respawnTimer = 1.8;
    game.floatingTexts.push(new FloatingText(player.x, player.y - 42, player.isP2 ? 'P2 DOWN' : 'P1 DOWN', '#ff4d6d', 20));
  } else {
    game.state = State.PLAYER_DEAD;
    game.hitPause = 1.2;
  }
}

export function clearLevel(game: Game) {
  AudioSys.levelClear();
  Sdk.happytime();
  emit('level.clear', { mode: game.mode, level: game.levelIndex, score: game.score, timer: Math.max(0, Math.round(game.timer)) });
  game.flash = 0.3;
  const timeBonus = Math.round(game.timer) * 30;
  const accuracy = game.shotsFired > 0 ? (game.shotsHit / game.shotsFired) : 0;
  const accuracyBonus = Math.round(accuracy * 1500);
  const comboBonus = game.maxCombo * 50;
  const noMissBonus = (game.shotsFired === game.shotsHit && game.shotsFired > 0) ? 2000 : 0;
  const total = timeBonus + accuracyBonus + comboBonus + noMissBonus;
  game.addScore(total);

  // Daily run finishes via the daily result screen.
  if (game.mode === 'daily') {
    recordDailyAttempt(game.score);
    game.dailyResultScore = game.score;
    game.dailyResultShareCopied = 0;
    game.state = State.DAILY_RESULT;
    return;
  }

  const L = LEVELS[game.levelIndex];
  if (L && game.mode === 'tour') {
    const cur = Storage.data.bestTour[L.id] || 0;
    if (game.score > cur) Storage.data.bestTour[L.id] = game.score;
    const newTier = medalFor(game.score, L.targetScore);
    const prevTier = Storage.data.medals[L.id] || 0;
    if (newTier > prevTier) Storage.data.medals[L.id] = newTier;
    game.unlockedLevel = Math.max(game.unlockedLevel, game.levelIndex + 1);
    Storage.data.unlockedLevel = game.unlockedLevel;
    Storage.save();
  } else if (L && game.mode === 'score_attack') {
    const cur = Storage.data.bestTour[L.id] || 0;
    if (game.score > cur) { Storage.data.bestTour[L.id] = game.score; Storage.save(); }
  }

  // NEW COMBO BEST detection: compare this run's combo apex against the
  // snapshot taken at level start (preRunMaxCombo). The actual lifetime
  // counter is bumped live in popBall as the combo grows, so we can't
  // compare to that — preRunMaxCombo is the frozen "before" value.
  const newComboBest = game.maxCombo > game.preRunMaxCombo && game.maxCombo >= 5;
  game.summary = {
    base: game.score - total,
    time: timeBonus, accuracy: accuracyBonus, combo: comboBonus, noMiss: noMissBonus,
    total: game.score,
    best: L ? (Storage.data.bestTour[L.id] || 0) : 0,
    tricks: game.runTricks,
    newComboBest,
  };

  game.state = State.LEVEL_CLEAR;
}
