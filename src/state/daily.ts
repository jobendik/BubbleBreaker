import { DEATH_REASON_TEXT, H, State, W } from '../constants';
import { LEVELS } from '../data/levels';
import { drawBackground, roundRect } from '../rendering/canvas';
import { AudioSys } from '../systems/audio';
import { hasPlayedToday, liveStreak, pickDailyChallenge, todayUTC } from '../systems/daily';
import { consumeAnyConfirm, consumePressed, pointer, pointerHit, pointerOver } from '../systems/input';
import { Storage } from '../systems/storage';
import { UI } from '../ui/domRoot';
import type { Game } from '../game';

// ---------- Daily Challenge: intro screen ----------
export function getDailyIntroLayout() {
  const playW = 320, playH = 78;
  const playX = W/2 - playW/2;
  const playY = H - 130;
  const backW = 140, backH = 44;
  const backX = 32, backY = H - 64;
  return { playX, playY, playW, playH, backX, backY, backW, backH };
}

export function updateDailyIntro(game: Game) {
  if (consumePressed('Escape')) { game.state = State.MAIN_MENU; AudioSys.menu(); return; }
  const layout = getDailyIntroLayout();
  if (pointer.pressed) {
    if (pointerHit(layout.playX, layout.playY, layout.playW, layout.playH)) {
      pointer.pressed = false;
      AudioSys.menu();
      game.startDaily();
      return;
    }
    if (pointerHit(layout.backX, layout.backY, layout.backW, layout.backH)) {
      pointer.pressed = false;
      AudioSys.menu();
      game.state = State.MAIN_MENU;
      return;
    }
  }
  if (consumeAnyConfirm()) {
    AudioSys.menu();
    game.startDaily();
  }
}

export function renderDailyIntro(game: Game) {
  if (UI.isHandledByHtml(State.DAILY_INTRO)) return;
  const ctx = game.ctx;
  drawBackground(ctx, 'boss', game.t);
  const pick = game.daily ?? pickDailyChallenge();
  if (!game.daily) game.daily = pick;
  const L = LEVELS[pick.levelIndex];

  // Header
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd60a'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText("TODAY'S CHALLENGE", W/2, 88);
  ctx.fillText("TODAY'S CHALLENGE", W/2, 88);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText(pick.date + ' (UTC)', W/2, 112);

  // Streak card
  const streak = liveStreak();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, W/2 - 280, 140, 560, 64, 12, true, false);
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = streak > 0 ? '#ff7f50' : '#cfd6df';
  ctx.textAlign = 'left';
  ctx.fillText('🔥 ' + streak, W/2 - 260, 182);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('day streak', W/2 - 200, 174);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cfd6df';
  const playedToday = hasPlayedToday();
  const subtitle = playedToday
    ? "Today's best: " + (Storage.data.dailyBest[todayUTC()] || 0)
    : streak > 0 ? 'Play today to keep your streak alive!' : 'Play today to start a streak.';
  ctx.fillText(subtitle, W/2 - 200, 194);

  // Level card
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, W/2 - 280, 224, 560, 76, 12, true, false);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('LEVEL', W/2 - 260, 248);
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(L.name, W/2 - 260, 278);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText(L.theme.toUpperCase() + '  •  Target ' + L.targetScore, W/2 - 260, 296);

  // Modifier card
  ctx.fillStyle = 'rgba(255,127,80,0.18)';
  roundRect(ctx, W/2 - 280, 312, 560, 76, 12, true, false);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#ffd60a';
  ctx.fillText('MODIFIER', W/2 - 260, 336);
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(pick.modifierLabel, W/2 - 260, 366);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText(pick.modifierDesc, W/2 - 260, 384);

  // Action buttons
  const layout = getDailyIntroLayout();
  const playHover = pointerOver(layout.playX, layout.playY, layout.playW, layout.playH);
  ctx.fillStyle = playHover ? '#ffd60a' : '#ff7f50';
  roundRect(ctx, layout.playX, layout.playY, layout.playW, layout.playH, 16, true, false);
  ctx.lineWidth = 4; ctx.strokeStyle = '#0a1832';
  roundRect(ctx, layout.playX, layout.playY, layout.playW, layout.playH, 16, false, true);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#0a1832';
  ctx.textAlign = 'center';
  ctx.fillText('▶  PLAY', W/2, layout.playY + 50);

  // Back button
  const backHover = pointerOver(layout.backX, layout.backY, layout.backW, layout.backH);
  ctx.fillStyle = backHover ? 'rgba(255,214,10,0.85)' : 'rgba(0,0,0,0.55)';
  roundRect(ctx, layout.backX, layout.backY, layout.backW, layout.backH, 10, true, false);
  ctx.lineWidth = 2; ctx.strokeStyle = backHover ? '#fff' : 'rgba(255,255,255,0.4)';
  roundRect(ctx, layout.backX, layout.backY, layout.backW, layout.backH, 10, false, true);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = backHover ? '#0a1832' : '#fff';
  ctx.fillText('Back', layout.backX + layout.backW / 2, layout.backY + 28);
}

