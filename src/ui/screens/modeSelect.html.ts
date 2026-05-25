/**
 * Mode select screen. Tour / Score Attack / Panic / Boss Rush + Back.
 */

import { State } from '../../constants';
import { AudioSys } from '../../systems/audio';
import { Storage } from '../../systems/storage';
import type { Game } from '../../game';

interface ModeDef {
  key: 'tour' | 'score_attack' | 'panic' | 'boss_rush' | 'back';
  icon: string;
  title: string;
  desc: string;
  bestKey?: 'bestScoreAttack' | 'bestPanicWave' | 'bestBossRush';
  bestLabel?: string;
}

const MODES: ModeDef[] = [
  { key: 'tour',         icon: '⛰', title: 'Tour',         desc: 'The campaign. 18 stages across 6 worlds + boss.' },
  { key: 'score_attack', icon: '⏱', title: 'Score Attack', desc: '3 lives, no continues. Beat your best.',
    bestKey: 'bestScoreAttack', bestLabel: 'Best score' },
  { key: 'panic',        icon: '⚡', title: 'Panic Mode',   desc: 'Endless waves with a Rainbow Gauge and Star Bubbles.',
    bestKey: 'bestPanicWave', bestLabel: 'Best wave' },
  { key: 'boss_rush',    icon: '☠', title: 'Boss Rush',    desc: 'Defeat every boss in sequence. No retries.',
    bestKey: 'bestBossRush', bestLabel: 'Best score' },
  { key: 'back',         icon: '←', title: 'Back',          desc: 'Return to main menu.' },
];

export function buildModeSelect(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen modes menu-backdrop';
  root.setAttribute('data-screen', 'mode_select');
  root.setAttribute('aria-label', 'Mode select');

  const bubbles = document.createElement('div');
  bubbles.className = 'menu-bubbles';
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.setProperty('--i', String(i));
    bubbles.appendChild(b);
  }
  root.appendChild(bubbles);

  const title = document.createElement('h2');
  title.className = 'ui-heading ui-heading--display modes__title';
  title.textContent = 'Select Mode';
  root.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'modes__grid';
  root.appendChild(grid);

  for (const m of MODES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mode-card';
    card.innerHTML = `
      <div class="mode-card__icon">${m.icon}</div>
      <span class="mode-card__title">${m.title}</span>
      <span class="mode-card__desc">${m.desc}</span>
      ${m.bestKey ? `<span class="mode-card__best" data-best="${m.bestKey}"></span>` : ''}
    `;
    card.addEventListener('click', () => {
      AudioSys.menu();
      switch (m.key) {
        case 'tour':         game.state = State.LEVEL_SELECT; break;
        case 'score_attack': game.startScoreAttack(); break;
        case 'panic':        game.startPanic(); break;
        case 'boss_rush':    game.startBossRush(); break;
        case 'back':         game.state = State.MAIN_MENU; break;
      }
    });
    grid.appendChild(card);
  }

  const back = document.createElement('div');
  back.className = 'ui-back-hint';
  back.textContent = 'Esc · back to menu';
  root.appendChild(back);

  return root;
}

export function syncModeSelect(game: Game, root: HTMLElement) {
  void game;
  for (const el of root.querySelectorAll<HTMLElement>('[data-best]')) {
    const key = el.dataset.best as 'bestScoreAttack' | 'bestPanicWave' | 'bestBossRush';
    const value = Storage.data[key] || 0;
    const def = MODES.find(m => m.bestKey === key);
    const label = def?.bestLabel || 'Best';
    const newText = value > 0 ? `${label}: ${value.toLocaleString()}` : `No ${label.toLowerCase()} yet`;
    if (el.textContent !== newText) el.textContent = newText;
  }
}
