import { CEILING_Y, H, W } from '../constants';
import { roundRect } from '../rendering/canvas';
import { isTouchButtonHeld, isTouchDevice, TOUCH_BUTTONS } from './input';
import type { Game } from '../game';

/** Translucent on-screen movement / fire / pause buttons. Renders nothing on
 *  desktop. Called from the playing-state renderer between particles and HUD
 *  so the score/timer overlay them. */
export function renderTouchControls(game: Game) {
  if (!isTouchDevice) return;
  const ctx = game.ctx;
  const drawBtn = (
    r: { x: number; y: number; w: number; h: number },
    held: boolean,
    paint: (cx: number, cy: number) => void,
  ) => {
    ctx.globalAlpha = held ? 0.55 : 0.22;
    ctx.fillStyle = held ? '#ffd60a' : '#0a1832';
    roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) / 2.5, true, false);
    ctx.globalAlpha = held ? 0.95 : 0.5;
    ctx.strokeStyle = held ? '#fff' : '#cfd6df';
    ctx.lineWidth = 3;
    roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) / 2.5, false, true);
    ctx.globalAlpha = 1;
    paint(r.x + r.w / 2, r.y + r.h / 2);
  };

  // LEFT arrow
  drawBtn(TOUCH_BUTTONS.left, isTouchButtonHeld('left'), (cx, cy) => {
    ctx.fillStyle = isTouchButtonHeld('left') ? '#0a1832' : '#fff';
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx + 14, cy - 28);
    ctx.lineTo(cx + 14, cy + 28);
    ctx.closePath();
    ctx.fill();
  });
  // RIGHT arrow
  drawBtn(TOUCH_BUTTONS.right, isTouchButtonHeld('right'), (cx, cy) => {
    ctx.fillStyle = isTouchButtonHeld('right') ? '#0a1832' : '#fff';
    ctx.beginPath();
    ctx.moveTo(cx + 22, cy);
    ctx.lineTo(cx - 14, cy - 28);
    ctx.lineTo(cx - 14, cy + 28);
    ctx.closePath();
    ctx.fill();
  });
  // FIRE button — arrow + "FIRE" label, sized to fit the compact 120×80 button.
  drawBtn(TOUCH_BUTTONS.fire, isTouchButtonHeld('fire'), (cx, cy) => {
    const held = isTouchButtonHeld('fire');
    ctx.fillStyle = held ? '#0a1832' : '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx - 18, cy + 2);
    ctx.lineTo(cx - 8, cy + 2);
    ctx.lineTo(cx - 8, cy + 18);
    ctx.lineTo(cx + 8, cy + 18);
    ctx.lineTo(cx + 8, cy + 2);
    ctx.lineTo(cx + 18, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE', cx, cy + 34);
  });
  // PAUSE button (top-right) — boosted contrast so a new mobile player can
  // always find it. The base alpha was 0.22 which made it nearly invisible
  // against bright backgrounds (beach/desert).
  const pHeld = isTouchButtonHeld('pause');
  const p = TOUCH_BUTTONS.pause;
  ctx.globalAlpha = pHeld ? 0.75 : 0.55;
  ctx.fillStyle = pHeld ? '#ffd60a' : '#0a1832';
  roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) / 2.5, true, false);
  ctx.globalAlpha = pHeld ? 1 : 0.85;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) / 2.5, false, true);
  ctx.globalAlpha = 1;
  // Pause bars
  ctx.fillStyle = pHeld ? '#0a1832' : '#fff';
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  ctx.fillRect(cx - 8, cy - 9, 5, 18);
  ctx.fillRect(cx + 3, cy - 9, 5, 18);
}

/** Top-bar HUD: score, weapon, timer/wave, combo, lives, level name, effect
 *  chips, P2 status, boss health bar. */