// ---------- Daily Challenge: result screen ----------
export function getDailyResultLayout() {
  // Three buttons: Copy, Tweet, Menu. Tweet adds virality on top of the
  // local-clipboard copy fallback. The X intent URL opens in a new tab and
  // works without requiring a Twitter SDK / login.
  const btnW = 170, btnH = 56, gap = 12;
  const totalW = btnW * 3 + gap * 2;
  const startX = W/2 - totalW / 2;
  const y = H - 110;
  return {
    copy:  { x: startX,                  y, w: btnW, h: btnH },
    tweet: { x: startX + (btnW + gap),   y, w: btnW, h: btnH },
    menu:  { x: startX + (btnW + gap) * 2, y, w: btnW, h: btnH },
  };
}

export function updateDailyResult(game: Game) {
  if (consumePressed('Escape')) { game.state = State.MAIN_MENU; AudioSys.menu(); return; }
  const layout = getDailyResultLayout();
  if (pointer.pressed) {
    if (pointerHit(layout.copy.x, layout.copy.y, layout.copy.w, layout.copy.h)) {
      pointer.pressed = false;
      copyDailyShareText(game);
      return;
    }
    if (pointerHit(layout.tweet.x, layout.tweet.y, layout.tweet.w, layout.tweet.h)) {
      pointer.pressed = false;
      AudioSys.menu();
      openDailyShareTweet(game);
      return;
    }
    if (pointerHit(layout.menu.x, layout.menu.y, layout.menu.w, layout.menu.h)) {
      pointer.pressed = false;
      AudioSys.menu();
      game.state = State.MAIN_MENU;
      return;
    }
  }
  if (consumePressed('Enter') || consumePressed('Space')) {
    AudioSys.menu();
    game.state = State.MAIN_MENU;
  }
}

/** Build the shareable text. Centralized so Copy and Tweet stay in sync. */
function buildShareText(game: Game): string {
  const pick = game.daily ?? pickDailyChallenge();
  return `I scored ${game.dailyResultScore.toLocaleString()} on today's Bubble Breaker daily — modifier: ${pick.modifierLabel}. Beat me!`;
}

/** Open an X (Twitter) share intent in a new tab. Works without SDKs/login. */
export function openDailyShareTweet(game: Game) {
  const text = buildShareText(game);
  // The X intent URL accepts `text` and optional `url`. We don't have a public
  // landing page yet; just the text. window.open with 'noopener' avoids
  // exposing window.opener to the new tab (security hygiene).
  const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    game.dailyResultShareCopied = game.t; // reuse the "shared" flash state
  } catch { /* popup blocked — silently fail; Copy is the fallback */ }
}

export function copyDailyShareText(game: Game) {
  const text = buildShareText(game);
  const fallback = () => {
    // Older browsers / iframes without clipboard permissions: select & exec a copy.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      game.dailyResultShareCopied = game.t;
    } catch { /* clipboard truly unavailable */ }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      game.dailyResultShareCopied = game.t;
    }).catch(fallback);
  } else {
    fallback();
  }
}

