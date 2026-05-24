import { H, State, W } from '../constants';
import { drawBackground, roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { consumeAnyConfirm, consumePressed, pointer, pointerHit } from '../systems/input';
import { Storage } from '../systems/storage';
import type { Game } from '../game';

const MODE_ITEMS = [
  { title: 'TOUR',         desc: 'The campaign. 18 stages across 6 worlds + boss.' },
  { title: 'SCORE ATTACK', desc: '3 lives, no continues. Beat your best.' },
  { title: 'PANIC MODE',   desc: 'Endless waves with a Rainbow Gauge and Star Bubbles.' },
  { title: 'BOSS RUSH',    desc: 'Defeat every boss in sequence. No retries.' },
  { title: 'BACK',         desc: 'Return to main menu.' },
];

export function updateModeSelect(game: Game) {
  const items = MODE_ITEMS.length;
  if (consumePressed('ArrowUp')   || consumePressed('KeyW')) { game.modeSelectIndex = (game.modeSelectIndex - 1 + items) % items; AudioSys.menu(); }
  if (consumePressed('ArrowDown') || consumePressed('KeyS')) { game.modeSelectIndex = (game.modeSelectIndex + 1) % items; AudioSys.menu(); }
  if (consumePressed('Escape')) { game.state = State.MAIN_MENU; AudioSys.menu(); return; }
  // Click on a row picks it directly (then falls through to confirm).
  if (pointer.pressed) {
    for (let i = 0; i < items; i++) {
      const y = 200 + i * 70;
      if (pointerHit(W/2 - 280, y - 30, 560, 56)) {
        game.modeSelectIndex = i;
        pointer.pressed = false;
        break;
      }
    }
  }
  if (consumeAnyConfirm()) {
    AudioSys.menu();
    if (game.modeSelectIndex === 0) game.state = State.LEVEL_SELECT;
    else if (game.modeSelectIndex === 1) game.startScoreAttack();
    else if (game.modeSelectIndex === 2) game.startPanic();
    else if (game.modeSelectIndex === 3) game.startBossRush();
    else if (game.modeSelectIndex === 4) game.state = State.MAIN_MENU;
  }
}

export function renderModeSelect(game: Game) {
  const ctx = game.ctx;
  drawBackground(ctx, 'desert', game.t);
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.strokeText('SELECT MODE', W/2, 120);
  ctx.fillText('SELECT MODE', W/2, 120);

  for (let i = 0; i < MODE_ITEMS.length; i++) {
    const sel = i === game.modeSelectIndex;
    const y = 200 + i * 70;
    ctx.fillStyle = sel ? 'rgba(255,214,10,0.2)' : 'rgba(0,0,0,0.3)';
    roundRect(ctx, W/2 - 280, y - 30, 560, 56, 10, true, false);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = sel ? '#ffd60a' : '#fff';
    ctx.textAlign = 'left';
    ctx.fillText((sel ? '▶ ' : '  ') + MODE_ITEMS[i].title, W/2 - 260, y);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#cfd6df';
    ctx.fillText(MODE_ITEMS[i].desc, W/2 - 260, y + 22);
  }
  ctx.textAlign = 'right';
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText('Best Score Attack: ' + Storage.data.bestScoreAttack, W - 24, H - 36);
  ctx.fillText('Best Panic Wave: ' + Storage.data.bestPanicWave, W - 24, H - 18);
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Esc back', W/2, H - 36);
}
