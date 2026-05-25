import { DEATH_REASON_TEXT, H, State, W } from '../constants';
import { roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { consumeAnyInput, consumePressed, pointer, pointerHit, pointerOver } from '../systems/input';
import { Platform as Sdk } from '../systems/platform';
import { Storage } from '../systems/storage';
import { UI } from '../ui/domRoot';
import type { Game } from '../game';

// ---------------- PLAYER DEAD (between-deaths transition) ----------------
export function updatePlayerDead(game: Game, dt: number) {
  game.hitPause -= dt;
  if (game.hitPause <= 0) {
    if (game.lives > 0) {
      if (game.mode === 'panic') {
        if (game.player) game.respawnPlayer(game.player);
        game.state = State.PLAYING;
      } else {
        game.loadLevel(game.levelIndex);
      }
    } else {
      game.state = State.GAME_OVER;
    }
  }
  // Still tick particles for visual continuity during the freeze.
  for (const pt of game.particles) pt.update(dt);
  for (const sw of game.shockwaves) sw.update(dt);
  game.particles = game.particles.filter(p => !p.dead);
  game.shockwaves = game.shockwaves.filter(s => !s.dead);
}

// ---------------- GAME OVER ----------------
export function canRewardedContinue(game: Game): boolean {
  if (!Sdk.hasSDK) return false;
  if (game.usedRewardedContinue) return false;
  if (game.awaitingAd) return false;
  return game.mode === 'score_attack' || game.mode === 'panic' || game.mode === 'boss_rush';
}

export function getGameOverLayout() {
  const btnW = 280, btnH = 60;
  return {
    continueBtn: { x: W/2 - btnW/2, y: H - 170, w: btnW, h: btnH },
  };
}

/** Trigger a rewarded ad. On success, restore one life and resume the run. */
export function startRewardedContinue(game: Game) {
  game.awaitingAd = true;
  Sdk.requestRewardedAd().then(granted => {
    game.awaitingAd = false;
    if (!granted) return;
    game.usedRewardedContinue = true;
    game.lives = 1;
    if (game.mode === 'panic') {
      if (game.player) game.respawnPlayer(game.player);
      game.state = State.PLAYING;
    } else if (game.mode === 'score_attack' || game.mode === 'boss_rush') {
      // Reload the current level but keep score, queued bosses, and the
      // used-continue flag. Boss Rush specifically needs the queue preserved
      // so the continue resumes the gauntlet from this fight, not the start.
      const keepScore = game.score;
      const keepLevel = game.levelIndex;
      const keepQueue = game.bossRushQueue.slice();
      const keepCount = game.bossRushCount;
      game.loadLevel(keepLevel);
      game.score = keepScore;
      game.bossRushQueue = keepQueue;
      game.bossRushCount = keepCount;
      game.usedRewardedContinue = true; // _resetRunFlags is not called here
    }
  });
}

export function updateGameOver(game: Game) {
  // Escape always returns to main menu — consume it first so it can't fall through.
  if (consumePressed('Escape')) { game.state = State.MAIN_MENU; AudioSys.menu(); return; }
  if (game.awaitingAd) return;

  // Rewarded continue: a click on the continue button takes priority over the
  // "any input retries" fallback, so the player can't accidentally skip the offer.
  if (canRewardedContinue(game) && pointer.pressed) {
    const r = getGameOverLayout().continueBtn;
    if (pointerHit(r.x, r.y, r.w, r.h)) {
      pointer.pressed = false;
      AudioSys.menu();
      startRewardedContinue(game);
      return;
    }
  }
  // Any other key, click, or tap retries the run from scratch.
  if (consumeAnyInput()) {
    AudioSys.menu();
    if (game.mode === 'score_attack') game.startScoreAttack();
    else if (game.mode === 'panic') game.startPanic();
    else if (game.mode === 'boss_rush') game.startBossRush();
    else game.loadLevel(game.levelIndex);
  }
}

export function renderGameOver(game: Game) {
  if (UI.isHandledByHtml(State.GAME_OVER)) return;
  const ctx = game.ctx;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'bold 64px sans-serif'; ctx.fillStyle = '#ff4d6d'; ctx.textAlign = 'center';
  ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 6;
  ctx.strokeText('GAME OVER', W/2, H/2 - 40);
  ctx.fillText('GAME OVER', W/2, H/2 - 40);
  // Death reason — tells the player WHY they lost so it doesn't feel arbitrary.
  if (game.lastDeathReason) {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffd60a';
    ctx.fillText(DEATH_REASON_TEXT[game.lastDeathReason], W/2, H/2 - 4);
  }
  ctx.font = '26px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('Final Score: ' + game.score, W/2, H/2 + 26);
  const best = game.mode === 'score_attack' ? Storage.data.bestScoreAttack
              : game.mode === 'panic' ? Storage.data.bestPanicWave : 0;
  // Reward effort even on a loss — show the player they made progress.
  if (game.mode === 'panic') {
    const newBest = game.score >= Storage.data.bestPanicScore && game.score > 0;
    ctx.font = newBest ? 'bold 20px sans-serif' : '20px sans-serif';
    ctx.fillStyle = newBest ? '#ffd60a' : '#cfd6df';
    ctx.fillText('Reached Wave ' + game.panicWave + (newBest ? '  •  NEW BEST!' : ''), W/2, H/2 + 60);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#cfd6df';
    ctx.fillText('Best Wave: ' + Math.max(best, game.panicWave) + '   Best Score: ' + Math.max(Storage.data.bestPanicScore, game.score), W/2, H/2 + 86);
  } else if (game.mode === 'score_attack') {
    const newBest = game.score > best;
    ctx.font = newBest ? 'bold 20px sans-serif' : '20px sans-serif';
    ctx.fillStyle = newBest ? '#ffd60a' : '#cfd6df';
    ctx.fillText(newBest ? 'NEW BEST!' : 'Best Score: ' + best, W/2, H/2 + 60);
  } else if (game.mode === 'boss_rush') {
    const newCount = game.bossRushCount > (Storage.data.bestBossRushCount || 0);
    const newScore = game.score > (Storage.data.bestBossRush || 0);
    ctx.font = newCount ? 'bold 20px sans-serif' : '20px sans-serif';
    ctx.fillStyle = newCount ? '#ffd60a' : '#cfd6df';
    ctx.fillText('Bosses defeated: ' + game.bossRushCount + (newCount ? '  •  NEW BEST!' : ''), W/2, H/2 + 60);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#cfd6df';
    ctx.fillText('Best run: ' + Math.max(Storage.data.bestBossRushCount || 0, game.bossRushCount)
      + ' bosses  •  ' + Math.max(Storage.data.bestBossRush || 0, game.score) + ' score'
      + (newScore ? '  •  NEW SCORE!' : ''), W/2, H/2 + 86);
  }
  // Rewarded continue button (Score Attack / Panic only, when SDK present).
  if (canRewardedContinue(game)) {
    const r = getGameOverLayout().continueBtn;
    const hover = pointerOver(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hover ? '#ffd60a' : '#06d6a0';
    roundRect(ctx, r.x, r.y, r.w, r.h, 14, true, false);
    ctx.lineWidth = 3; ctx.strokeStyle = '#0a1832';
    roundRect(ctx, r.x, r.y, r.w, r.h, 14, false, true);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#0a1832';
    ctx.textAlign = 'center';
    ctx.fillText('▶  WATCH AD TO CONTINUE', r.x + r.w/2, r.y + 38);
  }

  if (game.awaitingAd) {
    ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#ffd60a';
    ctx.textAlign = 'center';
    ctx.fillText('Loading ad…', W/2, H - 60);
  } else {
    ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#ffd60a';
    ctx.textAlign = 'center';
    ctx.fillText('Press anything to retry', W/2, H - 60);
    ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Esc: main menu', W/2, H - 38);
  }
}
