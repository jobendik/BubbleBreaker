import { H, State, W } from '../constants';
import { LEVELS } from '../data/levels';
import { drawBackground, roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { consumeAnyConfirm, consumePressed } from '../systems/input';
import { Storage } from '../systems/storage';
import { earnedTitles, lockedTitles } from '../systems/titles';
import type { Game } from '../game';

/** Generic "press anything to go back to the menu" handler shared by all info screens. */
function dismissOnAnyInput(game: Game) {
  if (consumePressed('Escape') || consumeAnyConfirm()) {
    AudioSys.menu();
    game.state = State.MAIN_MENU;
  }
}

// ---------------- Controls ----------------
export function updateControls(game: Game) {
  dismissOnAnyInput(game);
}

export function renderControls(game: Game) {
  const ctx = game.ctx;
  drawBackground(ctx, 'beach', game.t);
  ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText('CONTROLS', W/2, 100);
  ctx.fillText('CONTROLS', W/2, 100);

  const lines = [
    'Move Left      A / Left',
    'Move Right     D / Right',
    'Shoot Up       Space / W / Up',
    'Pause          P / Esc',
    'Instant Restart  R',
    'Mute Sound     M',
    'Menu Confirm   Enter',
    'Player 2 Join  I / K / U',
    'Player 2 Move  J / L',
    '',
    'Goal: pop every ball before the timer runs out.',
    'Weapons include laser, flame, shotgun, shuriken, and bomb.',
    'Freeze, magnet, smoke-clear, and combo pickups can turn a level.',
  ];
  ctx.font = '20px sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 220, 170 + i * 30);
  }
  ctx.textAlign = 'center'; ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Press Enter or Esc to return', W/2, H - 24);
}

// ---------------- High Scores ----------------
export function updateHighScores(game: Game) {
  dismissOnAnyInput(game);
}

