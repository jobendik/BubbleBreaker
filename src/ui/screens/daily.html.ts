/**
 * Daily Challenge: intro + result screens.
 */

import { DEATH_REASON_TEXT, State } from '../../constants';
import { LEVELS } from '../../data/levels';
import { AudioSys } from '../../systems/audio';
import { hasPlayedToday, liveStreak, pickDailyChallenge, todayUTC } from '../../systems/daily';
import { Storage } from '../../systems/storage';
import { copyDailyShareText, openDailyShareTweet } from '../../state/daily';
import type { Game } from '../../game';

export function buildDailyIntro(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen daily menu-backdrop';
  root.setAttribute('data-screen', 'daily_intro');
  root.setAttribute('aria-label', "Today's challenge");

  const bubbles = document.createElement('div');
  bubbles.className = 'menu-bubbles';
  for (let i = 0; i < 10; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.setProperty('--i', String(i));
    bubbles.appendChild(b);
  }
  root.appendChild(bubbles);

  const card = document.createElement('div');
  card.className = 'ui-card daily__card';
  card.innerHTML = `
    <div class="daily__date" data-role="date"></div>
    <h2 class="ui-heading ui-heading--display daily__title">Today's Challenge</h2>
    <div class="daily__modifier" data-role="modifier"></div>
    <p class="daily__desc" data-role="desc"></p>
    <div class="ui-stat-row"><span class="ui-stat-row__label">Level</span><span class="ui-stat-row__value" data-role="level"></span></div>
    <div class="ui-stat-row"><span class="ui-stat-row__label">Target Score</span><span class="ui-stat-row__value" data-role="target"></span></div>
    <div class="ui-stat-row"><span class="ui-stat-row__label">Current Streak</span><span class="ui-stat-row__value" data-role="streak"></span></div>
    <div class="daily__actions">
      <button type="button" class="ui-btn ui-btn--cta" data-role="play">▶  Play</button>
      <button type="button" class="ui-btn ui-btn--ghost" data-role="back">Back</button>
    </div>
  `;
  root.appendChild(card);

  card.querySelector<HTMLElement>('[data-role="play"]')!.addEventListener('click', () => {
    AudioSys.menu();
    game.startDaily();
  });
  card.querySelector<HTMLElement>('[data-role="back"]')!.addEventListener('click', () => {
    AudioSys.menu();
    game.state = State.MAIN_MENU;
  });

  return root;
}

export function syncDailyIntro(game: Game, root: HTMLElement) {
  const pick = game.daily ?? pickDailyChallenge();
  if (!game.daily) game.daily = pick;
  const L = LEVELS[pick.levelIndex];
  setText(root, 'date', pick.date + ' · UTC');
  setText(root, 'modifier', pick.modifierLabel);
  setText(root, 'desc', pick.modifierDesc);
  setText(root, 'level', L.name);
  setText(root, 'target', L.targetScore.toLocaleString());
  const streak = liveStreak();
  setText(root, 'streak', streak > 0 ? `🔥 ${streak}` : '—');
}

export function buildDailyResult(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen daily menu-backdrop';
  root.setAttribute('data-screen', 'daily_result');
  root.setAttribute('aria-label', 'Daily challenge result');

  const card = document.createElement('div');
  card.className = 'ui-card daily__card';
  card.innerHTML = `
    <div class="daily__date" data-role="date"></div>
    <h2 class="ui-heading ui-heading--display daily__title">Daily Result</h2>
    <div class="daily__modifier" data-role="modifier"></div>
    <div class="ui-stat-row"><span class="ui-stat-row__label">Your Score</span><span class="ui-stat-row__value ui-stat-row__value--best" data-role="score"></span></div>
    <div class="ui-stat-row"><span class="ui-stat-row__label">Today's Best</span><span class="ui-stat-row__value" data-role="best"></span></div>
    <div class="ui-stat-row"><span class="ui-stat-row__label">Streak</span><span class="ui-stat-row__value" data-role="streak"></span></div>
    <p class="daily__desc" data-role="reason" hidden></p>
    <div class="daily__actions">
      <button type="button" class="ui-btn ui-btn--success" data-role="copy">Copy Result</button>
      <button type="button" class="ui-btn" data-role="tweet" style="background:#1da1f2;color:#fff;border-color:var(--ink);">Share on X</button>
      <button type="button" class="ui-btn ui-btn--cta" data-role="menu">Main Menu</button>
    </div>
  `;
  root.appendChild(card);

  card.querySelector<HTMLElement>('[data-role="copy"]')!.addEventListener('click', () => {
    copyDailyShareText(game);
    const btn = card.querySelector<HTMLElement>('[data-role="copy"]')!;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = 'Copy Result'; }, 1800);
  });
  card.querySelector<HTMLElement>('[data-role="tweet"]')!.addEventListener('click', () => {
    AudioSys.menu();
    openDailyShareTweet(game);
  });
  card.querySelector<HTMLElement>('[data-role="menu"]')!.addEventListener('click', () => {
    AudioSys.menu();
    game.state = State.MAIN_MENU;
  });

  return root;
}

export function syncDailyResult(game: Game, root: HTMLElement) {
  const pick = game.daily ?? pickDailyChallenge();
  const today = todayUTC();
  const best = Storage.data.dailyBest[today] || game.dailyResultScore;
  const streak = liveStreak();
  setText(root, 'date', pick.date + ' · UTC');
  setText(root, 'modifier', pick.modifierLabel);
  setText(root, 'score', game.dailyResultScore.toLocaleString());
  setText(root, 'best',  best.toLocaleString());
  setText(root, 'streak', streak > 0 ? `🔥 ${streak}` : '—');
  void hasPlayedToday;
  const reason = root.querySelector<HTMLElement>('[data-role="reason"]');
  if (reason) {
    if (game.lastDeathReason) {
      reason.hidden = false;
      reason.textContent = DEATH_REASON_TEXT[game.lastDeathReason];
    } else {
      reason.hidden = true;
    }
  }
}

function setText(root: HTMLElement, role: string, value: string) {
  const el = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
  if (el && el.textContent !== value) el.textContent = value;
}
