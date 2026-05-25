/**
 * Info screens: Controls, Credits, Stats, High Scores. Same shell with
 * different row content. Each is a registered screen in domRoot.ts so
 * UI.syncFrame() can toggle them like any other.
 */

import { State, type GameState } from '../../constants';
import { LEVELS } from '../../data/levels';
import { Storage } from '../../systems/storage';
import { isTouchDevice } from '../../systems/input';
import type { Game } from '../../game';

interface Row { label: string; value: string; kbd?: boolean; }

function rowHtml(rows: Row[]): string {
  return rows.map(r => `
    <div class="info__row">
      <span class="info__row-label">${r.label}</span>
      <span class="${r.kbd ? 'info__kbd' : 'info__row-value'}">${r.value}</span>
    </div>
  `).join('');
}

function buildShell(title: string, screenName: GameState): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen info menu-backdrop';
  root.setAttribute('data-screen', screenName);
  root.setAttribute('aria-label', title);

  const bubbles = document.createElement('div');
  bubbles.className = 'menu-bubbles';
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.setProperty('--i', String(i));
    bubbles.appendChild(b);
  }
  root.appendChild(bubbles);

  const panel = document.createElement('div');
  panel.className = 'ui-card info__panel';
  panel.innerHTML = `
    <h2 class="ui-heading ui-heading--display info__title">${title}</h2>
    <div class="info__rows" data-role="rows"></div>
  `;
  root.appendChild(panel);

  const hint = document.createElement('div');
  hint.className = 'ui-back-hint';
  hint.textContent = 'Esc · back to menu';
  root.appendChild(hint);

  return root;
}

export function buildControls(): HTMLElement {
  const root = buildShell('Controls', State.CONTROLS);
  const rows: Row[] = isTouchDevice ? [
    { label: 'Move',  value: 'On-screen ◀ ▶ buttons' },
    { label: 'Fire',  value: 'On-screen ▲ FIRE button' },
    { label: 'Pause', value: 'Top-right pause icon' },
  ] : [
    { label: 'Move',          value: 'A / D  or  ← / →', kbd: true },
    { label: 'Fire',          value: 'Space or W or ↑',  kbd: true },
    { label: 'Pause',         value: 'P or Esc',          kbd: true },
    { label: 'Restart',       value: 'R',                kbd: true },
    { label: 'Mute',          value: 'M',                kbd: true },
    { label: 'P2 Move',       value: 'J / L',            kbd: true },
    { label: 'P2 Fire',       value: 'I or K or U',      kbd: true },
  ];
  const rowsEl = root.querySelector<HTMLElement>('[data-role="rows"]')!;
  rowsEl.innerHTML = rowHtml(rows);
  return root;
}

export function buildCredits(): HTMLElement {
  const root = buildShell('Credits', State.CREDITS);
  const rows: Row[] = [
    { label: 'Game design', value: 'Bubble Breaker Team' },
    { label: 'Code',        value: 'TypeScript + Vite' },
    { label: 'Audio',       value: 'Real-asset SFX + WebAudio synth' },
    { label: 'Inspired by', value: 'Pang / Buster Bros' },
    { label: 'Engine',      value: 'Custom Canvas + DOM' },
    { label: 'Built for',   value: 'CrazyGames' },
  ];
  root.querySelector<HTMLElement>('[data-role="rows"]')!.innerHTML = rowHtml(rows);
  return root;
}

export function buildStats(): HTMLElement {
  const root = buildShell('Statistics', State.STATS);
  // Filled dynamically by sync — values change as the player plays.
  return root;
}

export function syncStats(game: Game, root: HTMLElement) {
  void game;
  const d = Storage.data;
  const tourCleared = Object.keys(d.bestTour || {}).length;
  const rows: Row[] = [
    { label: 'Levels unlocked', value: `${(d.unlockedLevel || 0) + 1} / ${LEVELS.length}` },
    { label: 'Levels cleared',  value: `${tourCleared}` },
    { label: 'Daily streak',    value: `🔥 ${d.dailyStreak || 0}` },
    { label: 'Best Score Attack', value: (d.bestScoreAttack || 0).toLocaleString() },
    { label: 'Best Panic wave',   value: String(d.bestPanicWave || 0) },
    { label: 'Best Panic score',  value: (d.bestPanicScore || 0).toLocaleString() },
    { label: 'Best Boss Rush',    value: (d.bestBossRush || 0).toLocaleString() },
    { label: 'Lifetime max combo', value: `×${d.lifetimeMaxCombo || 0}` },
  ];
  root.querySelector<HTMLElement>('[data-role="rows"]')!.innerHTML = rowHtml(rows);
}

export function buildHighScores(): HTMLElement {
  const root = buildShell('High Scores', State.HIGH_SCORES);
  return root;
}

export function syncHighScores(game: Game, root: HTMLElement) {
  void game;
  const tour = Storage.data.bestTour || {};
  const rows: Row[] = LEVELS.map((L, i) => ({
    label: `${i + 1}. ${L.name}`,
    value: (tour[L.id] || 0).toLocaleString(),
  }));
  root.querySelector<HTMLElement>('[data-role="rows"]')!.innerHTML = rowHtml(rows);
}