export function renderHighScores(game: Game) {
  const ctx = game.ctx;
  drawBackground(ctx, 'city', game.t);
  ctx.font = 'bold 46px sans-serif';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.strokeText('HIGH SCORES', W/2, 90);
  ctx.fillText('HIGH SCORES', W/2, 90);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffd60a';
  ctx.fillText('Score Attack Best: ' + Storage.data.bestScoreAttack, W/2, 150);
  ctx.fillText('Panic Best Wave: ' + Storage.data.bestPanicWave, W/2, 184);
  ctx.fillText('Panic Best Score: ' + Storage.data.bestPanicScore, W/2, 218);

  const top = [...LEVELS]
    .map((l, i) => ({ label: 'Lv ' + (i + 1) + ' ' + l.name, score: Storage.data.bestTour[l.id] || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < top.length; i++) {
    ctx.fillStyle = i < 3 ? '#ffd60a' : '#fff';
    ctx.fillText(top[i].label, W/2 - 230, 280 + i * 25);
    ctx.textAlign = 'right';
    ctx.fillText(top[i].score.toString(), W/2 + 230, 280 + i * 25);
    ctx.textAlign = 'left';
  }
  ctx.textAlign = 'center';
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Press Enter or Esc to return', W/2, H - 24);
}

// ---------------- Credits ----------------
export function updateCredits(game: Game) {
  dismissOnAnyInput(game);
}

export function renderCredits(game: Game) {
  const ctx = game.ctx;
  drawBackground(ctx, 'arctic', game.t);
  ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText('CREDITS', W/2, 100);
  ctx.fillText('CREDITS', W/2, 100);
  ctx.font = '20px sans-serif';
  const lines = [
    'Bubble Breaker Adventure',
    'A TypeScript HTML5 Canvas arcade game.',
    'Inspired by the Pang / Buster Bros series.',
    '',
    'Code & design: this build for Jo.',
    'No external assets. Built with Vite.',
    'Audio: Web Audio API procedural synthesis.',
    '',
    'Built to teach the ball-splitting genre',
    'with arcade clarity and tight feel.',
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W/2, 170 + i * 28);
  }
  ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Press Enter or Esc to return', W/2, H - 24);
}

// ---------------- Stats ----------------
export function updateStats(game: Game) {
  dismissOnAnyInput(game);
}

function formatTime(ms: number): string {
  if (!ms || ms < 1000) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + (totalSec % 60) + 's';
  return totalSec + 's';
}

export function renderStats(game: Game) {
  const ctx = game.ctx;
  drawBackground(ctx, 'volcano', game.t);
  // Translucent panel so stats are readable against the volcano sky.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText('YOUR STATS', W/2, 70);
  ctx.fillText('YOUR STATS', W/2, 70);

  const d = Storage.data;
  const goldCount = Object.values(d.medals || {}).filter(m => m === 3).length;
  const silverCount = Object.values(d.medals || {}).filter(m => m === 2).length;
  const bronzeCount = Object.values(d.medals || {}).filter(m => m === 1).length;
  // Two-column key/value layout. Left column = lifetime activity, right
  // column = best results across modes. Keeps the screen scan-readable.
  const left: Array<[string, string]> = [
    ['Levels Unlocked',   (d.unlockedLevel || 0) + ' / ' + LEVELS.length],
    ['Total Play Time',   formatTime(d.lifetimePlayMs)],
    ['Lifetime Pops',     (d.lifetimePops || 0).toLocaleString()],
    ['Lifetime Tricks',   (d.lifetimeTricks || 0).toLocaleString()],
    ['Daily Streak',      (d.dailyStreak || 0).toString()],
    ['Max Combo Ever',    (d.lifetimeMaxCombo || 0).toString()],
  ];
  const right: Array<[string, string]> = [
    ['Best Multi-Pop',    (d.bestMultiPop || 0) > 0 ? (d.bestMultiPop || 0) + ' in a chain' : '—'],
    ['Score Attack Best', (d.bestScoreAttack || 0).toLocaleString()],
    ['Panic Best Wave',   (d.bestPanicWave || 0).toString()],
    ['Panic Best Score',  (d.bestPanicScore || 0).toLocaleString()],
    ['Gold Medals',       goldCount + ' / ' + LEVELS.filter(l => !l.boss).length],
    ['Silver / Bronze',   silverCount + ' / ' + bronzeCount],
  ];
  const colW = 380, rowH = 30, topY = 116;
  // Left column.
  ctx.font = '17px sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < left.length; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(left[i][0], 60, topY + i * rowH);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(left[i][1], 60 + colW, topY + i * rowH);
    ctx.textAlign = 'left';
    ctx.font = '17px sans-serif';
  }
  // Right column.
  const rxLabel = W - 60 - colW;
  const rxValue = W - 60;
  ctx.textAlign = 'left';
  for (let i = 0; i < right.length; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(right[i][0], rxLabel, topY + i * rowH);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(right[i][1], rxValue, topY + i * rowH);
    ctx.textAlign = 'left';
    ctx.font = '17px sans-serif';
  }

  // Titles section — earned in gold, locked in dim white. Shows the player
  // what they've collected AND what's still out there to chase.
  const titlesY = topY + 6 * rowH + 24;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('TITLES   ' + earnedTitles().length + ' / ' + (earnedTitles().length + lockedTitles().length), W/2, titlesY);

  // Two rows of pill chips, centered. Earned first (highlighted), then locked.
  const allTitles = [...earnedTitles(), ...lockedTitles()];
  const chipPadX = 12, chipH = 26, chipGap = 6, chipMaxW = W - 80;
  // Lay chips into rows greedily.
  ctx.font = 'bold 13px sans-serif';
  const rows: Array<Array<{ label: string; earned: boolean; w: number }>> = [[]];
  let curRowW = 0;
  for (const t of allTitles) {
    const w = ctx.measureText(t.label).width + chipPadX * 2;
    if (curRowW + w + chipGap > chipMaxW) { rows.push([]); curRowW = 0; }
    rows[rows.length - 1].push({ label: t.label, earned: earnedTitles().includes(t), w });
    curRowW += w + chipGap;
  }
  const chipsTopY = titlesY + 16;
  // Cap to 3 rows to keep the screen from overflowing the controls hint.
  const maxRows = Math.min(rows.length, 3);
  for (let r = 0; r < maxRows; r++) {
    const row = rows[r];
    const rowW = row.reduce((acc, c) => acc + c.w, 0) + (row.length - 1) * chipGap;
    let x = (W - rowW) / 2;
    const y = chipsTopY + r * (chipH + 6);
    for (const c of row) {
      ctx.fillStyle = c.earned ? 'rgba(255,214,10,0.85)' : 'rgba(255,255,255,0.10)';
      roundRect(ctx, x, y, c.w, chipH, 13, true, false);
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.earned ? '#0a1832' : 'rgba(255,255,255,0.25)';
      roundRect(ctx, x, y, c.w, chipH, 13, false, true);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = c.earned ? '#0a1832' : 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, x + c.w / 2, y + 17);
      x += c.w + chipGap;
    }
  }
  if (rows.length > maxRows) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('+' + (rows.length - maxRows) + ' more rows of titles to discover',
      W/2, chipsTopY + maxRows * (chipH + 6) + 4);
  }

  // Footer
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('Press Enter or Esc to return', W/2, H - 18);
}
