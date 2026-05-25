/**
 * Pause overlay. Renders on top of the still-visible gameplay canvas.
 */

import { State } from '../../constants';
import { AudioSys } from '../../systems/audio';
import { isTouchDevice } from '../../systems/input';
import { Storage } from '../../systems/storage';
import type { Game } from '../../game';

function restartCurrentRun(game: Game) {
  if (game.mode === 'panic') return game.startPanic();
  if (game.mode === 'score_attack') return game.startScoreAttack();
  return game.loadLevel(game.levelIndex);
}

export function buildPause(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen pause overlay-screen';
  root.setAttribute('data-screen', 'paused');
  root.setAttribute('aria-label', 'Paused');

  const card = document.createElement('div');
  card.className = 'overlay-card';
  card.innerHTML = `
    <h2 class="ui-heading ui-heading--display overlay-card__title">Paused</h2>
    <div class="overlay-card__sub" data-role="level-name"></div>

    <div class="ui-card" style="padding: 14px;">
      <div style="font-size: var(--fs-micro); letter-spacing: 0.16em; opacity: 0.6; text-transform: uppercase; margin-bottom: 8px;">Controls</div>
      <div data-role="controls" style="display:flex;flex-direction:column;gap:6px;font-size:var(--fs-small);"></div>
    </div>

    <div class="pause__toggle" data-role="reduced">
      <span>Reduced motion</span>
      <div class="pause__toggle-switch"></div>
    </div>
    <div class="pause__toggle" data-role="mute">
      <span>Sound</span>
      <div class="pause__toggle-switch"></div>
    </div>

    <div class="overlay-card__actions">
      <button type="button" class="ui-btn ui-btn--ghost" data-role="restart">Restart</button>
      <button type="button" class="ui-btn ui-btn--cta"   data-role="resume">Resume</button>
      <button type="button" class="ui-btn ui-btn--ghost" data-role="menu">Main Menu</button>
    </div>
    <div class="overlay-card__hint">P or Esc to resume</div>
  `;
  root.appendChild(card);

  card.querySelector<HTMLElement>('[data-role="resume"]')!.addEventListener('click', () => {
    AudioSys.menu(); game.state = State.PLAYING;
  });
  card.querySelector<HTMLElement>('[data-role="restart"]')!.addEventListener('click', () => {
    AudioSys.menu(); restartCurrentRun(game);
  });
  card.querySelector<HTMLElement>('[data-role="menu"]')!.addEventListener('click', () => {
    AudioSys.menu(); game.state = State.MAIN_MENU;
  });
  card.querySelector<HTMLElement>('[data-role="reduced"]')!.addEventListener('click', () => {
    AudioSys.menu();
    Storage.data.reducedMotion = !Storage.data.reducedMotion;
    Storage.save();
  });
  card.querySelector<HTMLElement>('[data-role="mute"]')!.addEventListener('click', () => {
    AudioSys.toggle();
    AudioSys.menu();
  });

  return root;
}

export function syncPause(game: Game, root: HTMLElement) {
  const levelEl = root.querySelector<HTMLElement>('[data-role="level-name"]');
  if (levelEl && levelEl.textContent !== game.levelName) levelEl.textContent = game.levelName;

  const controls = root.querySelector<HTMLElement>('[data-role="controls"]');
  if (controls && !controls.dataset.populated) {
    controls.dataset.populated = '1';
    controls.innerHTML = isTouchDevice
      ? `<div>Use the on-screen buttons to move and fire.</div>
         <div>Tap the pause icon (top-right) to pause / resume.</div>`
      : `<div><strong>A / ←</strong> · <strong>D / →</strong>  Move</div>
         <div><strong>Space / W / ↑</strong>  Shoot</div>
         <div><strong>P</strong> or <strong>Esc</strong>  Pause     <strong>R</strong>  Restart     <strong>M</strong>  Mute</div>`;
  }

  const reduced = root.querySelector<HTMLElement>('[data-role="reduced"]');
  if (reduced) reduced.classList.toggle('is-on', !!Storage.data.reducedMotion);
  const mute = root.querySelector<HTMLElement>('[data-role="mute"]');
  if (mute) mute.classList.toggle('is-on', !AudioSys.muted);
}