export function renderDailyResult(game: Game) {
  if (UI.isHandledByHtml(State.DAILY_RESULT)) return;
  const ctx = game.ctx;
  drawBackground(ctx, 'boss', game.t);
  const pick = game.daily ?? pickDailyChallenge();
  const today = todayUTC();
  const best = Storage.data.dailyBest[today] || game.dailyResultScore;
  const streak = liveStreak();

  // Header
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd60a'; ctx.strokeStyle = '#0a1832'; ctx.lineWidth = 5;
  ctx.strokeText('DAILY CHALLENGE', W/2, 90);
  ctx.fillText('DAILY CHALLENGE', W/2, 90);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText(pick.date + ' (UTC)  •  ' + pick.modifierLabel, W/2, 114);

  // Death reason (only if the run ended in a death rather than a level clear).
  if (game.lastDeathReason) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#ff7f50';
    ctx.fillText(DEATH_REASON_TEXT[game.lastDeathReason], W/2, 134);
  }

  // Score card
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, W/2 - 260, 150, 520, 110, 14, true, false);
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#9be7ff';
  ctx.fillText('YOUR SCORE', W/2, 184);
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(game.dailyResultScore.toLocaleString(), W/2, 236);
  if (best > game.dailyResultScore) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cfd6df';
    ctx.fillText("Today's best: " + best.toLocaleString(), W/2, 254);
  } else if (game.dailyResultScore > 0) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ffd60a';
    ctx.fillText("New personal best for today!", W/2, 254);
  }

  // Streak card
  ctx.fillStyle = 'rgba(255,127,80,0.2)';
  roundRect(ctx, W/2 - 260, 280, 520, 80, 14, true, false);
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = '#ff7f50';
  ctx.fillText('🔥 ' + streak, W/2 - 80, 332);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText('day streak', W/2 - 20, 320);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#cfd6df';
  ctx.fillText('Come back tomorrow to extend it.', W/2 - 20, 342);

  // Action buttons
  const layout = getDailyResultLayout();
  const copyHover = pointerOver(layout.copy.x, layout.copy.y, layout.copy.w, layout.copy.h);
  const justCopied = game.dailyResultShareCopied > 0 && (game.t - game.dailyResultShareCopied) < 2.0;
  ctx.fillStyle = justCopied ? '#06d6a0' : (copyHover ? 'rgba(255,214,10,0.85)' : 'rgba(0,0,0,0.55)');
  roundRect(ctx, layout.copy.x, layout.copy.y, layout.copy.w, layout.copy.h, 12, true, false);
  ctx.lineWidth = 3;
  ctx.strokeStyle = justCopied ? '#fff' : (copyHover ? '#fff' : 'rgba(255,255,255,0.4)');
  roundRect(ctx, layout.copy.x, layout.copy.y, layout.copy.w, layout.copy.h, 12, false, true);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = justCopied ? '#0a1832' : (copyHover ? '#0a1832' : '#fff');
  ctx.textAlign = 'center';
  ctx.fillText(justCopied ? 'COPIED ✓' : 'COPY', layout.copy.x + layout.copy.w / 2, layout.copy.y + 36);

  // Tweet button — opens an X share intent in a new tab.
  const tweetHover = pointerOver(layout.tweet.x, layout.tweet.y, layout.tweet.w, layout.tweet.h);
  ctx.fillStyle = tweetHover ? '#9be7ff' : 'rgba(29,161,242,0.85)';
  roundRect(ctx, layout.tweet.x, layout.tweet.y, layout.tweet.w, layout.tweet.h, 12, true, false);
  ctx.lineWidth = 3;
  ctx.strokeStyle = tweetHover ? '#0a1832' : 'rgba(255,255,255,0.55)';
  roundRect(ctx, layout.tweet.x, layout.tweet.y, layout.tweet.w, layout.tweet.h, 12, false, true);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#0a1832';
  ctx.textAlign = 'center';
  ctx.fillText('SHARE ON X', layout.tweet.x + layout.tweet.w / 2, layout.tweet.y + 36);

  const menuHover = pointerOver(layout.menu.x, layout.menu.y, layout.menu.w, layout.menu.h);
  ctx.fillStyle = menuHover ? '#ffd60a' : '#ff7f50';
  roundRect(ctx, layout.menu.x, layout.menu.y, layout.menu.w, layout.menu.h, 12, true, false);
  ctx.lineWidth = 3; ctx.strokeStyle = '#0a1832';
  roundRect(ctx, layout.menu.x, layout.menu.y, layout.menu.w, layout.menu.h, 12, false, true);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#0a1832';
  ctx.fillText('MAIN MENU', layout.menu.x + layout.menu.w / 2, layout.menu.y + 36);
}
