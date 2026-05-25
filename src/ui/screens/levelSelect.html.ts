/**
 * Level select grid. 18 cells in a 6×3 grid, each showing level number,
 * theme, and earned medal. Boss levels get a pink border accent.
 */

import { State } from '../../constants';
import { LEVELS } from '../../data/levels';
import { AudioSys } from '../../systems/audio';
import { Storage } from '../../systems/storage';
import type { Game } from '../../game';

function medalFor(targetScore: number, best: number): 'gold' | 'silver' | 'bronze' | null {
  if (best <= 0) return null;
  if (best >= targetScore * 1.5)  return 'gold';
  if (best >= targetScore * 1.25) return 'silver';
  if (best >= targetScore * 1.0)  return 'bronze';
  return null;
}

export function buildLevelSelect(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen levels menu-backdrop';
  root.setAttribute('data-screen', 'level_select');
  root.setAttribute('aria-label', 'Level select');

  const bubbles = document.createElement('div');
  bubbles.className = 'menu-bubbles';
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.setProperty('--i', String(i));
    bubbles.appendChild(b);
  }
  root.appendChild(bubbles);

  const title = document.createElement('h2');
  title.className = 'ui-heading ui-heading--display levels__title';
  title.textContent = 'Level Select';
  root.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'levels__grid';
  root.appendChild(grid);

  for (let i = 0; i < LEVELS.length; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'level-cell';
    if (LEVELS[i].boss) cell.classList.add('is-boss');
    cell.dataset.levelIndex = String(i);
    cell.innerHTML = `
      <span class="level-cell__num">${i + 1}</span>
      <span class="level-cell__medal" data-role="medal"></span>
      <span class="level-cell__theme">${LEVELS[i].theme}</span>
    `;
    cell.addEventListener('click', () => {
      if (cell.classList.contains('is-locked')) {
        AudioSys.hover();
        return;
      }
      AudioSys.menu();
      game.startTour(i);
    });
    grid.appendChild(cell);
  }

  const hint = document.createElement('div');
  hint.className = 'ui-back-hint';
  hint.textContent = 'Esc · back to modes';
  root.appendChild(hint);

  return root;
}

const MEDAL_GLYPH = { gold: '🥇 GOLD', silver: '🥈 SILVER', bronze: '🥉 BRONZE' };

export function syncLevelSelect(game: Game, root: HTMLElement) {
  const cells = root.querySelectorAll<HTMLElement>('.level-cell');
  for (const cell of cells) {
    const i = +(cell.dataset.levelIndex || '0');
    const L = LEVELS[i];
    const locked = i > game.unlockedLevel;
    cell.classList.toggle('is-locked', locked);
    const best = Storage.data.bestTour?.[L.id] || 0;
    const medal = medalFor(L.targetScore, best);
    const medalEl = cell.querySelector<HTMLElement>('[data-role="medal"]');
    if (medalEl) {
      const newText = locked ? '🔒' : (medal ? MEDAL_GLYPH[medal] : '— · — · —');
      if (medalEl.textContent !== newText) medalEl.textContent = newText;
      medalEl.className = 'level-cell__medal' + (medal ? ' medal--' + medal : '');
    }
  }
}