export function renderHUD(game: Game) {
  const ctx = game.ctx;
  // Top bar background
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, CEILING_Y);

  // --- LEFT: score + weapon ---
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('SCORE  ' + game.score.toString().padStart(7, '0'), 24, 22);

  const p = game.player;
  if (p) {
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = p.weapon === 'harpoon' ? 'rgba(255,255,255,0.7)' : '#ffd60a';
    let wlabel = p.weapon.toUpperCase();
    if (p.weaponAmmo > 0) wlabel += ' ×' + p.weaponAmmo;
    else if (p.weaponTime > 0) wlabel += ' ' + Math.ceil(p.weaponTime) + 's';
    ctx.fillText(wlabel, 24, 40);
    if (p.shield) {
      ctx.fillStyle = '#3a86ff';
      ctx.fillText('• SHIELD', 24 + ctx.measureText(wlabel).width + 12, 40);
    }
  }

  // --- CENTER: timer/wave + combo underneath ---
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px sans-serif';
  if (game.mode === 'panic') {
    ctx.fillStyle = '#ffd60a';
    ctx.fillText('WAVE ' + game.panicWave, W/2, 28);
    // Rainbow Gauge — Pang's iconic panic-mode progress bar. The gradient runs
    // through six hues so each filled segment reads as a distinct rainbow band.
    const gw = 220, gh = 7;
    const gx = W/2 - gw/2, gy = 50;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, gx - 1, gy - 1, gw + 2, gh + 2, 3, true, false);
    const stripe = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    stripe.addColorStop(0.00, '#ff4d6d');
    stripe.addColorStop(0.20, '#ff7f50');
    stripe.addColorStop(0.40, '#ffd60a');
    stripe.addColorStop(0.60, '#06d6a0');
    stripe.addColorStop(0.80, '#3a86ff');
    stripe.addColorStop(1.00, '#9e7bff');
    const ratio = Math.max(0, Math.min(1, game.panicGauge / game.panicGaugeMax));
    ctx.fillStyle = stripe;
    ctx.fillRect(gx, gy, gw * ratio, gh);
    ctx.restore();
  } else {
    const lowTime = game.timer < 10;
    ctx.fillStyle = lowTime ? (Math.floor(game.timer * 4) % 2 ? '#ff4d6d' : '#fff') : '#fff';
    ctx.fillText(Math.ceil(game.timer) + 's', W/2, 28);
  }
  if (game.combo > 1) {
    const comboColor = game.combo >= 10 ? '#ff36c4' : game.combo >= 5 ? '#ffd60a' : '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = comboColor;
    const pulse = 1 + Math.min(game.combo / 20, 1) * Math.sin(performance.now() / 80) * 0.05;
    ctx.save();
    ctx.translate(W/2, 46);
    ctx.scale(pulse, pulse);
    ctx.fillText('COMBO ×' + game.combo, 0, 0);
    ctx.restore();
  }

  // --- RIGHT: lives + level name ---
  // On touch devices the canvas pause button sits in the top-right corner;
  // shift the right-aligned HUD elements left so they don't collide with it.
  const rightInset = isTouchDevice ? 64 : 24;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff4d6d';
  let lx = W - rightInset;
  for (let i = 0; i < game.lives; i++) {
    ctx.beginPath();
    ctx.arc(lx, 22, 6, 0, Math.PI * 2);
    ctx.fill();
    lx -= 16;
  }
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText(game.levelName, W - rightInset, 42);

  // --- Active effect chips (only when active) ---
  const effects: string[] = [];
  if (game.slowTime > 0) effects.push('SLOW ' + Math.ceil(game.slowTime));
  if (game.freezeTime > 0) effects.push('FREEZE ' + Math.ceil(game.freezeTime));
  if (game.magnetTime > 0) effects.push('MAGNET ' + Math.ceil(game.magnetTime));
  if (game.comboBoostTime > 0) effects.push('BOOST ' + Math.ceil(game.comboBoostTime));
  if (game.player && game.player.weaponDisabled > 0) effects.push('JAMMED ' + Math.ceil(game.player.weaponDisabled));
  if (game.mode === 'boss_rush') effects.push('BOSS ' + (game.bossRushCount + 1));
  if (effects.length) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(effects.join('   '), W/2, H - 12);
  }

  // --- Player 2 status (only when actually joined) ---
  if (game.player2) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#9be7ff';
    const p2Status = game.player2.dead
      ? 'P2 RESPAWN ' + Math.ceil(game.player2.respawnTimer)
      : 'P2: ' + game.player2.weapon.toUpperCase();
    ctx.fillText(p2Status, 200, 40);
  }

  // --- Boss health bar ---
  if (game.boss && !game.boss.dead) {
    const bw = 360, bh = 14;
    const bx = W/2 - bw/2, by = H - 32;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 4, true, false);
    ctx.fillStyle = '#3a0a26';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff2b88';
    ctx.fillRect(bx, by, bw * (game.boss.hp / game.boss.maxHp), bh);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('COMMANDER RIFT', W/2, by - 4);
  }
}
