import { H, State, W } from '../constants';
import { roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { consumePressed, isTouchDevice, pointer, pointerHit, pointerOver } from '../systems/input';
import { Storage } from '../systems/storage';
import { UI } from '../ui/domRoot';
import type { Game } from '../game';

export interface PauseButton {
  key: 'restart' | 'resume' | 'menu';
  label: string;
  x: number; y: number; w: number; h: number;
}

export function getPauseButtons(): PauseButton[] {
  const btnW = 180, btnH = 56, gap = 16;
  const totalW = btnW * 3 + gap * 2;
  const startX = W / 2 - totalW / 2;
  const y = H - 110;
  return [
    { key: 'restart', label: 'RESTART', x: startX,                       y, w: btnW, h: btnH },
    { key: 'resume',  label: 'RESUME',  x: startX + (btnW + gap),        y, w: btnW, h: btnH },
    { key: 'menu',    label: 'MENU',    x: startX + (btnW + gap) * 2,    y, w: btnW, h: btnH },
  ];
}

/** Reduced-motion accessibility toggle. Sits left of the mute toggle. */
export function getPauseToggleRect() {
  const reducedW = 280, muteW = 130, gap = 12, h = 40;
  const totalW = reducedW + gap + muteW;
  const startX = W/2 - totalW / 2;
  return { x: startX, y: H - 178, w: reducedW, h };
}

/** Mute toggle. Sits to the right of the reduced-motion toggle. */
export function getPauseMuteRect() {
  const reduced = getPauseToggleRect();
  return { x: reduced.x + reduced.w + 12, y: reduced.y, w: 130, h: 40 };
}

function restartCurrentRun(game: Game) {
  if (game.mode === 'panic') return game.startPanic();
  if (game.mode === 'score_attack') return game.startScoreAttack();
  return game.loadLevel(game.levelIndex);
}

export function updatePaused(game: Game) {
  if (consumePressed('KeyP') || consumePressed('Escape')) { game.state = State.PLAYING; AudioSys.menu(); return; }
  if (consumePressed('Enter')) { game.state = State.MAIN_MENU; AudioSys.menu(); return; }
  if (consumePressed('KeyR')) { restartCurrentRun(game); return; }
  // M is the canonical mute key everywhere else in the app — make it work from
  // pause too so a player can adjust audio without using the pointer.
  if (consumePressed('KeyM')) { AudioSys.toggle(); AudioSys.menu(); return; }
  // Pause-screen buttons (touch + desktop click).
  if (pointer.pressed) {
    const t = getPauseToggleRect();
    if (pointerHit(t.x, t.y, t.w, t.h)) {
      pointer.pressed = false;
      AudioSys.menu();
      Storage.data.reducedMotion = !Storage.data.reducedMotion;
      Storage.save();
      return;
    }
    const m = getPauseMuteRect();
    if (pointerHit(m.x, m.y, m.w, m.h)) {
      pointer.pressed = false;
      // AudioSys.toggle() persists Storage.data.muted on its own.
      AudioSys.toggle();
      AudioSys.menu();
      return;
    }
    for (const b of getPauseButtons()) {
      if (pointerHit(b.x, b.y, b.w, b.h)) {
        pointer.pressed = false;
        AudioSys.menu();
        if (b.key === 'resume') game.state = State.PLAYING;
        else if (b.key === 'menu') game.state = State.MAIN_MENU;
        else if (b.key === 'restart') restartCurrentRun(game);
        return;
      }
    }
  }
}

export function renderPause(game: Game) {
  if (UI.isHandledByHtml(State.PAUSED)) return;
  const ctx = game.ctx;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);

  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', W/2, 140);

  // Level + target
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffd60a';
  ctx.fillText(game.levelName, W/2, 180);
  if (game.mode === 'tour' || game.mode === 'score_attack') {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#cfd6df';
    ctx.fillText('Target Score: ' + game.targetScore, W/2, 206);
  }

  // Controls panel — keyboard hints on desktop, on-screen reminder on touch.
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('CONTROLS', W/2, 260);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#fff';
  const lines = isTouchDevice
    ? ['Use the on-screen buttons to move and fire.']
    : ['A / ←  D / →   Move',
       'Space / W / ↑   Shoot',
       'P / Esc   Pause      R   Restart',
       'M   Toggle Sound'];
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W/2, 286 + i * 22);

  // P2 hint — desktop only, and only once the player has some experience.
  if (!game.player2 && game.unlockedLevel >= 3 && !isTouchDevice) {
    ctx.fillStyle = '#9be7ff';
    ctx.font = '15px sans-serif';
    ctx.fillText('Two players? Press I / K / U to bring P2 in.', W/2, 286 + lines.length * 22 + 10);
  }

  // Reduced-motion accessibility toggle.
  const tg = getPauseToggleRect();
  const tgHover = pointerOver(tg.x, tg.y, tg.w, tg.h);
  const tgOn = !!Storage.data.reducedMotion;
  ctx.fillStyle = tgOn ? 'rgba(155,231,255,0.85)' : 'rgba(0,0,0,0.55)';
  roundRect(ctx, tg.x, tg.y, tg.w, tg.h, 10, true, false);
  ctx.lineWidth = 2;
  ctx.strokeStyle = tgHover ? '#fff' : 'rgba(255,255,255,0.4)';
  roundRect(ctx, tg.x, tg.y, tg.w, tg.h, 10, false, true);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = tgOn ? '#0a1832' : '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('Reduced Motion: ' + (tgOn ? 'ON' : 'OFF'), tg.x + tg.w / 2, tg.y + 26);

  // Mute toggle — sits to the right. Reachable mid-run on touch and desktop
  // alike, satisfying CrazyGames quality guidance that audio control must
  // never require leaving the run.
  const mt = getPauseMuteRect();
  const mtHover = pointerOver(mt.x, mt.y, mt.w, mt.h);
  const mtOn = !!AudioSys.muted;
  ctx.fillStyle = mtOn ? 'rgba(255,77,109,0.85)' : 'rgba(0,0,0,0.55)';
  roundRect(ctx, mt.x, mt.y, mt.w, mt.h, 10, true, false);
  ctx.lineWidth = 2;
  ctx.strokeStyle = mtHover ? '#fff' : 'rgba(255,255,255,0.4)';
  roundRect(ctx, mt.x, mt.y, mt.w, mt.h, 10, false, true);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = mtOn ? '#fff' : '#fff';
  ctx.textAlign = 'center';
  ctx.fillText((mtOn ? '🔇 Muted' : '🔊 Sound'), mt.x + mt.w / 2, mt.y + 26);

  // Bottom action buttons — work via click/tap on every platform.
  for (const b of getPauseButtons()) {
    const hover = pointerOver(b.x, b.y, b.w, b.h);
    const primary = b.key === 'resume';
    ctx.fillStyle = primary
      ? (hover ? '#ffd60a' : '#ff7f50')
      : (hover ? 'rgba(255,214,10,0.85)' : 'rgba(0,0,0,0.55)');
    roundRect(ctx, b.x, b.y, b.w, b.h, 12, true, false);
    ctx.lineWidth = 3;
    ctx.strokeStyle = primary ? '#0a1832' : (hover ? '#fff' : 'rgba(255,255,255,0.4)');
    roundRect(ctx, b.x, b.y, b.w, b.h, 12, false, true);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = primary ? '#0a1832' : (hover ? '#0a1832' : '#fff');
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 36);
  }
}
