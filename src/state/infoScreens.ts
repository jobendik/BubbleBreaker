import { H, State, W } from '../constants';
import { LEVELS } from '../data/levels';
import { drawBackground, roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { consumeAnyConfirm, consumePressed } from '../systems/input';
import { Storage } from '../systems/storage';
import { earnedTitles, lockedTitles } from '../systems/titles';
import { UI } from '../ui/domRoot';
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
  if (UI.isHandledByHtml(State.CONTROLS)) return;
  const ctx = game.ctx;
  drawBackground(ctx, 'beach', game.t);
  ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText('CONTROLS & GUIDE', W/2, 64);
  ctx.fillText('CONTROLS & GUIDE', W/2, 64);

  // Two-column layout. Left column: input bindings. Right column: gameplay
  // glossary (weapons, balls, pickups, modes) so a new player can quickly
  // learn what every icon and color in the world actually means.
  const colLeftX  = 56;
  const colRightX = W/2 + 24;
  const topY = 104;
  const rowH = 22;

  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('INPUTS', colLeftX, topY);
  const inputs = [
    'Move Left      A  /  ←',
    'Move Right     D  /  →',
    'Shoot Up       Space  /  W  /  ↑',
    'Pause          P  /  Esc',
    'Instant Restart  R',
    'Mute Sound     M',
    'Menu Confirm   Enter',
    'Co-op: P2 Join  I  /  K  /  U',
    'Co-op: P2 Move  J  /  L',
    'Co-op: Revive   Walk over a downed P',
  ];
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < inputs.length; i++) {
    ctx.fillText(inputs[i], colLeftX, topY + 22 + i * rowH);
  }

  // Right column: gameplay glossary.
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('WEAPONS', colRightX, topY);
  const weapons = [
    'Harpoon — default vertical wire',
    'Double / Triple — 2 or 3 wires at once',
    'Power Wire — anchors to the ceiling',
    'Diagonal — paired 45° bolts',
    'Machine Gun / Laser — fast burst',
    'Flame / Shotgun / Shuriken / Bomb',
  ];
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < weapons.length; i++) {
    ctx.fillText(weapons[i], colRightX, topY + 22 + i * 20);
  }

  // Below weapons: pickups & specials.
  const specialsY = topY + 22 + weapons.length * 20 + 18;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('PICKUPS & SPECIALS', colRightX, specialsY);
  const specials = [
    'Shield, Life, Score, Time',
    'Slow Time / Freeze / Clear Smoke',
    'Magnet, Combo Boost',
    'DYNAMITE — shrinks every ball to size 0',
    'Star Bubble (Panic) — Clock or Star face',
  ];
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < specials.length; i++) {
    ctx.fillText(specials[i], colRightX, specialsY + 22 + i * 20);
  }

  // Bestiary & modes (left column, below inputs).
  const bestiaryY = topY + 22 + inputs.length * rowH + 18;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('BESTIARY', colLeftX, bestiaryY);
  const bestiary = [
    'Crab — patrols ground, pops balls on contact',
    'Bird / Ball-Fish — JAMS your weapon 3s',
    'Red Bird — same, drops a power-up if shot',
    'Dragon — friendly; pops balls touching it',
  ];
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < bestiary.length; i++) {
    ctx.fillText(bestiary[i], colLeftX, bestiaryY + 22 + i * 20);
  }

  // Modes — bottom-spanning recap.
  const modesY = bestiaryY + 22 + bestiary.length * 20 + 16;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.textAlign = 'center';
  ctx.fillText("MODES   Tour  •  Score Attack  •  Panic  •  Boss Rush  •  Today's Challenge", W/2, modesY);

  ctx.textAlign = 'center'; ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Press Enter or Esc to return', W/2, H - 18);
}

// ---------------- High Scores ----------------
export function updateHighScores(game: Game) {
  dismissOnAnyInput(game);
}

export function renderHighScores(game: Game) {
  if (UI.isHandledByHtml(State.HIGH_SCORES)) return;
  const ctx = game.ctx;
  drawBackground(ctx, 'city', game.t);
  ctx.font = 'bold 46px sans-serif';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.strokeText('HIGH SCORES', W/2, 90);
  ctx.fillText('HIGH SCORES', W/2, 90);

  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#ffd60a';
  ctx.fillText('Score Attack: ' + Storage.data.bestScoreAttack, W/2, 144);
  ctx.fillText('Panic — Wave ' + Storage.data.bestPanicWave
    + '   |   Score ' + Storage.data.bestPanicScore, W/2, 172);
  ctx.fillText('Boss Rush — ' + (Storage.data.bestBossRushCount || 0) + ' bosses'
    + '   |   Score ' + (Storage.data.bestBossRush || 0), W/2, 200);

  // Recent daily challenges — pull the last 7 entries from dailyBest.
  // Shows the player a "streak chart" beyond a single number.
  const dailyEntries = Object.entries(Storage.data.dailyBest || {})
    .sort((a, b) => a[0] < b[0] ? 1 : -1) // newest first
    .slice(0, 7);
  if (dailyEntries.length > 0) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#9be7ff';
    ctx.fillText('RECENT DAILIES', W/2, 230);
    ctx.font = '14px sans-serif';
    for (let i = 0; i < dailyEntries.length; i++) {
      const [date, score] = dailyEntries[i];
      ctx.fillStyle = i === 0 ? '#ffd60a' : '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(date, W/2 - 180, 252 + i * 18);
      ctx.textAlign = 'right';
      ctx.fillText(score.toLocaleString(), W/2 + 180, 252 + i * 18);
    }
  }

  // Per-level Tour bests — show only top 5 to keep the screen tidy alongside daily history.
  const top = [...LEVELS]
    .map((l, i) => ({ label: 'Lv ' + (i + 1) + ' ' + l.name, score: Storage.data.bestTour[l.id] || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const tourTopY = dailyEntries.length > 0 ? 252 + dailyEntries.length * 18 + 22 : 250;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.textAlign = 'center';
  ctx.fillText('TOP TOUR LEVELS', W/2, tourTopY);
  ctx.font = '14px sans-serif';
  for (let i = 0; i < top.length; i++) {
    ctx.fillStyle = i < 3 ? '#ffd60a' : '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(top[i].label, W/2 - 230, tourTopY + 22 + i * 18);
    ctx.textAlign = 'right';
    ctx.fillText(top[i].score.toString(), W/2 + 230, tourTopY + 22 + i * 18);
  }
  ctx.textAlign = 'left';
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
  if (UI.isHandledByHtml(State.CREDITS)) return;
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
  if (UI.isHandledByHtml(State.STATS)) return;
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
