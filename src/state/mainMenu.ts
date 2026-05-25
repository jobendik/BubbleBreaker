import { GROUND_Y, H, State, W } from '../constants';
import { LEVELS } from '../data/levels';
import { drawBackground, drawDemoBall, roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { dismissWelcomeBack, getWelcomeBackBanner, hasPlayedToday, liveStreak, todayUTC } from '../systems/daily';
import { consumePressed, pointer, pointerHit, pointerOver } from '../systems/input';
import { Storage } from '../systems/storage';
import { currentTitle } from '../systems/titles';
import { UI } from '../ui/domRoot';
import type { Game } from '../game';

const SECONDARY = [
  { key: 'levels',   label: 'Levels' },
  { key: 'modes',    label: 'Modes' },
  { key: 'stats',    label: 'Stats' },
  { key: 'controls', label: 'Controls' },
  { key: 'credits',  label: 'Credits' },
] as const;

// Welcome-back banner — sits between the title and the PLAY button when shown.
export const WELCOME_BACK_RECT = { x: W/2 - 280, y: 188, w: 560, h: 38 };

// Idle-rotation hints. After ~6s of menu inactivity, one of these fades in/out
// at the bottom of the screen, cycling every few seconds, so the player learns
// hidden affordances (daily streaks, co-op, combo decay) without clicking.
const IDLE_HINTS = [
  '🔥 Daily streaks grow over consecutive days — don\'t miss a day.',
  'Local co-op: a second player can join with I / K / U on desktop.',
  'Chain pops fast — your combo decays if you wait too long.',
  'Each level has bronze, silver, and gold medals to chase.',
  'Score Attack and Panic Mode live under Modes — try them once.',
  'Pickups change your weapon. Try the laser, flamethrower, and bomb.',
] as const;

// How long the menu must sit untouched before idle hints start cycling.
const IDLE_HINT_DELAY = 6;
// How long each hint stays on screen before the next one rolls in.
const IDLE_HINT_PERIOD = 5;
// How long each fade-in / fade-out takes.
const IDLE_HINT_FADE   = 0.6;

let menuIdleSince = 0;
let lastInputT    = 0;
/** Call once per frame from the main-menu render path so the idle clock is
 *  always relative to the same reference (game.t) as other animations. */
function bumpIdleClock(game: Game, hadInput: boolean) {
  if (hadInput) lastInputT = game.t;
  menuIdleSince = game.t - lastInputT;
}

/** Layout rects used by both update (hit-testing) and render. */
export function getMainMenuLayout() {
  const playW = 340, playH = 88;
  const playX = W / 2 - playW / 2;
  const playY = 240;
  const dailyW = 340, dailyH = 60;
  const dailyX = W/2 - dailyW/2;
  const dailyY = playY + playH + 16;
  // Five secondary buttons — slightly narrower than the four-button layout
  // so the full row still fits the 960-wide canvas with comfortable margins.
  const secW = 140, secH = 44, secGap = 10;
  const secCount = SECONDARY.length;
  const secTotal = secCount * secW + (secCount - 1) * secGap;
  const secY = dailyY + dailyH + 18;
  const secStartX = W / 2 - secTotal / 2;
  const secondaryRects = SECONDARY.map((b, i) => ({
    ...b,
    x: secStartX + i * (secW + secGap),
    y: secY, w: secW, h: secH,
  }));
  const soundW = 44, soundH = 44;
  const soundRect = { x: W - soundW - 18, y: 18, w: soundW, h: soundH };
  return { playX, playY, playW, playH, dailyX, dailyY, dailyW, dailyH, secondaryRects, soundRect };
}

export function getResumeLevel(game: Game) {
  return Math.min(game.unlockedLevel, LEVELS.length - 1);
}

function openMenuAction(game: Game, key: string) {
  if (key === 'levels')        game.state = State.LEVEL_SELECT;
  else if (key === 'modes')    game.state = State.MODE_SELECT;
  else if (key === 'stats')    game.state = State.STATS;
  else if (key === 'controls') game.state = State.CONTROLS;
  else if (key === 'credits')  game.state = State.CREDITS;
  else if (key === 'highscores') game.state = State.HIGH_SCORES;
}

export function updateMainMenu(game: Game) {
  // When the HTML overlay owns this screen, native DOM buttons handle their
  // own clicks and the per-frame sync runs from UI.syncFrame(). We still
  // accept keyboard Enter/Space here as a global shortcut so a returning
  // keyboard user can hit Enter on the page without focusing a button.
  if (UI.isHandledByHtml(State.MAIN_MENU)) {
    if (consumePressed('Enter') || consumePressed('Space')) {
      AudioSys.menu();
      game.startTour(getResumeLevel(game));
    }
    return;
  }
  const layout = getMainMenuLayout();
  // Keyboard cycling: 0 = PLAY, 1 = DAILY, 2..5 = secondary buttons
  const items = 2 + layout.secondaryRects.length;
  // Track whether the player interacted this frame so the idle-hint clock
  // can reset to zero when the menu is "active."
  let hadInput = false;
  if (consumePressed('ArrowUp') || consumePressed('KeyW')) {
    game.menuIndex = (game.menuIndex - 1 + items) % items; AudioSys.menu(); hadInput = true;
  }
  if (consumePressed('ArrowDown') || consumePressed('KeyS')) {
    game.menuIndex = (game.menuIndex + 1) % items; AudioSys.menu(); hadInput = true;
  }
  // Left/right cycle within the secondary nav, jump up/down otherwise.
  if (consumePressed('ArrowLeft') || consumePressed('KeyA')) {
    if (game.menuIndex >= 2) game.menuIndex = Math.max(2, game.menuIndex - 1);
    else game.menuIndex = (game.menuIndex - 1 + items) % items;
    AudioSys.menu(); hadInput = true;
  }
  if (consumePressed('ArrowRight') || consumePressed('KeyD')) {
    if (game.menuIndex >= 2) game.menuIndex = Math.min(items - 1, game.menuIndex + 1);
    else game.menuIndex = (game.menuIndex + 1) % items;
    AudioSys.menu(); hadInput = true;
  }
  // Any pointer activity also counts as engagement.
  if (pointer.pressed || pointer.down) hadInput = true;
  bumpIdleClock(game, hadInput);

  // Mouse click hit-tests take priority over keyboard selection.
  if (pointer.pressed) {
    // Tap the welcome-back banner to dismiss it (it auto-clears so no follow-up action).
    if (getWelcomeBackBanner() && pointerHit(WELCOME_BACK_RECT.x, WELCOME_BACK_RECT.y, WELCOME_BACK_RECT.w, WELCOME_BACK_RECT.h)) {
      pointer.pressed = false;
      AudioSys.menu();
      dismissWelcomeBack();
      return;
    }
    if (pointerHit(layout.playX, layout.playY, layout.playW, layout.playH)) {
      pointer.pressed = false;
      AudioSys.menu();
      game.startTour(getResumeLevel(game));
      return;
    }
    if (pointerHit(layout.dailyX, layout.dailyY, layout.dailyW, layout.dailyH)) {
      pointer.pressed = false;
      AudioSys.menu();
      game.openDaily();
      return;
    }
    for (let i = 0; i < layout.secondaryRects.length; i++) {
      const r = layout.secondaryRects[i];
      if (pointerHit(r.x, r.y, r.w, r.h)) {
        pointer.pressed = false;
        AudioSys.menu();
        openMenuAction(game, r.key);
        return;
      }
    }
    if (pointerHit(layout.soundRect.x, layout.soundRect.y, layout.soundRect.w, layout.soundRect.h)) {
      pointer.pressed = false;
      AudioSys.toggle();
      Storage.data.muted = AudioSys.muted;
      Storage.save();
      return;
    }
  }

  if (consumePressed('Enter') || consumePressed('Space')) {
    AudioSys.menu();
    if (game.menuIndex === 0) {
      game.startTour(getResumeLevel(game));
    } else if (game.menuIndex === 1) {
      game.openDaily();
    } else {
      const sec = layout.secondaryRects[game.menuIndex - 2];
      if (sec) openMenuAction(game, sec.key);
    }
  }
}

export function renderMainMenu(game: Game) {
  // HTML overlay owns this screen — canvas is hidden via body[data-state]
  // CSS rule and there's nothing to draw here. The full canvas implementation
  // below stays as a fallback for environments where the overlay fails to
  // mount, until every screen is migrated and we can delete it wholesale.
  if (UI.isHandledByHtml(State.MAIN_MENU)) return;
  const ctx = game.ctx;
  drawBackground(ctx, 'beach', game.t);
  // Title
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6; ctx.strokeStyle = '#0a1832';
  const yT = 130;
  ctx.strokeText('BUBBLE BREAKER', W/2, yT);
  ctx.fillStyle = '#ffd60a';
  ctx.fillText('BUBBLE BREAKER', W/2, yT);
  ctx.font = 'bold 32px sans-serif';
  ctx.strokeText('A D V E N T U R E', W/2, yT + 40);
  ctx.fillStyle = '#fff';
  ctx.fillText('A D V E N T U R E', W/2, yT + 40);

  // Three demo balls bouncing at different rates and altitudes so the menu
  // is never visually static. Each is "behind" the menu chrome thanks to
  // draw order, so it never obscures buttons.
  const demos: Array<[number, number, number, [string, string]]> = [
    [80,  2.4, 180, ['#ff4d6d', '#9d0a32']], // large red
    [120, 3.1, 130, ['#ffd60a', '#ff8500']], // medium yellow
    [55,  1.9, 240, ['#3a86ff', '#1b4fb8']], // tall blue
  ];
  for (let i = 0; i < demos.length; i++) {
    const [speed, rate, height, colors] = demos[i];
    const phase = i * 1.7;
    const dx = ((game.t + phase) * speed) % (W - 100) + 50;
    const dy = GROUND_Y - 70 - Math.abs(Math.sin((game.t + phase) * rate)) * height;
    drawDemoBall(ctx, dx, dy, 20 + i * 4, colors);
  }

  // Drifting sparkles for ambience (procedural, no allocations).
  for (let i = 0; i < 18; i++) {
    const px = (i * 97 + Math.sin(game.t * 0.7 + i) * 30) % W;
    const rise = (game.t * (20 + (i % 4) * 6) + i * 53) % GROUND_Y;
    const py = GROUND_Y - rise;
    const flicker = 0.3 + Math.abs(Math.sin(game.t * 2.5 + i)) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${flicker * 0.6})`;
    ctx.beginPath(); ctx.arc(px, py, 1.2 + (i % 2) * 0.8, 0, Math.PI * 2); ctx.fill();
  }

  // Soft corner vignette — premium feel without obscuring content.
  const vignette = ctx.createRadialGradient(W/2, H/2, W * 0.45, W/2, H/2, W * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Welcome-back banner (only when returning after a day away).
  const welcome = getWelcomeBackBanner();
  if (welcome) {
    const r = WELCOME_BACK_RECT;
    const hover = pointerOver(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hover ? 'rgba(155,231,255,0.95)' : 'rgba(155,231,255,0.85)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10, true, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0a1832';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10, false, true);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#0a1832';
    ctx.textAlign = 'left';
    ctx.fillText(welcome.title, r.x + 14, r.y + 17);
    ctx.font = '12px sans-serif';
    ctx.fillText(welcome.subtitle, r.x + 14, r.y + 32);
    ctx.textAlign = 'right';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(10,24,50,0.6)';
    ctx.fillText('Tap to dismiss', r.x + r.w - 12, r.y + 22);
  }

  const layout = getMainMenuLayout();
  const resume = getResumeLevel(game);
  const hasProgress = game.unlockedLevel > 0;
  const playLabel = hasProgress ? 'CONTINUE' : 'PLAY';
  const playSubLabel = hasProgress ? 'Level ' + (resume + 1) + ' — ' + LEVELS[resume].name : 'Start the adventure';

  // Visual-hierarchy rule: if there is a fresh daily waiting to be played,
  // the daily button is the *call to action* and PLAY is the calm primary.
  // Once the daily is done for today, PLAY reasserts itself as the loudest CTA.
  const playedToday = hasPlayedToday();
  const streak = liveStreak();
  const dailyIsHot = !playedToday;

  // PLAY button
  const playSel = game.menuIndex === 0;
  const playHover = pointerOver(layout.playX, layout.playY, layout.playW, layout.playH);
  const playActive = playSel || playHover;
  // Strong pulse only when it's the primary CTA. When a fresh daily is the
  // hero, PLAY breathes much more subtly so the eye lands on the daily.
  const playPulseAmp = dailyIsHot ? 0.005 : (playActive ? 0.025 : 0.012);
  const playPulse = 1 + Math.sin(game.t * 3) * playPulseAmp;
  ctx.save();
  ctx.translate(W/2, layout.playY + layout.playH / 2);
  ctx.scale(playPulse, playPulse);
  ctx.translate(-W/2, -(layout.playY + layout.playH / 2));
  const playFill = playActive ? '#ffd60a' : (dailyIsHot ? 'rgba(255,127,80,0.78)' : '#ff7f50');
  ctx.fillStyle = playFill;
  roundRect(ctx, layout.playX, layout.playY, layout.playW, layout.playH, 18, true, false);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0a1832';
  roundRect(ctx, layout.playX, layout.playY, layout.playW, layout.playH, 18, false, true);
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = '#0a1832';
  ctx.textAlign = 'center';
  ctx.fillText('▶  ' + playLabel, W/2, layout.playY + 54);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(10,24,50,0.75)';
  ctx.fillText(playSubLabel, W/2, layout.playY + 78);
  ctx.restore();

  // Daily Challenge button — pulses brightly when fresh, quiets down once done.
  const dailySel = game.menuIndex === 1;
  const dailyHover = pointerOver(layout.dailyX, layout.dailyY, layout.dailyW, layout.dailyH);
  const dailyActive = dailySel || dailyHover;
  // When there's something new to play, the daily button breathes (alpha pulse
  // + slight scale) so the eye is drawn to it from across the menu. When it's
  // already played today, it's a calm reminder of progress instead.
  const dailyBreathe = dailyIsHot ? (0.5 + 0.5 * Math.sin(game.t * 2.6)) : 0;
  const dailyScale = dailyIsHot ? 1 + dailyBreathe * 0.02 : 1;
  ctx.save();
  ctx.translate(W/2, layout.dailyY + layout.dailyH / 2);
  ctx.scale(dailyScale, dailyScale);
  ctx.translate(-W/2, -(layout.dailyY + layout.dailyH / 2));
  if (dailyIsHot) {
    // Bright orange that pulses toward yellow on the upbeat, so a returning
    // player immediately understands "there is fresh content here today."
    const hotR = 255, hotG = 127 + Math.round(dailyBreathe * 80), hotB = 30;
    ctx.fillStyle = dailyActive ? '#ffd60a' : `rgb(${hotR},${hotG},${hotB})`;
  } else {
    ctx.fillStyle = dailyActive ? 'rgba(255,127,80,0.95)' : 'rgba(255,127,80,0.45)';
  }
  roundRect(ctx, layout.dailyX, layout.dailyY, layout.dailyW, layout.dailyH, 12, true, false);
  ctx.lineWidth = dailyIsHot ? 4 : 3;
  ctx.strokeStyle = dailyIsHot
    ? (dailyActive ? '#0a1832' : `rgba(255,255,255,${0.55 + dailyBreathe * 0.45})`)
    : (dailyActive ? '#fff' : 'rgba(255,255,255,0.4)');
  roundRect(ctx, layout.dailyX, layout.dailyY, layout.dailyW, layout.dailyH, 12, false, true);
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#0a1832';
  ctx.fillText("TODAY'S CHALLENGE", layout.dailyX + 18, layout.dailyY + 28);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(10,24,50,0.85)';
  const dailyHint = playedToday
    ? 'Played today — best ' + (Storage.data.dailyBest[todayUTC()] || 0)
    : (streak > 0 ? 'Keep your streak alive!' : 'New challenge every day.');
  ctx.fillText(dailyHint, layout.dailyX + 18, layout.dailyY + 48);
  if (streak > 0) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#0a1832';
    ctx.fillText('🔥 ' + streak, layout.dailyX + layout.dailyW - 18, layout.dailyY + 38);
  }
  // "NEW" badge in the top-right corner when fresh — a small, visually loud
  // affordance that the daily has something to give right now.
  if (dailyIsHot) {
    const badgeW = 56, badgeH = 22;
    const bx = layout.dailyX + layout.dailyW - badgeW - 6;
    const by = layout.dailyY - badgeH / 2 + 2;
    ctx.save();
    ctx.translate(bx + badgeW / 2, by + badgeH / 2);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#ffd60a';
    roundRect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, 6, true, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0a1832';
    roundRect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, 6, false, true);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#0a1832';
    ctx.textAlign = 'center';
    ctx.fillText('NEW', 0, 5);
    ctx.restore();
  }
  ctx.restore();

  // Secondary buttons
  for (let i = 0; i < layout.secondaryRects.length; i++) {
    const r = layout.secondaryRects[i];
    const sel = game.menuIndex === i + 2;
    const hover = pointerOver(r.x, r.y, r.w, r.h);
    const active = sel || hover;
    ctx.fillStyle = active ? 'rgba(255,214,10,0.85)' : 'rgba(0,0,0,0.55)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10, true, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.4)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10, false, true);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = active ? '#0a1832' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(r.label, r.x + r.w / 2, r.y + 28);
  }

  // Sound toggle (top-right corner)
  const s = layout.soundRect;
  const sHover = pointerOver(s.x, s.y, s.w, s.h);
  ctx.fillStyle = sHover ? 'rgba(255,214,10,0.85)' : 'rgba(0,0,0,0.55)';
  roundRect(ctx, s.x, s.y, s.w, s.h, 8, true, false);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = sHover ? '#0a1832' : '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(AudioSys.muted ? '🔇' : '🔊', s.x + s.w / 2, s.y + 30);

  // Player title chip — small, top-left corner. Pure identity, no interaction.
  // Tells the returning player "the game remembers who you are."
  const title = currentTitle();
  if (title) {
    const labelW = ctx.measureText(title.label).width;
    const padX = 12, padY = 6;
    ctx.font = 'bold 13px sans-serif';
    const w = Math.max(140, labelW + padX * 2);
    const h = 32;
    const x = 18, y = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, y, w, h, 8, true, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,214,10,0.65)';
    roundRect(ctx, x, y, w, h, 8, false, true);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('TITLE', x + padX, y + 12);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ffd60a';
    ctx.fillText(title.label, x + padX, y + 26);
  }

  // Footer: cross-fades between the default "press anything to play" hint and
  // one of the rotating teach-the-game hints once the menu has been idle for
  // a while. The fade keeps the screen calm — never two messages at once.
  const idle = menuIdleSince;
  const footerY = H - 18;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';

  if (idle < IDLE_HINT_DELAY) {
    // Default footer fully visible; idle hint fully invisible.
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Click  •  Tap  •  Enter to play', W/2, footerY);
  } else {
    const idleT = idle - IDLE_HINT_DELAY;
    const phase = Math.floor(idleT / IDLE_HINT_PERIOD);
    const local = idleT - phase * IDLE_HINT_PERIOD;
    // Per-hint envelope: fade in over IDLE_HINT_FADE, hold, fade out at the end.
    const fadeIn  = Math.min(1, local / IDLE_HINT_FADE);
    const fadeOut = Math.min(1, (IDLE_HINT_PERIOD - local) / IDLE_HINT_FADE);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    const hint = IDLE_HINTS[phase % IDLE_HINTS.length];
    ctx.fillStyle = `rgba(155,231,255,${alpha * 0.85})`;
    ctx.fillText(hint, W/2, footerY);
    // Faint default hint behind, so the bottom never goes fully blank.
    ctx.fillStyle = `rgba(255,255,255,${(1 - alpha) * 0.35})`;
    ctx.fillText('Click  •  Tap  •  Enter to play', W/2, footerY);
  }
}
