/**
 * Three related overlays: Level Clear, Boss Defeated, Victory.
 * All share the .overlay-card chrome and a confetti layer for celebration.
 */

import { State } from '../../constants';
import { AudioSys } from '../../systems/audio';
import { Storage } from '../../systems/storage';
import { activeMissions, nextUnlockHint } from '../../systems/retention';
import type { Game } from '../../game';

function confettiLayer(count = 24): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const colors = ['var(--brand-yellow)', 'var(--brand-coral)', 'var(--brand-mint)', 'var(--brand-cyan)', 'var(--brand-pink)', 'var(--brand-violet)'];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.style.setProperty('--i', String(i));
    s.style.setProperty('--c', colors[i % colors.length]);
    wrap.appendChild(s);
  }
  return wrap;
}

export function buildLevelClear(_game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen clear overlay-screen';
  root.setAttribute('data-screen', 'level_clear');
  root.setAttribute('aria-label', 'Level clear');

  const card = document.createElement('div');
  card.className = 'overlay-card';
  card.appendChild(confettiLayer(20));
  const stats = document.createElement('div');
  stats.className = 'overlay-card__stats clear__stat-list';
  stats.dataset.role = 'stats';
  card.innerHTML = `
    <h2 class="ui-heading ui-heading--display ui-heading--win overlay-card__title">Level Clear!</h2>
    <div class="overlay-card__sub" data-role="level-name"></div>
  `;
  const confetti = confettiLayer(20);
  card.appendChild(confetti);
  card.appendChild(stats);
  const hint = document.createElement('div');
  hint.className = 'overlay-card__hint';
  hint.textContent = 'Press any key to continue';
  card.appendChild(hint);

  root.appendChild(card);
  return root;
}

export function syncLevelClear(game: Game, root: HTMLElement) {
  const nameEl = root.querySelector<HTMLElement>('[data-role="level-name"]');
  if (nameEl) nameEl.textContent = game.levelName;
  const stats = root.querySelector<HTMLElement>('[data-role="stats"]');
  if (!stats) return;
  const s = game.summary;
  if (!s) { stats.innerHTML = ''; return; }
  const rows: { label: string; value: string; cls?: string }[] = [
    { label: 'Base Score', value: '+' + s.base.toLocaleString() },
    { label: 'Time Bonus', value: '+' + s.time.toLocaleString() },
    { label: 'Accuracy',   value: '+' + s.accuracy.toLocaleString() },
    { label: 'Combo',      value: '+' + s.combo.toLocaleString() },
    { label: 'No-Miss',    value: '+' + s.noMiss.toLocaleString() },
  ];
  if (s.tricks > 0) rows.push({ label: 'Tricks', value: '×' + s.tricks });
  rows.push({ label: 'Total', value: s.total.toLocaleString(), cls: 'ui-stat-row__value--win' });
  if (s.best > 0) rows.push({ label: 'Best', value: s.best.toLocaleString(), cls: 'ui-stat-row__value--best' });
  if (s.newComboBest) rows.push({ label: 'NEW COMBO BEST', value: '!', cls: 'ui-stat-row__value--win' });
  const missionsDone = activeMissions().filter(m => m.complete).length;
  rows.push({ label: 'Daily Missions', value: missionsDone + ' / 3' });
  rows.push({ label: 'Next Unlock', value: nextUnlockHint(), cls: 'ui-stat-row__value--note' });
  const html = rows.map(r => `
    <div class="ui-stat-row">
      <span class="ui-stat-row__label">${r.label}</span>
      <span class="ui-stat-row__value ${r.cls || ''}">${r.value}</span>
    </div>
  `).join('');
  if (stats.innerHTML !== html) stats.innerHTML = html;
}

export function buildBossDefeated(_game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen clear overlay-screen';
  root.setAttribute('data-screen', 'boss_defeated');
  root.setAttribute('aria-label', 'Boss defeated');

  const card = document.createElement('div');
  card.className = 'overlay-card';
  card.innerHTML = `
    <h2 class="ui-heading ui-heading--display ui-heading--win overlay-card__title">Boss Defeated!</h2>
    <div class="overlay-card__sub">Stand by…</div>
  `;
  card.appendChild(confettiLayer(30));
  root.appendChild(card);
  return root;
}

export function buildVictory(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen victory overlay-screen';
  root.setAttribute('data-screen', 'victory');
  root.setAttribute('aria-label', 'Victory');

  const card = document.createElement('div');
  card.className = 'overlay-card';
  card.innerHTML = `
    <h2 class="ui-heading ui-heading--display ui-heading--win overlay-card__title">VICTORY!</h2>
    <div class="overlay-card__sub">The Commander has fallen.</div>
    <div class="overlay-card__stats">
      <div class="ui-stat-row">
        <span class="ui-stat-row__label">Final Score</span>
        <span class="ui-stat-row__value ui-stat-row__value--best" data-role="final-score">0</span>
      </div>
      <div class="ui-stat-row">
        <span class="ui-stat-row__label">Bosses Defeated</span>
        <span class="ui-stat-row__value" data-role="boss-count">0</span>
      </div>
    </div>
    <div class="overlay-card__actions">
      <button type="button" class="ui-btn ui-btn--cta" data-role="menu">Main Menu</button>
    </div>
    <div class="overlay-card__hint">Thank you for playing</div>
  `;
  card.appendChild(confettiLayer(40));
  root.appendChild(card);

  card.querySelector<HTMLElement>('[data-role="menu"]')!.addEventListener('click', () => {
    AudioSys.menu();
    game.state = State.MAIN_MENU;
  });

  return root;
}

export function syncVictory(game: Game, root: HTMLElement) {
  const score = root.querySelector<HTMLElement>('[data-role="final-score"]');
  if (score) score.textContent = game.score.toLocaleString();
  const bc = root.querySelector<HTMLElement>('[data-role="boss-count"]');
  if (bc) bc.textContent = String(game.bossRushCount || (game.mode === 'tour' ? 1 : 0));
  void Storage;
}
