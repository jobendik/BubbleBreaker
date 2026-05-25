/**
 * Info screens: Controls, Credits, Stats, High Scores. Same shell with
 * different row content. Each is a registered screen in domRoot.ts so
 * UI.syncFrame() can toggle them like any other.
 */

import { State, type GameState } from '../../constants';
import { LEVELS } from '../../data/levels';
import { Storage } from '../../systems/storage';
import { isTouchDevice } from '../../systems/input';
import { AudioSys } from '../../systems/audio';
import {
  TITLES, TRICK_CONTRACTS, PLAYER_PALETTES,
  earnedTitles, equipTitle, equipPalette,
} from '../../systems/titles';
import { activeMissions, getWeeklyEvent, nextUnlockHint, weeklyBestScore } from '../../systems/retention';
import { emit } from '../../systems/analytics';
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
    { label: 'Mission stars',     value: String(d.missionStars || 0) },
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
  const weekly = getWeeklyEvent();
  const rows: Row[] = [
    { label: 'CrazyGames Leaderboard', value: Storage.data.leaderboardPanicSubmitted > 0 ? 'Panic ' + Storage.data.leaderboardPanicSubmitted.toLocaleString() : 'Panic Mode ready' },
    { label: 'Weekly ' + weekly.label, value: weeklyBestScore().toLocaleString() },
    { label: 'Best Panic Score', value: (Storage.data.bestPanicScore || 0).toLocaleString() },
    { label: 'Best Panic Wave', value: String(Storage.data.bestPanicWave || 0) },
    ...LEVELS.map((L, i) => ({
    label: `${i + 1}. ${L.name}`,
    value: (tour[L.id] || 0).toLocaleString(),
    })),
  ];
  root.querySelector<HTMLElement>('[data-role="rows"]')!.innerHTML = rowHtml(rows);
}

export function buildProfile(game: Game): HTMLElement {
  const root = buildShell('Profile', State.PROFILE);
  const panel = root.querySelector<HTMLElement>('.info__panel')!;
  panel.classList.add('profile-panel');
  panel.innerHTML = `
    <h2 class="ui-heading ui-heading--display info__title">Profile</h2>
    <div class="profile-section profile-summary" data-role="summary"></div>
    <div class="profile-section">
      <div class="profile-section__title">Equipped Title</div>
      <div class="profile-grid" data-role="titles"></div>
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Adventurer Palette</div>
      <div class="profile-grid profile-grid--palettes" data-role="palettes"></div>
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Trick Contracts</div>
      <div class="profile-contracts" data-role="contracts"></div>
    </div>
  `;
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const titleBtn = target.closest<HTMLElement>('[data-title-id]');
    if (titleBtn) {
      AudioSys.menu();
      const id = titleBtn.dataset.titleId || '';
      if (equipTitle(id)) emit('profile.equip_title', { id: id || 'auto' });
      (root as any).__profileKey = '';
      syncProfile(game, root);
      return;
    }
    const paletteBtn = target.closest<HTMLElement>('[data-palette-id]');
    if (paletteBtn) {
      AudioSys.menu();
      const id = paletteBtn.dataset.paletteId || 'classic';
      if (equipPalette(id)) emit('profile.equip_palette', { id });
      (root as any).__profileKey = '';
      syncProfile(game, root);
    }
  });
  return root;
}

export function syncProfile(_game: Game, root: HTMLElement) {
  const earned = new Set(earnedTitles().map(t => t.id));
  const d = Storage.data;
  const key = [
    d.equippedTitleId || '',
    d.playerPaletteId || 'classic',
    [...earned].join(','),
    JSON.stringify(d.trickStats || {}),
    d.lifetimePops || 0,
    d.dailyStreak || 0,
    d.lifetimeMaxCombo || 0,
    JSON.stringify(d.medals || {}),
    d.missionStars || 0,
    d.missionDay || '',
    JSON.stringify(d.missionStates || {}),
    JSON.stringify(d.weeklyPanicBest || {}),
    d.weeklyRewardClaimed || '',
  ].join('|');
  if ((root as any).__profileKey === key) return;
  (root as any).__profileKey = key;

  const weekly = getWeeklyEvent();
  const missionsDone = activeMissions().filter(m => m.complete).length;
  const summary = root.querySelector<HTMLElement>('[data-role="summary"]')!;
  summary.innerHTML = `
    <div class="profile-summary__tile">
      <span>Mission Stars</span><b>${d.missionStars || 0}</b>
    </div>
    <div class="profile-summary__tile">
      <span>Daily Missions</span><b>${missionsDone} / 3</b>
    </div>
    <div class="profile-summary__tile">
      <span>${weekly.label}</span><b>${weeklyBestScore().toLocaleString()}</b>
    </div>
    <div class="profile-summary__hint">${nextUnlockHint()}</div>
  `;

  const titles = root.querySelector<HTMLElement>('[data-role="titles"]')!;
  const equipped = d.equippedTitleId || '';
  const titleButtons = [
    `<button type="button" class="profile-choice ${equipped ? '' : 'is-equipped'}" data-title-id="">
      <span>Auto Best</span><small>Highest earned title</small>
    </button>`,
    ...TITLES.map(t => {
      const ok = earned.has(t.id);
      const active = equipped === t.id && ok;
      return `<button type="button" class="profile-choice ${active ? 'is-equipped' : ''}" data-title-id="${t.id}" ${ok ? '' : 'disabled'}>
        <span>${t.label}</span><small>${ok ? (active ? 'Equipped' : 'Unlocked') : 'Locked'}</small>
      </button>`;
    }),
  ];
  titles.innerHTML = titleButtons.join('');

  const palettes = root.querySelector<HTMLElement>('[data-role="palettes"]')!;
  palettes.innerHTML = PLAYER_PALETTES.map(p => {
    const ok = p.unlocked();
    const active = (d.playerPaletteId || 'classic') === p.id && ok;
    return `<button type="button" class="profile-choice profile-palette ${active ? 'is-equipped' : ''}" data-palette-id="${p.id}" ${ok ? '' : 'disabled'}>
      <span class="profile-swatch" style="--c1:${p.colors.body};--c2:${p.colors.hat};--c3:${p.colors.accent}"></span>
      <span>${p.label}</span><small>${ok ? (active ? 'Equipped' : 'Unlocked') : paletteUnlockText(p.id)}</small>
    </button>`;
  }).join('');

  const contracts = root.querySelector<HTMLElement>('[data-role="contracts"]')!;
  contracts.innerHTML = TRICK_CONTRACTS.map(c => {
    const count = d.trickStats?.[c.id] || 0;
    const ratio = Math.min(1, count / c.target);
    return `<div class="profile-contract">
      <div class="profile-contract__top"><span>${c.label}</span><b>${count} / ${c.target}</b></div>
      <div class="profile-contract__bar"><span style="width:${(ratio * 100).toFixed(0)}%"></span></div>
      <small>Reward: ${c.title}</small>
    </div>`;
  }).join('');
}

function paletteUnlockText(id: string): string {
  switch (id) {
    case 'mint': return '75 lifetime pops';
    case 'sunburst': return '3-day streak';
    case 'violet': return '15 combo';
    case 'gold': return 'Earn a gold medal';
    case 'ruby': return '5 mission stars';
    case 'neon': return '12 mission stars';
    case 'rift': return 'Reach Panic Wave 8';
    default: return 'Locked';
  }
}
