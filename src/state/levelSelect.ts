import { H, State, THEMES, W } from '../constants';
import { LEVELS } from '../data/levels';
import { drawBackground, roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { consumeAnyConfirm, consumePressed, pointer, pointerHit } from '../systems/input';
import { Storage } from '../systems/storage';
import { UI } from '../ui/domRoot';
import type { Game } from '../game';

// Layout constants shared by update (hit-testing) and render.
const COLS = 5;
const CELL_W = 168;
const CELL_H = 68;
const GAP = 8;
const START_Y = 130;

function gridOrigin() {
  return W/2 - (COLS * (CELL_W + GAP) - GAP) / 2;
}

export function updateLevelSelect(game: Game) {
  const maxLevel = LEVELS.length - 1;
  if (consumePressed('ArrowLeft')  || consumePressed('KeyA')) { game.levelSelectIndex = Math.max(0, game.levelSelectIndex - 1); AudioSys.menu(); }
  if (consumePressed('ArrowRight') || consumePressed('KeyD')) { game.levelSelectIndex = Math.min(maxLevel, game.levelSelectIndex + 1); AudioSys.menu(); }
  if (consumePressed('ArrowUp')    || consumePressed('KeyW')) { game.levelSelectIndex = Math.max(0, game.levelSelectIndex - COLS); AudioSys.menu(); }
  if (consumePressed('ArrowDown')  || consumePressed('KeyS')) { game.levelSelectIndex = Math.min(maxLevel, game.levelSelectIndex + COLS); AudioSys.menu(); }
  if (consumePressed('Escape')) { game.state = State.MAIN_MENU; AudioSys.menu(); return; }
  // Click on a tile = pick + start.
  if (pointer.pressed) {
    const startX = gridOrigin();
    for (let i = 0; i < LEVELS.length; i++) {
      const cx = startX + (i % COLS) * (CELL_W + GAP);
      const cy = START_Y + Math.floor(i / COLS) * (CELL_H + GAP);
      if (pointerHit(cx, cy, CELL_W, CELL_H)) {
        pointer.pressed = false;
        game.levelSelectIndex = i;
        AudioSys.menu();
        game.startTour(i);
        return;
      }
    }
  }
  if (consumeAnyConfirm()) {
    AudioSys.menu();
    game.startTour(game.levelSelectIndex);
  }
}

export function renderLevelSelect(game: Game) {
  if (UI.isHandledByHtml(State.LEVEL_SELECT)) return;
  const ctx = game.ctx;
  drawBackground(ctx, 'arctic', game.t);
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText('LEVEL SELECT', W/2, 80);
  ctx.fillText('LEVEL SELECT', W/2, 80);
  const startX = gridOrigin();
  for (let i = 0; i < LEVELS.length; i++) {
    const cx = startX + (i % COLS) * (CELL_W + GAP);
    const cy = START_Y + Math.floor(i / COLS) * (CELL_H + GAP);
    const L = LEVELS[i];
    const isSel = i === game.levelSelectIndex;
    ctx.fillStyle = isSel ? 'rgba(255,214,10,0.3)' : 'rgba(0,0,0,0.4)';
    roundRect(ctx, cx, cy, CELL_W, CELL_H, 10, true, false);
    ctx.strokeStyle = isSel ? '#ffd60a' : '#fff';
    ctx.lineWidth = isSel ? 3 : 1;
    roundRect(ctx, cx, cy, CELL_W, CELL_H, 10, false, true);
    // Theme color band
    const T = THEMES[L.theme];
    ctx.fillStyle = T.acc;
    ctx.fillRect(cx + 8, cy + 8, 8, CELL_H - 16);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('Lv ' + (i + 1), cx + 24, cy + 24);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(L.name, cx + 24, cy + 46);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#cfd6df';
    ctx.fillText(L.theme.toUpperCase(), cx + 24, cy + 61);
    const best = Storage.data.bestTour[L.id] || 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd60a';
    ctx.fillText('Best: ' + best, cx + CELL_W - 10, cy + 61);
    // Medal pip (top-right corner of tile)
    const tier = Storage.data.medals[L.id] || 0;
    if (tier > 0) {
      const medalColors = ['', '#cd7f32', '#cfcfcf', '#ffd60a']; // bronze, silver, gold
      ctx.fillStyle = medalColors[tier];
      ctx.beginPath();
      ctx.arc(cx + CELL_W - 14, cy + 14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('← → ↑ ↓ select    Enter play    Esc back', W/2, H - 18);
}
